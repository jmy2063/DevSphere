package com.devsphere.ax.risk;

import com.devsphere.ax.model.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Explainable Change Risk Index (CRI), 0-100.
 * CRI is a relative engineering risk index derived from graph evidence; it is NOT a failure probability.
 */
public class RiskScoreCalculator {
    public RiskAssessment assess(Collection<GraphNode> impacted,
                                 int maxDepth,
                                 int pathCount,
                                 double evidenceConfidence,
                                 int directCount) {
        List<GraphNode> meaningful = impacted.stream()
                .filter(n -> n.type() != NodeType.PROJECT && n.type() != NodeType.PACKAGE)
                .toList();
        List<GraphNode> structural = meaningful.stream().filter(n -> n.type() != NodeType.METHOD).toList();

        int blastRadius = structural.size();
        long services = structural.stream().filter(n -> n.type() == NodeType.SERVICE).count();
        long apis = structural.stream().filter(n -> n.type() == NodeType.API).count();
        long entities = structural.stream().filter(n -> n.type() == NodeType.ENTITY).count();
        long tables = structural.stream().filter(n -> n.type() == NodeType.TABLE).count();
        long repositories = structural.stream().filter(n -> n.type() == NodeType.REPOSITORY).count();
        long controllers = structural.stream().filter(n -> n.type() == NodeType.CONTROLLER).count();
        long tests = structural.stream().filter(n -> n.type() == NodeType.TEST).count();
        Set<String> packages = structural.stream()
                .map(n -> n.attributes().getOrDefault("package", ""))
                .filter(s -> !s.isBlank()).collect(Collectors.toCollection(LinkedHashSet::new));

        int breadth = breadthPoints(blastRadius, directCount);
        int critical = Math.min(30,
                (apis > 0 ? 10 : 0) + (tables > 0 ? 8 : 0) + (entities > 0 ? 5 : 0) +
                (repositories > 0 ? 4 : 0) + (controllers > 0 ? 3 : 0));
        int propagation = Math.min(20, depthPoints(maxDepth) + (pathCount >= 12 ? 6 : pathCount >= 6 ? 4 : pathCount >= 3 ? 2 : 0));
        int coupling = Math.min(15,
                (int)Math.min(8, services * 2) + Math.min(5, Math.max(0, packages.size() - 1) * 2) + (directCount >= 5 ? 2 : directCount >= 3 ? 1 : 0));
        int testGap = tests == 0 ? 10 : tests == 1 ? 6 : tests <= 3 ? 3 : 0;

        int score = Math.min(100, breadth + critical + propagation + coupling + testGap);
        Map<String,Integer> breakdown = new LinkedHashMap<>();
        breakdown.put("Blast Radius", breadth);
        breakdown.put("Critical Surface", critical);
        breakdown.put("Propagation", propagation);
        breakdown.put("Coupling", coupling);
        breakdown.put("Test Gap", testGap);

        List<String> reasons = new ArrayList<>();
        reasons.add("영향 범위 " + blastRadius + "개 요소 / 직접 영향 " + directCount + "개 (Blast Radius " + breadth + "/25)");
        if (apis > 0) reasons.add("외부 API " + apis + "개가 영향 경로에 포함됨");
        if (entities + tables > 0) reasons.add("데이터 계층 Entity/Table " + (entities + tables) + "개가 영향 경로에 포함됨");
        if (services >= 2) reasons.add("다중 Service " + services + "개로 영향이 전파됨");
        if (packages.size() >= 2) reasons.add("패키지 경계 " + packages.size() + "개를 가로지르는 변경 영향");
        if (maxDepth >= 4) reasons.add("최대 전파 깊이 " + maxDepth + " 단계의 광역 영향 경로 탐지");
        if (tests == 0) reasons.add("연결된 회귀 테스트가 탐지되지 않아 검증 공백 위험이 큼");
        else reasons.add("연결된 회귀 테스트 후보 " + tests + "개 탐지");
        reasons.add("근거 신뢰도 " + Math.round(evidenceConfidence * 100) + "% — 낮은 신뢰도 경로는 범위 탐색에서 자동 가지치기");

        return new RiskAssessment(score, level(score), List.copyOf(reasons), Collections.unmodifiableMap(new LinkedHashMap<>(breakdown)),
                round3(evidenceConfidence), blastRadius, (int)services, packages.size(), (int)apis,
                (int)(entities + tables), (int)tests, pathCount);
    }

    private int breadthPoints(int count, int directCount) {
        int points = count <= 2 ? 5 : count <= 5 ? 10 : count <= 10 ? 16 : count <= 20 ? 22 : 25;
        if (directCount >= 6) points = Math.min(25, points + 2);
        return points;
    }

    private int depthPoints(int d) {
        if (d <= 1) return 2;
        if (d == 2) return 6;
        if (d == 3) return 10;
        if (d == 4) return 14;
        return 18;
    }

    public String level(int score) {
        if (score < 25) return "LOW";
        if (score < 50) return "MEDIUM";
        if (score < 75) return "HIGH";
        return "CRITICAL";
    }

    private double round3(double value) { return Math.round(value * 1000.0) / 1000.0; }
}
