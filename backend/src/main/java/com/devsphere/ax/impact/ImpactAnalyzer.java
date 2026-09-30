package com.devsphere.ax.impact;

import com.devsphere.ax.graph.SoftwareGraph;
import com.devsphere.ax.model.*;
import com.devsphere.ax.risk.RiskScoreCalculator;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Confidence-weighted, cycle-safe change-impact traversal.
 * LOCAL/FEATURE/SYSTEM scopes provide progressively wider analysis without unbounded graph explosion.
 */
public class ImpactAnalyzer {
    private static final Set<String> IMPACT_RELATIONS = Set.of(
            "USES", "CALLS", "DEPENDS_ON", "MANAGES", "MAPS_TO", "TESTS", "EXPOSES", "HANDLED_BY", "INHERITS"
    );
    private static final Map<String, Double> RELATION_WEIGHT = Map.ofEntries(
            Map.entry("CALLS", 0.99),
            Map.entry("USES", 0.96),
            Map.entry("DEPENDS_ON", 0.88),
            Map.entry("MANAGES", 0.97),
            Map.entry("MAPS_TO", 0.96),
            Map.entry("TESTS", 0.93),
            Map.entry("EXPOSES", 0.99),
            Map.entry("HANDLED_BY", 0.99),
            Map.entry("INHERITS", 0.90),
            Map.entry("OWNER", 0.99)
    );

    private final RiskScoreCalculator risk = new RiskScoreCalculator();

    /** Compatibility entry point used by older callers. */
    public ImpactResult analyze(SoftwareGraph graph, String changedNodeId, int requestedDepth) {
        int depth = Math.max(1, Math.min(requestedDepth, 6));
        AnalysisScope scope = depth <= 2 ? AnalysisScope.LOCAL : depth <= 4 ? AnalysisScope.FEATURE : AnalysisScope.SYSTEM;
        return analyze(graph, changedNodeId, scope, depth);
    }

    public ImpactResult analyze(SoftwareGraph graph, String changedNodeId, AnalysisScope scope, Integer requestedDepth) {
        GraphNode changed = graph.node(changedNodeId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown node: " + changedNodeId));
        AnalysisScope effectiveScope = scope == null ? AnalysisScope.FEATURE : scope;
        int maxDepth = requestedDepth == null ? effectiveScope.defaultDepth() : Math.max(1, Math.min(requestedDepth, effectiveScope.defaultDepth()));

        PriorityQueue<Visit> queue = new PriorityQueue<>(Comparator
                .comparingDouble(Visit::confidence).reversed()
                .thenComparingInt(Visit::depth));
        Map<String, Visit> best = new LinkedHashMap<>();
        Set<String> startingAnchors = new LinkedHashSet<>();

        Visit start = new Visit(changed.id(), 0, "CHANGED", "CHANGED", null, 1.0);
        best.put(changed.id(), start);
        queue.add(start);

        // Owning class is a zero-cost anchor only for the changed method.
        if (changed.type() == NodeType.METHOD) {
            for (GraphEdge edge : graph.incoming(changed.id())) {
                if (!"DECLARES".equals(edge.type())) continue;
                GraphNode owner = graph.node(edge.source()).orElse(null);
                if (owner == null || owner.type() == NodeType.PROJECT) continue;
                Visit anchor = new Visit(owner.id(), 0, "OWNER", "OWNER", changed.id(), 0.99);
                best.put(owner.id(), anchor);
                startingAnchors.add(owner.id());
                queue.add(anchor);
            }
        }

        while (!queue.isEmpty() && best.size() < effectiveScope.nodeLimit()) {
            Visit current = queue.poll();
            Visit currentBest = best.get(current.id());
            if (currentBest == null || currentBest.confidence() > current.confidence() + 1e-9) continue;
            if (current.depth() >= maxDepth) continue;

            for (Adjacent adjacent : adjacentForImpact(graph, current.id())) {
                GraphNode nextNode = graph.node(adjacent.nextId()).orElse(null);
                if (nextNode == null || nextNode.type() == NodeType.PROJECT || nextNode.type() == NodeType.PACKAGE) continue;

                int nextDepth = current.depth() + adjacent.depthCost();
                if (nextDepth > maxDepth) continue;
                double nextConfidence = current.confidence()
                        * adjacent.edge().confidence()
                        * RELATION_WEIGHT.getOrDefault(adjacent.baseRelation(), 0.85)
                        * (adjacent.depthCost() == 0 ? 1.0 : 0.94);
                nextConfidence = round3(nextConfidence);
                if (nextDepth > 1 && nextConfidence < effectiveScope.minConfidence()) continue;

                Visit old = best.get(nextNode.id());
                if (old == null && best.size() >= effectiveScope.nodeLimit()) continue;
                boolean better = old == null
                        || nextConfidence > old.confidence() + 0.015
                        || (Math.abs(nextConfidence - old.confidence()) <= 0.015 && nextDepth < old.depth());
                if (!better) continue;

                Visit next = new Visit(nextNode.id(), nextDepth, adjacent.relationLabel(), adjacent.direction(), current.id(), nextConfidence);
                best.put(nextNode.id(), next);
                queue.add(next);
            }
        }

        LinkedHashMap<String, Visit> impact = new LinkedHashMap<>(best);
        impact.remove(changed.id());
        startingAnchors.forEach(impact::remove);

        List<GraphNode> impactedNodes = impact.keySet().stream().map(id -> graph.node(id).orElseThrow()).toList();
        int actualDepth = impact.values().stream().mapToInt(Visit::depth).max().orElse(0);
        double evidenceConfidence = impact.isEmpty() ? 1.0 : impact.values().stream().mapToDouble(Visit::confidence).average().orElse(1.0);

        List<ImpactResult.ImpactNode> direct = new ArrayList<>();
        List<ImpactResult.ImpactNode> indirect = new ArrayList<>();
        for (var entry : impact.entrySet()) {
            GraphNode node = graph.node(entry.getKey()).orElseThrow();
            Visit meta = entry.getValue();
            ImpactResult.ImpactNode out = new ImpactResult.ImpactNode(
                    node.id(), node.name(), node.type().name(), meta.depth(), meta.relation(), meta.direction(), meta.confidence(),
                    node.sourcePath(), node.line(), endLine(node));
            if (meta.depth() <= 1) direct.add(out); else indirect.add(out);
        }
        Comparator<ImpactResult.ImpactNode> order = Comparator.comparingInt(ImpactResult.ImpactNode::depth)
                .thenComparing(Comparator.comparingDouble(ImpactResult.ImpactNode::confidence).reversed())
                .thenComparing(ImpactResult.ImpactNode::type)
                .thenComparing(ImpactResult.ImpactNode::name);
        direct.sort(order); indirect.sort(order);

        List<String> apis = namesOfType(impactedNodes, NodeType.API);
        List<String> entities = impactedNodes.stream()
                .filter(n -> n.type() == NodeType.ENTITY || n.type() == NodeType.TABLE)
                .map(GraphNode::name).distinct().sorted().toList();
        List<String> tests = namesOfType(impactedNodes, NodeType.TEST);
        List<ImpactResult.ImpactPath> paths = buildPaths(graph, changed, impact, best, startingAnchors, effectiveScope);
        List<ImpactResult.ImpactArea> areas = buildAreas(impact, graph);

        RiskAssessment assessment = risk.assess(impactedNodes, actualDepth, paths.size(), evidenceConfidence, direct.size());
        String explanation = buildExplanation(changed, effectiveScope, assessment, direct, apis, entities, tests, actualDepth);

        return new ImpactResult(
                changed.id(), changed.name(), effectiveScope.name(), List.copyOf(direct), List.copyOf(indirect),
                apis, entities, tests, areas,
                assessment.score(), assessment.level(), assessment.reasons(), assessment.breakdown(),
                assessment.evidenceConfidence(), assessment.blastRadius(), maxDepth, best.size(), paths, explanation
        );
    }

    private List<Adjacent> adjacentForImpact(SoftwareGraph graph, String id) {
        List<Adjacent> result = new ArrayList<>();
        GraphNode current = graph.node(id).orElse(null);

        for (GraphEdge edge : graph.outgoing(id)) {
            if (IMPACT_RELATIONS.contains(edge.type())) {
                result.add(new Adjacent(edge.target(), edge, edge.type(), edge.type() + " →", "DOWNSTREAM", 1));
            }
        }
        for (GraphEdge edge : graph.incoming(id)) {
            if (IMPACT_RELATIONS.contains(edge.type())) {
                result.add(new Adjacent(edge.source(), edge, edge.type(), "← " + edge.type(), "UPSTREAM", 1));
            }
            // A method can always climb to its owning class without consuming propagation depth.
            if (current != null && current.type() == NodeType.METHOD && "DECLARES".equals(edge.type())) {
                result.add(new Adjacent(edge.source(), edge, "OWNER", "← OWNER", "OWNER", 0));
            }
        }
        return result;
    }

    private List<String> namesOfType(List<GraphNode> nodes, NodeType type) {
        return nodes.stream().filter(n -> n.type() == type).map(GraphNode::name).distinct().sorted().toList();
    }

    private List<ImpactResult.ImpactPath> buildPaths(SoftwareGraph graph,
                                                      GraphNode changed,
                                                      Map<String, Visit> impact,
                                                      Map<String, Visit> best,
                                                      Set<String> startingAnchors,
                                                      AnalysisScope scope) {
        int limit = switch (scope) { case LOCAL -> 24; case FEATURE -> 60; case SYSTEM -> 120; };
        List<ImpactResult.ImpactPath> result = new ArrayList<>();
        for (String targetId : impact.keySet()) {
            List<Visit> chain = new ArrayList<>();
            Visit cursor = best.get(targetId);
            Set<String> guard = new HashSet<>();
            while (cursor != null && guard.add(cursor.id())) {
                chain.add(cursor);
                if (cursor.previousId() == null) break;
                cursor = best.get(cursor.previousId());
                if (cursor == null && cursorForChanged(changed, chain)) break;
            }
            Collections.reverse(chain);

            List<ImpactResult.PathStep> steps = new ArrayList<>();
            // Ensure the exact changed method/class is the first path step.
            steps.add(step(changed, "CHANGED", "CHANGED"));
            for (Visit v : chain) {
                if (v.id().equals(changed.id())) continue;
                if (startingAnchors.contains(v.id()) && chain.size() > 1) {
                    GraphNode owner = graph.node(v.id()).orElse(null);
                    if (owner != null) steps.add(step(owner, v.relation(), v.direction()));
                    continue;
                }
                GraphNode node = graph.node(v.id()).orElse(null);
                if (node != null) steps.add(step(node, v.relation(), v.direction()));
            }
            if (steps.size() <= 1) continue;
            GraphNode target = graph.node(targetId).orElseThrow();
            int hops = (int) steps.stream().skip(1).filter(s -> !"OWNER".equals(s.direction())).count();
            double conf = impact.get(targetId).confidence();
            result.add(new ImpactResult.ImpactPath(targetId, target.name(), target.type().name(), hops, conf, List.copyOf(steps)));
        }
        return result.stream()
                .sorted(Comparator.comparingDouble(ImpactResult.ImpactPath::pathConfidence).reversed()
                        .thenComparingInt(ImpactResult.ImpactPath::hopCount))
                .limit(limit).toList();
    }

    private boolean cursorForChanged(GraphNode changed, List<Visit> chain) {
        return !chain.isEmpty() && Objects.equals(chain.get(chain.size() - 1).previousId(), changed.id());
    }

    private ImpactResult.PathStep step(GraphNode node, String relation, String direction) {
        return new ImpactResult.PathStep(node.id(), node.name(), node.type().name(), node.sourcePath(), node.line(), endLine(node), relation, direction);
    }

    private List<ImpactResult.ImpactArea> buildAreas(Map<String, Visit> impact, SoftwareGraph graph) {
        Map<String, List<Map.Entry<String, Visit>>> grouped = new LinkedHashMap<>();
        for (var entry : impact.entrySet()) {
            GraphNode n = graph.node(entry.getKey()).orElse(null);
            if (n == null) continue;
            grouped.computeIfAbsent(areaOf(n.type()), k -> new ArrayList<>()).add(entry);
        }
        return grouped.entrySet().stream().map(e -> {
            List<String> names = e.getValue().stream()
                    .map(x -> graph.node(x.getKey()).map(GraphNode::name).orElse(x.getKey()))
                    .distinct().sorted().limit(40).toList();
            int depth = e.getValue().stream().mapToInt(x -> x.getValue().depth()).max().orElse(0);
            return new ImpactResult.ImpactArea(e.getKey(), e.getValue().size(), depth, names);
        }).sorted(Comparator.comparing(ImpactResult.ImpactArea::category)).toList();
    }

    private String areaOf(NodeType type) {
        return switch (type) {
            case API, CONTROLLER -> "API_SURFACE";
            case SERVICE, CLASS -> "BUSINESS_LOGIC";
            case REPOSITORY, ENTITY, TABLE -> "DATA";
            case TEST -> "TEST";
            case METHOD -> "METHOD";
            default -> "OTHER";
        };
    }

    private int endLine(GraphNode node) {
        try { return Integer.parseInt(node.attributes().getOrDefault("endLine", Integer.toString(node.line()))); }
        catch (NumberFormatException ignored) { return node.line(); }
    }

    private String buildExplanation(GraphNode changed, AnalysisScope scope, RiskAssessment assessment,
                                    List<ImpactResult.ImpactNode> direct, List<String> apis,
                                    List<String> entities, List<String> tests, int actualDepth) {
        String directNames = direct.stream().limit(5).map(ImpactResult.ImpactNode::name).collect(Collectors.joining(", "));
        StringBuilder sb = new StringBuilder();
        sb.append(changed.name()).append(" 변경을 ").append(scope.name()).append(" 범위로 분석한 Change Risk Index는 ")
                .append(assessment.score()).append("/100 (").append(assessment.level()).append(")입니다. ")
                .append("이 값은 장애 확률이 아니라 Graph 근거 기반 상대 위험지수입니다. ");
        if (!directNames.isBlank()) sb.append("직접 영향 후보: ").append(directNames).append(". ");
        if (!apis.isEmpty()) sb.append("영향 가능 API: ").append(String.join(", ", apis)).append(". ");
        if (!entities.isEmpty()) sb.append("데이터 계층 영향: ").append(String.join(", ", entities)).append(". ");
        if (!tests.isEmpty()) sb.append("회귀 테스트 후보: ").append(String.join(", ", tests)).append(". ");
        else sb.append("연결된 테스트가 탐지되지 않아 테스트 공백 확인이 필요합니다. ");
        sb.append("최대 전파 깊이 ").append(actualDepth).append("단계, 근거 신뢰도 ")
                .append(Math.round(assessment.evidenceConfidence() * 100)).append("%입니다.");
        return sb.toString();
    }

    private double round3(double value) { return Math.round(value * 1000.0) / 1000.0; }

    private record Visit(String id, int depth, String relation, String direction, String previousId, double confidence) {}
    private record Adjacent(String nextId, GraphEdge edge, String baseRelation, String relationLabel, String direction, int depthCost) {}
}
