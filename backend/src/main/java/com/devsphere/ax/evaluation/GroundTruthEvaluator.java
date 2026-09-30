package com.devsphere.ax.evaluation;

import com.devsphere.ax.model.EvaluationResult;
import com.devsphere.ax.model.ImpactResult;

import java.util.*;

/** Pure-Java evaluator for Precision / Recall / F1 / Top-k validation. */
public class GroundTruthEvaluator {

    public EvaluationResult evaluate(ImpactResult result,
                                     Collection<String> expectedTargets,
                                     Integer requestedTopK) {
        Objects.requireNonNull(result, "result");
        Set<String> rawExpected = normalizeSet(expectedTargets);
        if (rawExpected.isEmpty()) {
            throw new IllegalArgumentException("At least one expected target is required for Ground Truth evaluation.");
        }

        List<ImpactResult.ImpactNode> ordered = new ArrayList<>();
        ordered.addAll(result.directImpact());
        ordered.addAll(result.indirectImpact());
        ordered.sort(Comparator
                .comparingInt(ImpactResult.ImpactNode::depth)
                .thenComparing(Comparator.comparingDouble(ImpactResult.ImpactNode::confidence).reversed())
                .thenComparing(ImpactResult.ImpactNode::name));

        Map<String, ImpactResult.ImpactNode> uniqueNodes = new LinkedHashMap<>();
        for (ImpactResult.ImpactNode n : ordered) uniqueNodes.putIfAbsent(n.id(), n);

        // Canonicalize expected aliases against predicted nodes. If a user enters both a node ID and its display
        // name, they count as one logical expected target instead of inflating TP/precision beyond 1.0.
        Set<String> canonicalExpected = new LinkedHashSet<>();
        Map<String,String> expectedToCanonical = new LinkedHashMap<>();
        for (String expected : rawExpected) {
            String canonical = uniqueNodes.values().stream()
                    .filter(n -> expected.equals(normalize(n.id())) || expected.equals(normalize(n.name())))
                    .map(n -> "node:" + normalize(n.id()))
                    .findFirst()
                    .orElse("raw:" + expected);
            canonicalExpected.add(canonical);
            expectedToCanonical.put(expected, canonical);
        }

        Set<String> predictedCanonical = new LinkedHashSet<>();
        for (ImpactResult.ImpactNode n : uniqueNodes.values()) predictedCanonical.add("node:" + normalize(n.id()));

        Set<String> matchedCanonical = new LinkedHashSet<>(predictedCanonical);
        matchedCanonical.retainAll(canonicalExpected);

        int expectedCount = canonicalExpected.size();
        int predictedCount = uniqueNodes.size();
        int tp = matchedCanonical.size();
        int fp = Math.max(0, predictedCount - tp);
        int fn = Math.max(0, expectedCount - tp);
        double precision = ratio(tp, predictedCount);
        double recall = ratio(tp, expectedCount);
        double f1 = precision + recall == 0 ? 0 : 2 * precision * recall / (precision + recall);

        int topK = requestedTopK == null ? 5 : Math.max(1, Math.min(requestedTopK, 100));
        Set<String> topCanonical = new LinkedHashSet<>();
        uniqueNodes.values().stream().limit(topK).forEach(n -> topCanonical.add("node:" + normalize(n.id())));
        topCanonical.retainAll(canonicalExpected);
        double topKRecall = ratio(topCanonical.size(), expectedCount);

        List<String> matchedDisplay = uniqueNodes.values().stream()
                .filter(n -> matchedCanonical.contains("node:" + normalize(n.id())))
                .map(ImpactResult.ImpactNode::name).distinct().sorted().toList();
        List<String> missed = rawExpected.stream()
                .filter(x -> !matchedCanonical.contains(expectedToCanonical.get(x)))
                .sorted().toList();
        List<String> unexpected = uniqueNodes.values().stream()
                .filter(n -> !matchedCanonical.contains("node:" + normalize(n.id())))
                .map(ImpactResult.ImpactNode::name).distinct().sorted().limit(200).toList();

        return new EvaluationResult(
                result.changedNode(), result.scope(), expectedCount, predictedCount,
                tp, fp, fn, round4(precision), round4(recall), round4(f1),
                topK, round4(topKRecall), matchedDisplay, missed, unexpected
        );
    }

    private static Set<String> normalizeSet(Collection<String> values) {
        Set<String> result = new LinkedHashSet<>();
        if (values == null) return result;
        for (String value : values) {
            String n = normalize(value);
            if (!n.isBlank()) result.add(n);
        }
        return result;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replace('\\', '/').toLowerCase(Locale.ROOT);
    }

    private static double ratio(int numerator, int denominator) {
        return denominator == 0 ? 0.0 : (double) numerator / denominator;
    }

    private static double round4(double v) { return Math.round(v * 10_000.0) / 10_000.0; }
}
