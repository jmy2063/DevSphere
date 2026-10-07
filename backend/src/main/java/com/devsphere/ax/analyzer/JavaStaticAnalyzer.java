package com.devsphere.ax.analyzer;

import com.devsphere.ax.model.ApiMapping;
import com.devsphere.ax.model.ClassInfo;
import com.devsphere.ax.model.NodeType;
import com.sun.source.tree.*;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreeScanner;
import com.sun.source.util.Trees;

import javax.tools.*;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * JDK AST based Java/Spring analyzer.
 * The analyzer intentionally does not require the target project to compile.
 */
public class JavaStaticAnalyzer {
    private static final int MAX_JAVA_FILES = 5_000;
    private static final long MAX_JAVA_FILE_BYTES = 5L * 1024 * 1024;
    private static final int MAX_DIAGNOSTIC_WARNINGS = 20;
    private static final Set<String> IGNORED_DIRECTORY_NAMES = Set.of(
            ".git", ".gradle", "build", "target", "node_modules", "dist", "out"
    );
    private static final Set<String> SPRING_TYPES = Set.of(
            "RestController", "Controller", "Service", "Repository", "Entity"
    );

    /** Backward-compatible helper used by the core tests/tools. */
    public List<ClassInfo> analyzeDirectory(Path root) throws IOException {
        return analyzeDirectoryDetailed(root).classes();
    }

    /**
     * Parses Java sources and returns partial AST facts together with parse diagnostics.
     * A single malformed source file does not erase facts successfully parsed from other files.
     */
    public AnalysisOutput analyzeDirectoryDetailed(Path root) throws IOException {
        Path normalizedRoot = root.toAbsolutePath().normalize();
        if (!Files.isDirectory(normalizedRoot)) {
            throw new IllegalArgumentException("Source directory does not exist: " + root);
        }

        List<Path> javaFiles = sourceFiles(normalizedRoot);
        if (javaFiles.isEmpty()) return new AnalysisOutput(List.of(), List.of());

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            throw new IllegalStateException("JDK compiler not available. Run DevSphere AX with JDK 17+.");
        }

        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            Iterable<? extends JavaFileObject> units = fm.getJavaFileObjectsFromPaths(javaFiles);
            JavacTask task = (JavacTask) compiler.getTask(null, fm, diagnostics,
                    List.of("-proc:none", "-Xlint:none", "-implicit:none"), null, units);
            Iterable<? extends CompilationUnitTree> parsed = task.parse();
            Trees trees = Trees.instance(task);
            SourcePositions positions = trees.getSourcePositions();

            List<ClassInfo> result = new ArrayList<>();
            for (CompilationUnitTree cu : parsed) {
                String packageName = cu.getPackageName() == null ? "" : cu.getPackageName().toString();
                Path absoluteSource = Path.of(cu.getSourceFile().toUri()).toAbsolutePath().normalize();
                String sourcePath;
                try {
                    sourcePath = normalizedRoot.relativize(absoluteSource).toString().replace('\\', '/');
                } catch (IllegalArgumentException ex) {
                    sourcePath = absoluteSource.getFileName().toString();
                }
                for (Tree declaration : cu.getTypeDecls()) {
                    if (declaration instanceof ClassTree ct && !ct.getSimpleName().toString().isBlank()) {
                        result.add(readClass(cu, ct, positions, packageName, sourcePath));
                    }
                }
            }
            return new AnalysisOutput(List.copyOf(result), diagnosticsToWarnings(normalizedRoot, diagnostics.getDiagnostics()));
        }
    }

    /** Shared selection for parsing and byte-level source fingerprints. */
    public static List<Path> sourceFiles(Path root) throws IOException {
        Path normalizedRoot = root.toAbsolutePath().normalize();
        List<Path> javaFiles;
        try (var stream = Files.walk(normalizedRoot)) {
            javaFiles = stream.filter(Files::isRegularFile)
                    .filter(p -> isIncludedSourcePath(normalizedRoot.relativize(p).toString().replace('\\','/')))
                    .sorted().toList();
        }
        if (javaFiles.size() > MAX_JAVA_FILES) {
            throw new IllegalArgumentException("Project contains too many Java files (max " + MAX_JAVA_FILES + ").");
        }
        for (Path file : javaFiles) {
            if (Files.size(file) > MAX_JAVA_FILE_BYTES) {
                throw new IllegalArgumentException("Java source file exceeds 5 MB limit: " + normalizedRoot.relativize(file));
            }
        }

        return javaFiles;
    }

    private List<String> diagnosticsToWarnings(Path root, List<Diagnostic<? extends JavaFileObject>> diagnostics) {
        List<Diagnostic<? extends JavaFileObject>> important = diagnostics.stream()
                .filter(d -> d.getKind() == Diagnostic.Kind.ERROR
                        || d.getKind() == Diagnostic.Kind.WARNING
                        || d.getKind() == Diagnostic.Kind.MANDATORY_WARNING)
                .toList();
        if (important.isEmpty()) return List.of();

        long errors = important.stream().filter(d -> d.getKind() == Diagnostic.Kind.ERROR).count();
        List<String> warnings = new ArrayList<>();
        if (errors > 0) {
            warnings.add("Java parser reported " + errors + " syntax diagnostic(s). DevSphere used the successfully parsed AST portions; verify affected source files before relying on those paths.");
        }
        for (Diagnostic<? extends JavaFileObject> d : important.stream().limit(MAX_DIAGNOSTIC_WARNINGS).toList()) {
            String source = "unknown source";
            if (d.getSource() != null) {
                try {
                    Path p = Path.of(d.getSource().toUri()).toAbsolutePath().normalize();
                    source = p.startsWith(root) ? root.relativize(p).toString().replace('\\', '/') : p.getFileName().toString();
                } catch (Exception ignored) {
                    source = d.getSource().getName();
                }
            }
            warnings.add(d.getKind() + " " + source + ":" + Math.max(1, d.getLineNumber()) + " — "
                    + sanitizeDiagnostic(d.getMessage(Locale.ROOT)));
        }
        if (important.size() > MAX_DIAGNOSTIC_WARNINGS) {
            warnings.add("Additional Java diagnostics omitted: " + (important.size() - MAX_DIAGNOSTIC_WARNINGS));
        }
        return List.copyOf(warnings);
    }

    private String sanitizeDiagnostic(String value) {
        if (value == null || value.isBlank()) return "Java parse diagnostic";
        return value.replaceAll("[\\r\\n]+", " ").trim();
    }

    private ClassInfo readClass(CompilationUnitTree cu, ClassTree ct, SourcePositions positions,
                                String packageName, String sourcePath) {
        ClassInfo info = new ClassInfo();
        info.packageName = packageName;
        info.className = ct.getSimpleName().toString();
        info.sourcePath = sourcePath;
        info.line = lineOf(cu, ct, positions);
        info.endLine = endLineOf(cu, ct, positions, info.line);
        for (ImportTree imported : cu.getImports()) {
            if (imported.isStatic()) continue;
            String qualified = imported.getQualifiedIdentifier().toString();
            if (qualified.endsWith(".*")) info.wildcardImports.add(qualified.substring(0, qualified.length()-2));
            else info.imports.put(simpleName(qualified), qualified);
        }

        for (AnnotationTree annotation : ct.getModifiers().getAnnotations()) {
            String name = simpleName(annotation.getAnnotationType().toString());
            info.annotations.add(name);
            if (SPRING_TYPES.contains(name)) info.type = mapType(name);
            if ("Table".equals(name)) info.tableName = firstAnnotationString(annotation).orElse("");
        }
        if (looksLikeTestClass(info.className, info.annotations)) info.type = NodeType.TEST;

        String ext = ct.getExtendsClause() == null ? "" : ct.getExtendsClause().toString();
        if (!ext.isBlank()) info.superTypes.add(cleanType(ext));
        for (Tree impl : ct.getImplementsClause()) {
            String t = cleanType(impl.toString());
            if (!t.isBlank()) info.superTypes.add(t);
        }
        String impl = ct.getImplementsClause().stream().map(Object::toString).collect(Collectors.joining(","));
        info.extendsOrImplements = (ext + " " + impl).trim();
        // Spring Data interfaces do not need @Repository. Resolve the imported base
        // rather than trusting a user-defined type with the same simple name.
        if (info.type == NodeType.CLASS && ct.getKind() == Tree.Kind.INTERFACE && info.superTypes.stream().anyMatch(t -> {
            String qualified = info.imports.getOrDefault(t, t);
            return Set.of("org.springframework.data.repository.Repository",
                    "org.springframework.data.repository.CrudRepository",
                    "org.springframework.data.repository.ListCrudRepository",
                    "org.springframework.data.repository.PagingAndSortingRepository",
                    "org.springframework.data.repository.ListPagingAndSortingRepository",
                    "org.springframework.data.jpa.repository.JpaRepository").contains(qualified);
        })) info.type = NodeType.REPOSITORY;

        String classBasePath = requestPath(ct.getModifiers().getAnnotations());
        for (Tree member : ct.getMembers()) {
            if (member instanceof VariableTree variable) {
                registerVariableDependency(info, variable);
            } else if (member instanceof MethodTree method) {
                readMethod(cu, method, positions, info, classBasePath);
            }
        }
        return info;
    }

    private void registerVariableDependency(ClassInfo info, VariableTree variable) {
        if (variable.getType() == null) return;
        String rawType = variable.getType().toString();
        String declared = cleanType(rawType);
        String simple = simpleName(declared);
        if (!simple.isBlank()) info.fieldTypes.put(variable.getName().toString(), declared);
        addTypeDependencies(info.dependencies, rawType);
    }

    private void readMethod(CompilationUnitTree cu, MethodTree method, SourcePositions positions,
                            ClassInfo info, String classBasePath) {
        String methodName = method.getName().toString();
        boolean constructor = "<init>".equals(methodName);

        Map<String, String> variableTypes = new LinkedHashMap<>();
        List<String> parameterTypes = new ArrayList<>();
        for (VariableTree parameter : method.getParameters()) {
            String rawType = parameter.getType().toString();
            String type = cleanType(rawType);
            parameterTypes.add(readableType(rawType));
            if (!type.isBlank()) variableTypes.put(parameter.getName().toString(), type);
            addTypeDependencies(info.dependencies, rawType);
            if (constructor && !type.isBlank()) info.fieldTypes.putIfAbsent(parameter.getName().toString(), type);
        }

        // Return types also expose domain/data dependencies (e.g. Repository methods returning Entity).
        if (!constructor && method.getReturnType() != null) {
            addTypeDependencies(info.dependencies, method.getReturnType().toString());
        }

        if (!constructor) {
            int start = lineOf(cu, method, positions);
            int end = endLineOf(cu, method, positions, start);
            String key = uniqueMethodKey(info, methodName, start);
            info.methodLines.put(key, start);
            info.methodEndLines.put(key, end);
            info.methodNames.put(key, methodName);
            info.methodParameterCounts.put(key, method.getParameters().size());
            info.methodParameterTypes.put(key, List.copyOf(parameterTypes));

            Set<String> calls = new LinkedHashSet<>();
            Map<String, Set<Integer>> argumentCounts = new LinkedHashMap<>();
            scanMethodBody(method, calls, argumentCounts, variableTypes, info.dependencies);
            info.methodCalls.put(key, calls);
            info.methodCallArgumentCounts.put(key, argumentCounts);
            info.methodVariableTypes.put(key, Map.copyOf(variableTypes));
            ApiMapping api = apiMapping(method, classBasePath);
            if (api != null) info.apis.add(api);
        }

        for (AnnotationTree annotation : method.getModifiers().getAnnotations()) {
            if ("Test".equals(simpleName(annotation.getAnnotationType().toString()))) info.type = NodeType.TEST;
        }
    }

    private String uniqueMethodKey(ClassInfo info, String methodName, int line) {
        if (!info.methodLines.containsKey(methodName)) return methodName;
        return methodName + "@" + line;
    }

    private void scanMethodBody(MethodTree method,
                                Set<String> calls,
                                Map<String, Set<Integer>> argumentCounts,
                                Map<String, String> variableTypes,
                                Set<String> dependencies) {
        if (method.getBody() == null) return;
        new TreeScanner<Void, Void>() {
            @Override public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
                String selector = node.getMethodSelect().toString();
                calls.add(selector);
                argumentCounts.computeIfAbsent(selector, k -> new LinkedHashSet<>()).add(node.getArguments().size());
                return super.visitMethodInvocation(node, unused);
            }

            @Override public Void visitVariable(VariableTree node, Void unused) {
                if (node.getType() != null) {
                    String rawType = node.getType().toString();
                    String type = cleanType(rawType);
                    if (!type.isBlank()) variableTypes.putIfAbsent(node.getName().toString(), type);
                    addTypeDependencies(dependencies, rawType);
                }
                return super.visitVariable(node, unused);
            }
        }.scan(method.getBody(), null);
    }

    private ApiMapping apiMapping(MethodTree method, String classBasePath) {
        for (AnnotationTree annotation : method.getModifiers().getAnnotations()) {
            String name = simpleName(annotation.getAnnotationType().toString());
            String http = switch (name) {
                case "GetMapping" -> "GET";
                case "PostMapping" -> "POST";
                case "PutMapping" -> "PUT";
                case "DeleteMapping" -> "DELETE";
                case "PatchMapping" -> "PATCH";
                case "RequestMapping" -> requestMethod(annotation).orElse("REQUEST");
                default -> null;
            };
            if (http != null) {
                String methodPath = firstAnnotationString(annotation).orElse("");
                String path = joinPath(classBasePath, methodPath);
                return new ApiMapping(http, path.isBlank() ? "/" : path, method.getName().toString());
            }
        }
        return null;
    }

    private String requestPath(List<? extends AnnotationTree> annotations) {
        for (AnnotationTree annotation : annotations) {
            if ("RequestMapping".equals(simpleName(annotation.getAnnotationType().toString()))) {
                return firstAnnotationString(annotation).orElse("");
            }
        }
        return "";
    }

    private Optional<String> requestMethod(AnnotationTree annotation) {
        String text = annotation.toString();
        for (String method : List.of("GET", "POST", "PUT", "DELETE", "PATCH")) {
            if (text.contains("RequestMethod." + method)) return Optional.of(method);
        }
        return Optional.empty();
    }

    private Optional<String> firstAnnotationString(AnnotationTree annotation) {
        for (ExpressionTree arg : annotation.getArguments()) {
            Optional<String> value = firstStringLiteral(arg);
            if (value.isPresent()) return value;
        }
        return Optional.empty();
    }

    private Optional<String> firstStringLiteral(Tree tree) {
        if (tree instanceof AssignmentTree assignment) return firstStringLiteral(assignment.getExpression());
        if (tree instanceof LiteralTree literal && literal.getValue() instanceof String s) return Optional.of(s);
        if (tree instanceof NewArrayTree array) {
            for (ExpressionTree initializer : Optional.ofNullable(array.getInitializers()).orElse(List.of())) {
                Optional<String> found = firstStringLiteral(initializer);
                if (found.isPresent()) return found;
            }
        }
        return Optional.empty();
    }

    public static boolean isIncludedSourcePath(String path) {
        if (path == null || !path.endsWith(".java")) return false;
        for (String part : path.replace('\\','/').split("/"))
            if (IGNORED_DIRECTORY_NAMES.contains(part.toLowerCase(Locale.ROOT))) return false;
        return true;
    }

    private int lineOf(CompilationUnitTree cu, Tree tree, SourcePositions positions) {
        long pos = positions.getStartPosition(cu, tree);
        return pos >= 0 ? (int) cu.getLineMap().getLineNumber(pos) : 1;
    }

    private int endLineOf(CompilationUnitTree cu, Tree tree, SourcePositions positions, int fallback) {
        long pos = positions.getEndPosition(cu, tree);
        if (pos < 0) return fallback;
        long adjusted = Math.max(0, pos - 1);
        return Math.max(fallback, (int) cu.getLineMap().getLineNumber(adjusted));
    }

    private static boolean looksLikeTestClass(String className, Collection<String> annotations) {
        return className.endsWith("Test") || className.endsWith("Tests") || className.endsWith("IT") || annotations.contains("SpringBootTest");
    }

    private static String joinPath(String a, String b) {
        String left = a == null ? "" : a.trim();
        String right = b == null ? "" : b.trim();
        String value = (left + "/" + right).replaceAll("/+", "/");
        if (!value.startsWith("/") && !value.isBlank()) value = "/" + value;
        return value.endsWith("/") && value.length() > 1 ? value.substring(0, value.length() - 1) : value;
    }

    private static NodeType mapType(String annotation) {
        return switch (annotation) {
            case "RestController", "Controller" -> NodeType.CONTROLLER;
            case "Service" -> NodeType.SERVICE;
            case "Repository" -> NodeType.REPOSITORY;
            case "Entity" -> NodeType.ENTITY;
            default -> NodeType.CLASS;
        };
    }

    private static void addTypeDependencies(Set<String> dependencies, String rawType) {
        if (rawType == null || rawType.isBlank()) return;
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("[A-Za-z_$][A-Za-z0-9_$.]*")
                .matcher(rawType);
        while (matcher.find()) {
            String token = matcher.group();
            String simple = simpleName(token);
            if (!isJdkLike(simple) && !Set.of("extends", "super", "var").contains(simple)) {
                dependencies.add(token);
            }
        }
    }

    private static String readableType(String rawType) {
        if (rawType == null || rawType.isBlank()) return "?";
        String value = rawType.replaceAll("\\s+", "").trim();
        // Keep generic/array structure but remove package qualifiers for a compact method signature.
        return value.replaceAll("(?:[A-Za-z_$][A-Za-z0-9_$]*\\.)+([A-Za-z_$][A-Za-z0-9_$]*)", "$1");
    }

    private static String cleanType(String raw) {
        if (raw == null) return "";
        String value = raw.trim();
        while (value.endsWith("[]")) value = value.substring(0, value.length() - 2);
        int generic = value.indexOf('<');
        if (generic >= 0) value = value.substring(0, generic);
        return value;
    }

    private static boolean isJdkLike(String simpleType) {
        if (simpleType == null || simpleType.isBlank()) return true;
        return Set.of("String", "int", "long", "double", "float", "boolean", "byte", "short", "char",
                "Integer", "Long", "Double", "Float", "Boolean", "Byte", "Short", "Character", "Object", "Void",
                "List", "Set", "Map", "Optional", "Collection", "Iterable", "UUID", "LocalDate", "LocalDateTime",
                "BigDecimal", "BigInteger").contains(simpleType);
    }

    public static String simpleName(String name) {
        if (name == null) return "";
        String n = name.trim();
        int generic = n.indexOf('<');
        if (generic >= 0) n = n.substring(0, generic);
        int array = n.indexOf('[');
        if (array >= 0) n = n.substring(0, array);
        int dot = Math.max(n.lastIndexOf('.'), n.lastIndexOf('$'));
        return dot >= 0 ? n.substring(dot + 1) : n;
    }

    public record AnalysisOutput(List<ClassInfo> classes, List<String> warnings) {
        public AnalysisOutput {
            classes = classes == null ? List.of() : List.copyOf(classes);
            warnings = warnings == null ? List.of() : List.copyOf(warnings);
        }
    }
}
