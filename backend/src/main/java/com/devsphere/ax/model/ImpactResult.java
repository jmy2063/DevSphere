package com.devsphere.ax.model;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record ImpactResult(
        String changedNode,
        String changedNodeName,
        String scope,
        List<ImpactNode> directImpact,
        List<ImpactNode> indirectImpact,
        List<String> apis,
        List<String> entities,
        List<String> tests,
        List<ImpactArea> areas,
        int riskScore,
        String riskLevel,
        List<String> riskReasons,
        Map<String, Integer> riskBreakdown,
        double evidenceConfidence,
        int blastRadius,
        int maxDepth,
        int exploredNodes,
        List<ImpactPath> paths,
        String explanation
) {
    public ImpactResult {
        directImpact = directImpact == null ? List.of() : List.copyOf(directImpact);
        indirectImpact = indirectImpact == null ? List.of() : List.copyOf(indirectImpact);
        apis = apis == null ? List.of() : List.copyOf(apis);
        entities = entities == null ? List.of() : List.copyOf(entities);
        tests = tests == null ? List.of() : List.copyOf(tests);
        areas = areas == null ? List.of() : List.copyOf(areas);
        riskReasons = riskReasons == null ? List.of() : List.copyOf(riskReasons);
        riskBreakdown = riskBreakdown == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(riskBreakdown));
        paths = paths == null ? List.of() : List.copyOf(paths);
        explanation = explanation == null ? "" : explanation;
    }

    public ImpactResult withExplanation(String value) {
        return new ImpactResult(changedNode, changedNodeName, scope, directImpact, indirectImpact, apis, entities, tests,
                areas, riskScore, riskLevel, riskReasons, riskBreakdown, evidenceConfidence, blastRadius, maxDepth,
                exploredNodes, paths, value);
    }

    public record ImpactNode(
            String id,
            String name,
            String type,
            int depth,
            String relation,
            String direction,
            double confidence,
            String sourcePath,
            int line,
            int endLine
    ) {}

    public record ImpactArea(String category, int count, int maxDepth, List<String> names) {
        public ImpactArea { names = names == null ? List.of() : List.copyOf(names); }
    }

    public record ImpactPath(
            String targetId,
            String targetName,
            String targetType,
            int hopCount,
            double pathConfidence,
            List<PathStep> steps
    ) {
        public ImpactPath { steps = steps == null ? List.of() : List.copyOf(steps); }
    }

    public record PathStep(
            String id,
            String name,
            String type,
            String sourcePath,
            int line,
            int endLine,
            String viaRelation,
            String direction
    ) {}
}
