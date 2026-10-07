package com.devsphere.ax.service;

import com.devsphere.ax.analyzer.JavaStaticAnalyzer;
import com.devsphere.ax.graph.GraphBuilder;
import com.devsphere.ax.graph.GraphRegistry;
import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.impact.ImpactAnalyzer;
import com.devsphere.ax.model.*;
import com.devsphere.ax.util.SourceFingerprints;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

@Service
public class AnalysisService {
    private final GraphRegistry registry;
    private final Neo4jSyncService neo4j;
    private final JavaStaticAnalyzer analyzer = new JavaStaticAnalyzer();
    private final GraphBuilder builder = new GraphBuilder();
    private final ImpactAnalyzer impactAnalyzer = new ImpactAnalyzer();

    public AnalysisService(GraphRegistry registry, Neo4jSyncService neo4j) {
        this.registry = registry;
        this.neo4j = neo4j;
    }

    public AnalysisSummary analyze(Path sourceRoot, String suggestedName) throws IOException {
        long started = System.nanoTime();
        var parsed = analyzer.analyzeDirectoryDetailed(sourceRoot);
        var classes = parsed.classes();
        if (classes.isEmpty()) {
            throw new IllegalArgumentException("No Java source files were found. Upload a ZIP containing a Java/Spring Boot project.");
        }
        String projectId = uniqueProjectId(suggestedName);
        SoftwareGraph graph = builder.build(projectId, classes);
        Optional<String> evictedProject = registry.put(projectId, graph,SourceFingerprints.capture(sourceRoot));

        List<String> warnings = new ArrayList<>(parsed.warnings());
        evictedProject.ifPresent(id -> {
            Neo4jSyncService.SyncResult cleanup = neo4j.deleteProject(id);
            if (cleanup.attempted() && !cleanup.success()) warnings.add(cleanup.message());
        });
        Neo4jSyncService.SyncResult sync = neo4j.sync(projectId, graph);
        if (sync.attempted() && !sync.success()) warnings.add(sync.message());
        long durationMs = Math.max(1L, (System.nanoTime() - started) / 1_000_000L);
        return summary(projectId, graph, classes.size(), warnings, durationMs);
    }

    public AnalysisSummary summary(String projectId, SoftwareGraph graph) {
        return summary(projectId, graph, -1, List.of(), 0L);
    }

    private AnalysisSummary summary(String projectId, SoftwareGraph graph, int analyzedClasses, List<String> warnings, long durationMs) {
        List<GraphNode> nodes = graph.nodes().stream()
                .sorted(Comparator.comparing((GraphNode n) -> n.type().name()).thenComparing(GraphNode::name))
                .toList();
        return new AnalysisSummary(
                projectId,
                analyzedClasses < 0 ? (int) nodes.stream().filter(n -> isClassType(n.type())).count() : analyzedClasses,
                nodes.size(), graph.edges().size(), durationMs,
                count(nodes, NodeType.CONTROLLER), count(nodes, NodeType.SERVICE), count(nodes, NodeType.REPOSITORY),
                count(nodes, NodeType.ENTITY), count(nodes, NodeType.METHOD), count(nodes, NodeType.API), count(nodes, NodeType.TEST),
                nodes, graph.edges(), List.copyOf(warnings)
        );
    }

    public ImpactResult impact(String projectId, String nodeId, AnalysisScope scope, Integer depth) {
        SoftwareGraph graph = graph(projectId);
        if (nodeId == null || nodeId.isBlank()) throw new IllegalArgumentException("nodeId is required.");
        return impactAnalyzer.analyze(graph, nodeId, scope == null ? AnalysisScope.FEATURE : scope, depth);
    }

    /** Backward-compatible API for tests/tools that still pass only depth. */
    public ImpactResult impact(String projectId, String nodeId, int depth) {
        return impact(projectId, nodeId, depth <= 2 ? AnalysisScope.LOCAL : depth <= 4 ? AnalysisScope.FEATURE : AnalysisScope.SYSTEM, depth);
    }

    public SoftwareGraph graph(String projectId) {
        return registry.get(projectId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown or expired project: " + projectId));
    }

    public List<String> projectIds() { return registry.ids(); }
    public Map<String,String> sourceFingerprints(String projectId) {
        return registry.sourceFingerprints(projectId).orElseThrow(()->new IllegalArgumentException("Unknown or expired project: "+projectId));
    }
    public boolean removeProject(String projectId) {
        if (projectId == null || projectId.isBlank()) return false;
        boolean removed = registry.remove(projectId);
        neo4j.deleteProject(projectId); // best-effort optional persistence cleanup
        return removed;
    }

    private long count(List<GraphNode> nodes, NodeType type) { return nodes.stream().filter(n -> n.type() == type).count(); }

    private boolean isClassType(NodeType type) {
        return switch (type) {
            case CONTROLLER, SERVICE, REPOSITORY, ENTITY, CLASS, TEST -> true;
            default -> false;
        };
    }

    private String uniqueProjectId(String suggestedName) {
        String base = sanitize(suggestedName);
        for (int attempt = 0; attempt < 8; attempt++) {
            String candidate = base + "-" + UUID.randomUUID().toString().substring(0, 8);
            if (registry.get(candidate).isEmpty()) return candidate;
        }
        return base + "-" + UUID.randomUUID();
    }

    private String sanitize(String value) {
        if (value == null || value.isBlank()) return "project";
        String cleaned = value.replaceAll("(?i)\\.zip$", "").replaceAll("[^A-Za-z0-9._-]", "-").replaceAll("-+", "-");
        if (cleaned.isBlank()) cleaned = "project";
        return cleaned.length() > 48 ? cleaned.substring(0, 48) : cleaned;
    }
}
