package com.devsphere.ax.graph;

import org.springframework.stereotype.Component;

import java.util.*;

/** Small bounded in-memory registry suitable for the MVP/demo server. */
@Component
public class GraphRegistry {
    private static final int MAX_PROJECTS = 20;
    private record Entry(SoftwareGraph graph,Map<String,String> sourceFingerprints) {}
    private final Map<String, Entry> graphs = new LinkedHashMap<>(16, 0.75f, true);

    public synchronized Optional<String> put(String id, SoftwareGraph graph) {
        return put(id,graph,Map.of());
    }

    public synchronized Optional<String> put(String id, SoftwareGraph graph,Map<String,String> sourceFingerprints) {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(graph, "graph");
        graphs.put(id, new Entry(graph,Map.copyOf(sourceFingerprints)));
        String evicted = null;
        while (graphs.size() > MAX_PROJECTS) {
            String eldest = graphs.keySet().iterator().next();
            graphs.remove(eldest);
            evicted = eldest;
        }
        return Optional.ofNullable(evicted);
    }

    public synchronized Optional<SoftwareGraph> get(String id) {
        return Optional.ofNullable(graphs.get(id)).map(Entry::graph);
    }

    public synchronized Optional<Map<String,String>> sourceFingerprints(String id) {
        return Optional.ofNullable(graphs.get(id)).map(Entry::sourceFingerprints);
    }

    public synchronized List<String> ids() { return List.copyOf(graphs.keySet()); }
    public synchronized boolean remove(String id) { return graphs.remove(id) != null; }
}
