package com.devsphere.ax.graph;

import com.devsphere.ax.model.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Builds a traceable software graph from Java/Spring AST facts. */
public class GraphBuilder {
    private static final Pattern GENERIC = Pattern.compile("<\\s*([A-Za-z_][A-Za-z0-9_.$]*)");

    public SoftwareGraph build(String projectId, List<ClassInfo> classes) {
        SoftwareGraph graph = new SoftwareGraph();
        ClassIndex index = new ClassIndex(classes);

        String projectNode = "project:" + projectId;
        graph.addNode(new GraphNode(projectNode, projectId, NodeType.PROJECT, "", 1, 1.0, Map.of()));

        for (ClassInfo c : classes) {
            String classId = classId(c);
            Map<String, String> attrs = new LinkedHashMap<>();
            attrs.put("fqcn", c.fqcn());
            attrs.put("package", c.packageName == null ? "" : c.packageName);
            attrs.put("endLine", Integer.toString(c.endLine));
            if (!c.annotations.isEmpty()) attrs.put("annotations", String.join(",", c.annotations));
            if (!c.extendsOrImplements.isBlank()) attrs.put("inheritance", c.extendsOrImplements);
            graph.addNode(new GraphNode(classId, c.className, c.type, c.sourcePath, c.line, 0.99, attrs));
            graph.addEdge(new GraphEdge(projectNode, classId, "CONTAINS", 1.0));

            for (var method : c.methodLines.entrySet()) {
                String key = method.getKey();
                String sourceName = c.methodNames.getOrDefault(key, key);
                int params = c.methodParameterCounts.getOrDefault(key, 0);
                Map<String,String> methodAttrs = new LinkedHashMap<>();
                methodAttrs.put("owner", c.className);
                methodAttrs.put("ownerFqcn", c.fqcn());
                methodAttrs.put("methodName", sourceName);
                methodAttrs.put("parameterCount", Integer.toString(params));
                List<String> parameterTypes = c.methodParameterTypes.getOrDefault(key, List.of());
                methodAttrs.put("parameterTypes", String.join(",", parameterTypes));
                methodAttrs.put("package", c.packageName == null ? "" : c.packageName);
                methodAttrs.put("endLine", Integer.toString(c.methodEndLines.getOrDefault(key, method.getValue())));
                String display = c.className + "." + sourceName + "(" + String.join(", ", parameterTypes) + ")";
                graph.addNode(new GraphNode(methodId(c, key), display, NodeType.METHOD,
                        c.sourcePath, method.getValue(), 0.98, methodAttrs));
                graph.addEdge(new GraphEdge(classId, methodId(c, key), "DECLARES", 1.0));
            }

            for (ApiMapping api : c.apis) {
                String apiId = "api:" + api.httpMethod() + ":" + api.path();
                graph.addNode(new GraphNode(apiId, api.httpMethod() + " " + api.path(), NodeType.API,
                        c.sourcePath, handlerStart(c, api.handlerMethod()), 0.99,
                        Map.of("handler", api.handlerMethod(), "controller", c.className,
                                "package", c.packageName == null ? "" : c.packageName)));
                graph.addEdge(new GraphEdge(classId, apiId, "EXPOSES", 0.99));
                List<String> handlerKeys = c.methodKeysByName(api.handlerMethod());
                double confidence = handlerKeys.size() <= 1 ? 0.99 : 0.88;
                for (String key : handlerKeys) {
                    String handlerId = methodId(c, key);
                    if (graph.node(handlerId).isPresent()) graph.addEdge(new GraphEdge(apiId, handlerId, "HANDLED_BY", confidence));
                }
            }

            if (c.type == NodeType.ENTITY) {
                String table = c.tableName.isBlank() ? defaultTableName(c.className) : c.tableName;
                String tableId = "table:" + table;
                graph.addNode(new GraphNode(tableId, table, NodeType.TABLE, c.sourcePath, c.line, 0.95,
                        Map.of("package", c.packageName == null ? "" : c.packageName)));
                graph.addEdge(new GraphEdge(classId, tableId, "MAPS_TO", 0.95));
            }
        }

        // Dependencies, inheritance and method-level calls.
        for (ClassInfo c : classes) {
            String sourceClassId = classId(c);

            for (String dep : c.dependencies) {
                index.resolve(dep).ifPresent(target -> {
                    String targetId = classId(target);
                    if (!targetId.equals(sourceClassId)) graph.addEdge(new GraphEdge(sourceClassId, targetId, relationFor(c.type), 0.93));
                });
            }

            for (String superType : c.superTypes) {
                index.resolve(superType).ifPresent(target -> {
                    String targetId = classId(target);
                    if (!targetId.equals(sourceClassId)) graph.addEdge(new GraphEdge(sourceClassId, targetId, "INHERITS", 0.90));
                });
            }

            if (c.type == NodeType.REPOSITORY && !c.extendsOrImplements.isBlank()) {
                Matcher matcher = GENERIC.matcher(c.extendsOrImplements);
                if (matcher.find()) {
                    index.resolve(matcher.group(1)).ifPresent(target ->
                            graph.addEdge(new GraphEdge(sourceClassId, classId(target), "MANAGES", 0.96)));
                }
            }

            for (var methodEntry : c.methodCalls.entrySet()) {
                String sourceKey = methodEntry.getKey();
                String sourceMethodId = methodId(c, sourceKey);
                Map<String, Set<Integer>> observedCounts = c.methodCallArgumentCounts.getOrDefault(sourceKey, Map.of());
                for (String call : methodEntry.getValue()) {
                    resolveInvocation(c, sourceKey, call, index).ifPresent(target -> {
                        List<String> allKeys = target.owner.methodKeysByName(target.methodName);
                        Set<Integer> argCounts = observedCounts.getOrDefault(call, Set.of());
                        List<String> targetKeys = allKeys;
                        if (!argCounts.isEmpty()) {
                            List<String> arityMatches = allKeys.stream()
                                    .filter(key -> argCounts.contains(target.owner.methodParameterCounts.getOrDefault(key, -1)))
                                    .toList();
                            if (!arityMatches.isEmpty()) targetKeys = arityMatches;
                        }
                        if (targetKeys.isEmpty()) {
                            graph.addEdge(new GraphEdge(sourceMethodId, classId(target.owner), "CALLS", 0.82));
                        } else {
                            double confidence = targetKeys.size() == 1 ? 0.95 : 0.76;
                            for (String key : targetKeys) {
                                String targetMethodId = methodId(target.owner, key);
                                if (graph.node(targetMethodId).isPresent()) {
                                    graph.addEdge(new GraphEdge(sourceMethodId, targetMethodId, "CALLS", confidence));
                                }
                            }
                        }
                    });
                }
            }
        }

        // Test links.
        for (ClassInfo c : classes) {
            if (c.type != NodeType.TEST) continue;
            String source = classId(c);
            String base = c.className.replaceFirst("(Tests?|IT)$", "");
            index.resolve(base).ifPresent(target -> graph.addEdge(new GraphEdge(source, classId(target), "TESTS", 0.92)));
            for (String dep : c.dependencies) {
                index.resolve(dep).ifPresent(target -> graph.addEdge(new GraphEdge(source, classId(target), "TESTS", 0.90)));
            }
        }
        return graph;
    }

    private int handlerStart(ClassInfo c, String sourceName) {
        return c.methodKeysByName(sourceName).stream().map(c.methodLines::get).filter(Objects::nonNull).min(Integer::compareTo).orElse(c.line);
    }

    private Optional<InvocationTarget> resolveInvocation(ClassInfo source, String sourceMethodKey, String call, ClassIndex index) {
        int dot = call.lastIndexOf('.');
        if (dot < 0) {
            String method = call.replaceAll("[^A-Za-z0-9_$].*", "");
            return source.methodKeysByName(method).isEmpty() ? Optional.empty() : Optional.of(new InvocationTarget(source, method));
        }
        String receiverExpr = call.substring(0, dot);
        String method = call.substring(dot + 1).replaceAll("[^A-Za-z0-9_$].*", "");
        int nestedDot = receiverExpr.lastIndexOf('.');
        String receiver = nestedDot >= 0 ? receiverExpr.substring(nestedDot + 1) : receiverExpr;

        if ("this".equals(receiver)) return Optional.of(new InvocationTarget(source, method));
        if ("super".equals(receiver)) {
            for (String superType : source.superTypes) {
                Optional<ClassInfo> owner = index.resolve(superType);
                if (owner.isPresent()) return owner.map(value -> new InvocationTarget(value, method));
            }
            return Optional.empty();
        }

        Map<String,String> locals = source.methodVariableTypes.getOrDefault(sourceMethodKey, Map.of());
        String declaredType = locals.get(receiver);
        if (declaredType == null) declaredType = source.fieldTypes.get(receiver);
        if (declaredType != null) return index.resolve(declaredType).map(owner -> new InvocationTarget(owner, method));
        if (!receiver.isBlank() && Character.isUpperCase(receiver.charAt(0))) {
            return index.resolve(receiver).map(owner -> new InvocationTarget(owner, method));
        }
        return Optional.empty();
    }

    private static String classId(ClassInfo c) { return "class:" + c.fqcn(); }
    private static String methodId(ClassInfo c, String key) { return classId(c) + "#" + key; }

    private static String relationFor(NodeType source) {
        return switch (source) {
            case CONTROLLER, SERVICE -> "USES";
            case REPOSITORY -> "MANAGES";
            case TEST -> "TESTS";
            default -> "DEPENDS_ON";
        };
    }

    private static String defaultTableName(String className) {
        return className.replaceAll("(?<!^)([A-Z])", "_$1").toLowerCase(Locale.ROOT);
    }

    private record InvocationTarget(ClassInfo owner, String methodName) {}

    private static final class ClassIndex {
        private final Map<String, ClassInfo> fq = new HashMap<>();
        private final Map<String, List<ClassInfo>> simple = new HashMap<>();
        ClassIndex(List<ClassInfo> classes) {
            for (ClassInfo c : classes) {
                fq.put(c.fqcn(), c);
                simple.computeIfAbsent(c.className, k -> new ArrayList<>()).add(c);
            }
        }
        Optional<ClassInfo> resolve(String name) {
            if (name == null || name.isBlank()) return Optional.empty();
            String clean = name.replace("? extends ", "").replace("? super ", "").trim();
            ClassInfo exact = fq.get(clean);
            if (exact != null) return Optional.of(exact);
            int dot = clean.lastIndexOf('.');
            String s = dot >= 0 ? clean.substring(dot + 1) : clean;
            List<ClassInfo> values = simple.getOrDefault(s, List.of());
            return values.size() == 1 ? Optional.of(values.get(0)) : Optional.empty();
        }
    }
}
