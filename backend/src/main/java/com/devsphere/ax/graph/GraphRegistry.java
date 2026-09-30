package com.devsphere.ax.graph;

import org.springframework.stereotype.Component;

import java.util.*;

/** Small bounded in-memory registry suitable for the MVP/demo server. */
@Component
public class GraphRegistry {
    private static final int MAX_PROJECTS = 20;
    private final Map<String, SoftwareGraph> graphs = new LinkedHashMap<>(16, 0.75f, true);

    public synchronized Optional<String> put(String id, SoftwareGraph graph) {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(graph, "graph");
        graphs.put(id, graph);
        String evicted = null;
        while (graphs.size() > MAX_PROJECTS) {
            String eldest = graphs.keySet().iterator().next();
            graphs.remove(eldest);
            evicted = eldest;
        }
        return Optional.ofNullable(evicted);
    }

    public synchronized Optional<SoftwareGraph> get(String id) {
        return Optional.ofNullable(graphs.get(id));
    }

    public synchronized List<String> ids() { return List.copyOf(graphs.keySet()); }
    public synchronized boolean remove(String id) { return graphs.remove(id) != null; }
}
