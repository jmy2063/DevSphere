import com.devsphere.ax.evaluation.GroundTruthEvaluator;
import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import java.util.*;

/** Evaluation must not silently choose between nodes with identical display names. */
public class EvaluationRegression {
    public static void main(String[] args) {
        SoftwareGraph graph = new SoftwareGraph();
        for (String id : List.of("root", "class:a.Shared", "class:b.Shared")) {
            graph.addNode(new GraphNode(id, id.equals("root") ? "Root" : "Shared",
                    NodeType.SERVICE, "Source.java", 1, 1, Map.of()));
        }
        graph.addEdge(new GraphEdge("root", "class:a.Shared", "USES", .99));
        graph.addEdge(new GraphEdge("root", "class:b.Shared", "USES", .99));
        var result = new ImpactAnalyzer().analyze(graph, "root", AnalysisScope.LOCAL, null);
        var evaluator = new GroundTruthEvaluator();
        try {
            evaluator.evaluate(result, List.of("Shared"), 5);
            throw new AssertionError("Ambiguous display name must require a node ID");
        } catch (IllegalArgumentException expected) {
            if (!expected.getMessage().contains("Node ID")) throw expected;
        }
        var exact = evaluator.evaluate(result, List.of("class:a.Shared", "class:b.Shared"), 5);
        if (exact.expectedCount() != 2 || exact.f1() != 1) throw new AssertionError("Exact IDs must identify both nodes");
        var alias = evaluator.evaluate(result, List.of("root", "not-predicted"), 5);
        if (alias.falseNegative() != 2) throw new AssertionError("Unknown targets must remain false negatives");
        System.out.println("PASS: ambiguous names rejected, exact IDs scored, missing targets retained");
    }
}
