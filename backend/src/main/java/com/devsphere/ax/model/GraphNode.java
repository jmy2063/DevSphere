package com.devsphere.ax.model;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public record GraphNode(
        String id,
        String name,
        NodeType type,
        String sourcePath,
        int line,
        double confidence,
        Map<String, String> attributes
) {
    public GraphNode {
        id = requireText(id, "node id");
        name = requireText(name, "node name");
        type = Objects.requireNonNull(type, "node type");
        sourcePath = sourcePath == null ? "" : sourcePath;
        if (line < 1) throw new IllegalArgumentException("Node line must be >= 1.");
        if (!Double.isFinite(confidence) || confidence < 0.0 || confidence > 1.0) {
            throw new IllegalArgumentException("Node confidence must be between 0 and 1.");
        }
        attributes = attributes == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(attributes));
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + " is required.");
        return value;
    }
}
