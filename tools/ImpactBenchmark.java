import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.evaluation.GroundTruthEvaluator;
import com.devsphere.ax.graph.*;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Offline AST -> graph -> traversal evaluation against independently authored fixture labels. */
public class ImpactBenchmark {
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args.length > 0 ? args[0] : ".").toAbsolutePath();
        Map<String, SoftwareGraph> graphs = new HashMap<>();
        List<String> report = new ArrayList<>(List.of(
                "project\tscenario\tchanged\tscope\tprecision\trecall\tf1\tfalse_positive\tfalse_negative\tmissed\tunexpected"));
        double precision = 0, recall = 0, f1 = 0;
        int count = 0, failures = 0;
        for (String line : Files.readAllLines(root.resolve("benchmarks/scenarios.tsv"), StandardCharsets.UTF_8)) {
            if (line.isBlank() || line.startsWith("#")) continue;
            String[] cells = line.split("\t", -1);
            if (cells.length != 5) throw new IllegalArgumentException("Invalid scenario row: " + line);
            String project = cells[0];
            if (!graphs.containsKey(project)) {
                var output = new JavaStaticAnalyzer().analyzeDirectoryDetailed(root.resolve("benchmarks/fixtures/" + project));
                if (!output.warnings().isEmpty()) throw new AssertionError(output.warnings());
                graphs.put(project, new GraphBuilder().build(project, output.classes()));
            }
            SoftwareGraph graph = graphs.get(project);
            String changed = graph.nodes().stream().filter(n -> n.name().equals(cells[2]))
                    .findFirst().orElseThrow().id();
            var result = new ImpactAnalyzer().analyze(graph, changed, AnalysisScope.from(cells[3]), null);
            var metrics = new GroundTruthEvaluator().evaluate(result, List.of(cells[4].split(",")), 5);
            precision += metrics.precision(); recall += metrics.recall(); f1 += metrics.f1(); count++;
            // Exact fixture expectations are deliberately stricter than production KPI targets.
            if (metrics.falsePositive() != 0 || metrics.falseNegative() != 0) failures++;
            report.add(String.join("\t", cells[0], cells[1], cells[2], cells[3],
                    Double.toString(metrics.precision()), Double.toString(metrics.recall()), Double.toString(metrics.f1()),
                    Integer.toString(metrics.falsePositive()), Integer.toString(metrics.falseNegative()),
                    String.join(",", metrics.missed()), String.join(",", metrics.unexpected())));
        }
        if (count < 30 || graphs.size() < 3) throw new AssertionError("Benchmark requires 30 scenarios across 3 fixtures");
        Path output = root.resolve("benchmark-output"); Files.createDirectories(output);
        Files.write(output.resolve("impact-results.tsv"), report, StandardCharsets.UTF_8);
        String summary = String.format(Locale.ROOT,
                "Synthetic fixture benchmark: %d scenarios / %d projects%nMacro precision %.4f / recall %.4f / F1 %.4f%nFailed exact expectations: %d%nThese results do not measure real-world Spring project accuracy.%n",
                count, graphs.size(), precision/count, recall/count, f1/count, failures);
        Files.writeString(output.resolve("summary.txt"), summary, StandardCharsets.UTF_8);
        System.out.print(summary);
        if (failures > 0) throw new AssertionError("Inspect benchmark-output/impact-results.tsv");
    }
}
