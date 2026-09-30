package com.devsphere.ax.model;

import java.util.List;

public record AnalysisSummary(
        String projectId,
        int analyzedClasses,
        int nodeCount,
        int edgeCount,
        long analysisDurationMs,
        long controllers,
        long services,
        long repositories,
        long entities,
        long methods,
        long apis,
        long tests,
        List<GraphNode> nodes,
        List<GraphEdge> edges,
        List<String> warnings
) {
    public AnalysisSummary {
        projectId = projectId == null ? "" : projectId;
        nodes = nodes == null ? List.of() : List.copyOf(nodes);
        edges = edges == null ? List.of() : List.copyOf(edges);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
