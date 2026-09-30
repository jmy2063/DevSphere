package com.devsphere.ax;

import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.evaluation.GroundTruthEvaluator;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.AnalysisScope;
import com.devsphere.ax.model.GraphNode;
import com.devsphere.ax.model.NodeType;
import com.devsphere.ax.util.UnifiedDiffParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AdvancedCoreTest {
    @TempDir Path temp;

    @Test
    void preservesGenericDependencyAndResolvesExplicitThisCall() throws Exception {
        write("Entity.java", "class Entity {} ");
        write("Service.java", "import java.util.List; class Service { List<Entity> load(){ this.audit(); return null; } void audit(){} }");
        var graph = new GraphBuilder().build("advanced", new JavaStaticAnalyzer().analyzeDirectory(temp));
        var service = graph.nodes().stream().filter(n -> n.name().equals("Service") && n.type()==NodeType.CLASS).findFirst().orElseThrow();
        var load = graph.nodes().stream().filter(n -> n.name().equals("Service.load()") && n.type()==NodeType.METHOD).findFirst().orElseThrow();
        assertTrue(graph.outgoing(service.id()).stream().anyMatch(e -> graph.node(e.target()).map(n -> n.name().equals("Entity")).orElse(false)));
        assertTrue(graph.outgoing(load.id()).stream().anyMatch(e -> graph.node(e.target()).map(n -> n.name().equals("Service.audit()")).orElse(false)));
    }

    @Test
    void overloadsHaveDistinctReadableSignatures() throws Exception {
        write("Over.java", "class Over { void pay(){} void pay(String channel){} }");
        var graph = new GraphBuilder().build("over", new JavaStaticAnalyzer().analyzeDirectory(temp));
        assertTrue(graph.nodes().stream().anyMatch(n -> n.name().equals("Over.pay()")));
        assertTrue(graph.nodes().stream().anyMatch(n -> n.name().equals("Over.pay(String)")));
    }

    @Test
    void unifiedDiffKeepsBaseAndHeadLineNumbersSeparate() {
        var lines = UnifiedDiffParser.changedLines("@@ -10,1 +30,1 @@\n-old\n+new");
        assertEquals(java.util.Set.of(10), lines.oldLines());
        assertEquals(java.util.Set.of(30), lines.newLines());
    }

    @Test
    void graphNodeDefensivelyCopiesAttributes() {
        var attrs = new java.util.LinkedHashMap<>(Map.of("a", "b"));
        GraphNode node = new GraphNode("id", "name", NodeType.CLASS, "A.java", 1, 1.0, attrs);
        attrs.put("x", "y");
        assertFalse(node.attributes().containsKey("x"));
        assertThrows(UnsupportedOperationException.class, () -> node.attributes().put("z", "w"));
    }

    @Test
    void groundTruthAliasDoesNotInflateMetrics() throws Exception {
        write("A.java", "class A { void x(){ y(); } void y(){} }");
        var graph = new GraphBuilder().build("eval", new JavaStaticAnalyzer().analyzeDirectory(temp));
        var x = graph.nodes().stream().filter(n -> n.name().equals("A.x()")).findFirst().orElseThrow();
        var result = new ImpactAnalyzer().analyze(graph, x.id(), AnalysisScope.LOCAL, null);
        var target = result.directImpact().stream().findFirst().orElseThrow();
        var eval = new GroundTruthEvaluator().evaluate(result, List.of(target.id(), target.name()), 5);
        assertTrue(eval.precision() >= 0 && eval.precision() <= 1);
        assertTrue(eval.recall() >= 0 && eval.recall() <= 1);
        assertEquals(1, eval.expectedCount());
    }

    private void write(String relative, String text) throws Exception {
        Path path = temp.resolve(relative);
        if (path.getParent() != null) Files.createDirectories(path.getParent());
        Files.writeString(path, text);
    }
}
