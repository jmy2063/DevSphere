import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.AnalysisScope;
import com.devsphere.ax.model.NodeType;
import java.nio.file.Path;

public class CoreSmoke {
    public static void main(String[] args) throws Exception {
        var classes = new JavaStaticAnalyzer().analyzeDirectory(Path.of(args[0]));
        var graph = new GraphBuilder().build("sample", classes);
        System.out.printf("classes=%d nodes=%d edges=%d%n", classes.size(), graph.nodes().size(), graph.edges().size());

        var changed = graph.nodes().stream().filter(n -> n.name().equals("OrderService") && n.type()==NodeType.SERVICE).findFirst().orElseThrow();
        var engine = new ImpactAnalyzer();
        for (var scope : AnalysisScope.values()) {
            var r = engine.analyze(graph, changed.id(), scope, null);
            System.out.printf("scope=%s risk=%s cri=%d blastRadius=%d evidence=%.0f%% paths=%d%n",
                    scope, r.riskLevel(), r.riskScore(), r.blastRadius(), r.evidenceConfidence()*100, r.paths().size());
        }

        var method = graph.nodes().stream().filter(n -> n.name().equals("OrderService.createOrder()") && n.type()==NodeType.METHOD).findFirst().orElseThrow();
        var methodResult = engine.analyze(graph, method.id(), AnalysisScope.SYSTEM, null);
        System.out.println("method=" + methodResult.changedNodeName() + " risk=" + methodResult.riskLevel() + " cri=" + methodResult.riskScore());
        methodResult.paths().stream().limit(5).forEach(p -> {
            System.out.printf("  path %.0f%%: ", p.pathConfidence()*100);
            System.out.println(p.steps().stream().map(s -> s.name()+"["+s.sourcePath()+":"+s.line()+"-"+s.endLine()+"]").reduce((a,b)->a+" -> "+b).orElse(""));
        });
    }
}
