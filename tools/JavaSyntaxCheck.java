import com.sun.source.util.JavacTask;
import javax.tools.*;
import java.nio.file.*;
import java.util.*;

/** Parses Java sources without requiring Spring/Neo4j dependencies to resolve. */
public class JavaSyntaxCheck {
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args.length > 0 ? args[0] : "backend/src/main/java");
        List<Path> files;
        try (var s = Files.walk(root)) {
            files = s.filter(Files::isRegularFile).filter(p -> p.toString().endsWith(".java")).sorted().toList();
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("JDK compiler not available");
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diagnostics, Locale.ROOT, null)) {
            var units = fm.getJavaFileObjectsFromPaths(files);
            JavacTask task = (JavacTask) compiler.getTask(null, fm, diagnostics, List.of("-proc:none"), null, units);
            task.parse();
        }
        long errors = diagnostics.getDiagnostics().stream().filter(d -> d.getKind() == Diagnostic.Kind.ERROR).count();
        diagnostics.getDiagnostics().stream().filter(d -> d.getKind() == Diagnostic.Kind.ERROR).forEach(System.err::println);
        System.out.println("JAVA_PARSE files=" + files.size() + " errors=" + errors);
        if (errors > 0) System.exit(1);
    }
}
