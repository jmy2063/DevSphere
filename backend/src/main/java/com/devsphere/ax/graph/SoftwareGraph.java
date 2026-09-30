package com.devsphere.ax.graph;

import com.devsphere.ax.model.GraphEdge;
import com.devsphere.ax.model.GraphNode;

import java.util.*;

/** In-memory graph used as the authoritative MVP analysis model. */
public class SoftwareGraph {
    private final Map<String, GraphNode> nodes = new LinkedHashMap<>();
    private final List<GraphEdge> edges = new ArrayList<>();
    private final Set<String> edgeKeys = new HashSet<>();
    private final Map<String, List<GraphEdge>> outgoing = new HashMap<>();
    private final Map<String, List<GraphEdge>> incoming = new HashMap<>();

    public void addNode(GraphNode node) {
        Objects.requireNonNull(node, "node");
        nodes.put(node.id(), node);
    }

    public void addEdge(GraphEdge edge) {
        Objects.requireNonNull(edge, "edge");
        if (!nodes.containsKey(edge.source()) || !nodes.containsKey(edge.target())) return;
        String key = edge.source() + '\u0000' + edge.target() + '\u0000' + edge.type();
        if (!edgeKeys.add(key)) return;
        edges.add(edge);
        outgoing.computeIfAbsent(edge.source(), k -> new ArrayList<>()).add(edge);
        incoming.computeIfAbsent(edge.target(), k -> new ArrayList<>()).add(edge);
    }

    public Optional<GraphNode> node(String id) { return Optional.ofNullable(nodes.get(id)); }
    public Collection<GraphNode> nodes() { return Collections.unmodifiableCollection(nodes.values()); }
    public List<GraphEdge> edges() { return Collections.unmodifiableList(edges); }
    public List<GraphEdge> outgoing(String id) { return Collections.unmodifiableList(outgoing.getOrDefault(id, List.of())); }
    public List<GraphEdge> incoming(String id) { return Collections.unmodifiableList(incoming.getOrDefault(id, List.of())); }

    public Optional<GraphNode> findByTypeAndName(String type, String name) {
        return nodes.values().stream()
                .filter(n -> n.type().name().equals(type) && n.name().equals(name))
                .findFirst();
    }
}
