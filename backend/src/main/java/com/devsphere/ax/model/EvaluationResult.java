package com.devsphere.ax.model;

import java.util.List;

/** Ground-truth evaluation metrics for one change-impact scenario. */
public record EvaluationResult(
        String changedNode,
        String scope,
        int expectedCount,
        int predictedCount,
        int truePositive,
        int falsePositive,
        int falseNegative,
        double precision,
        double recall,
        double f1,
        int topK,
        double topKRecall,
        List<String> matched,
        List<String> missed,
        List<String> unexpected
) {
    public EvaluationResult {
        matched = matched == null ? List.of() : List.copyOf(matched);
        missed = missed == null ? List.of() : List.copyOf(missed);
        unexpected = unexpected == null ? List.of() : List.copyOf(unexpected);
    }
}
