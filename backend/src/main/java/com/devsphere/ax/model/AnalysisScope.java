package com.devsphere.ax.model;

/**
 * Analysis scope controls how far impact propagation is explored.
 * The wider scopes use confidence pruning and node caps instead of raw unbounded BFS.
 */
public enum AnalysisScope {
    LOCAL(2, 0.55, 120),
    FEATURE(4, 0.35, 350),
    SYSTEM(6, 0.20, 1000);

    private final int defaultDepth;
    private final double minConfidence;
    private final int nodeLimit;

    AnalysisScope(int defaultDepth, double minConfidence, int nodeLimit) {
        this.defaultDepth = defaultDepth;
        this.minConfidence = minConfidence;
        this.nodeLimit = nodeLimit;
    }

    public int defaultDepth() { return defaultDepth; }
    public double minConfidence() { return minConfidence; }
    public int nodeLimit() { return nodeLimit; }

    public static AnalysisScope from(String value) {
        if (value == null || value.isBlank()) return FEATURE;
        try { return AnalysisScope.valueOf(value.trim().toUpperCase()); }
        catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Invalid analysis scope. Use LOCAL, FEATURE, or SYSTEM.");
        }
    }
}
