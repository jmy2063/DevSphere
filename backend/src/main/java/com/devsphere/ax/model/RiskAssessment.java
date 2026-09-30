package com.devsphere.ax.model;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Change Risk Index (CRI). This is an explainable relative risk index, not a probability of failure.
 */
public record RiskAssessment(
        int score,
        String level,
        List<String> reasons,
        Map<String, Integer> breakdown,
        double evidenceConfidence,
        int blastRadius,
        int affectedServices,
        int affectedPackages,
        int affectedApis,
        int affectedDataObjects,
        int testCount,
        int pathCount
) {
    public RiskAssessment {
        if (score < 0 || score > 100) throw new IllegalArgumentException("CRI score must be between 0 and 100.");
        if (evidenceConfidence < 0.0 || evidenceConfidence > 1.0) throw new IllegalArgumentException("Evidence confidence must be between 0 and 1.");
        level = level == null ? "UNKNOWN" : level;
        reasons = reasons == null ? List.of() : List.copyOf(reasons);
        breakdown = breakdown == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(breakdown));
    }
}
