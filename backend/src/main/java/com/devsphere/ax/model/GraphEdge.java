package com.devsphere.ax.model;

public record GraphEdge(
        String source,
        String target,
        String type,
        double confidence
) {
    public GraphEdge {
        if (source == null || source.isBlank()) throw new IllegalArgumentException("Edge source is required.");
        if (target == null || target.isBlank()) throw new IllegalArgumentException("Edge target is required.");
        if (type == null || type.isBlank()) throw new IllegalArgumentException("Edge type is required.");
        if (!Double.isFinite(confidence) || confidence < 0.0 || confidence > 1.0) {
            throw new IllegalArgumentException("Edge confidence must be between 0 and 1.");
        }
    }
}
