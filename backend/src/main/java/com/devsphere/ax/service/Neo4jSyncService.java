package com.devsphere.ax.service;

import com.devsphere.ax.graph.SoftwareGraph;
import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.GraphDatabase;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Optional persistence. Without Neo4j environment variables, in-memory analysis remains fully functional. */
@Service
public class Neo4jSyncService {
    private static final int BATCH_SIZE = 500;

    public boolean configured() {
        return env("NEO4J_URI") != null && username() != null && env("NEO4J_PASSWORD") != null;
    }

    public SyncResult sync(String projectId, SoftwareGraph graph) {
        if (!configured()) return new SyncResult(false, true, "Neo4j not configured; using in-memory graph.");
        try (var driver = GraphDatabase.driver(env("NEO4J_URI"), AuthTokens.basic(username(), env("NEO4J_PASSWORD")))) {
            driver.verifyConnectivity();
            try (var session = driver.session()) {
                session.executeWrite(tx -> {
                    // projectId is part of the identity. This prevents two uploaded projects with the same FQCN
                    // from overwriting each other in a shared Neo4j instance.
                    tx.run("MATCH (n:SoftwareNode {projectId:$projectId}) DETACH DELETE n", Map.of("projectId", projectId));

                    List<Map<String,Object>> nodes = new ArrayList<>();
                    for (var node : graph.nodes()) {
                        Map<String,Object> row = new LinkedHashMap<>();
                        row.put("id", node.id());
                        row.put("name", node.name());
                        row.put("type", node.type().name());
                        row.put("sourcePath", node.sourcePath() == null ? "" : node.sourcePath());
                        row.put("line", node.line());
                        row.put("confidence", node.confidence());
                        nodes.add(row);
                    }
                    for (int from = 0; from < nodes.size(); from += BATCH_SIZE) {
                        int to = Math.min(nodes.size(), from + BATCH_SIZE);
                        tx.run("UNWIND $rows AS row " +
                                        "MERGE (n:SoftwareNode {projectId:$projectId, id:row.id}) " +
                                        "SET n.name=row.name, n.type=row.type, n.sourcePath=row.sourcePath, n.line=row.line, n.confidence=row.confidence",
                                Map.of("projectId", projectId, "rows", nodes.subList(from, to)));
                    }

                    List<Map<String,Object>> edges = new ArrayList<>();
                    for (var edge : graph.edges()) {
                        Map<String,Object> row = new LinkedHashMap<>();
                        row.put("source", edge.source());
                        row.put("target", edge.target());
                        row.put("kind", edge.type());
                        row.put("confidence", edge.confidence());
                        edges.add(row);
                    }
                    for (int from = 0; from < edges.size(); from += BATCH_SIZE) {
                        int to = Math.min(edges.size(), from + BATCH_SIZE);
                        tx.run("UNWIND $rows AS row " +
                                        "MATCH (a:SoftwareNode {projectId:$projectId, id:row.source}), " +
                                        "      (b:SoftwareNode {projectId:$projectId, id:row.target}) " +
                                        "MERGE (a)-[r:RELATES {kind:row.kind}]->(b) " +
                                        "SET r.confidence=row.confidence",
                                Map.of("projectId", projectId, "rows", edges.subList(from, to)));
                    }
                    return null;
                });
            }
            return new SyncResult(true, true, "Neo4j sync complete.");
        } catch (Exception e) {
            return new SyncResult(true, false, "Neo4j sync skipped after connection/write failure: " + safeMessage(e));
        }
    }

    /** Best-effort cleanup for deleted or evicted in-memory projects. */
    public SyncResult deleteProject(String projectId) {
        if (projectId == null || projectId.isBlank()) return new SyncResult(false, true, "No project id to delete.");
        if (!configured()) return new SyncResult(false, true, "Neo4j not configured; no persisted cleanup required.");
        try (var driver = GraphDatabase.driver(env("NEO4J_URI"), AuthTokens.basic(username(), env("NEO4J_PASSWORD")))) {
            driver.verifyConnectivity();
            try (var session = driver.session()) {
                session.executeWrite(tx -> {
                    tx.run("MATCH (n:SoftwareNode {projectId:$projectId}) DETACH DELETE n", Map.of("projectId", projectId));
                    return null;
                });
            }
            return new SyncResult(true, true, "Neo4j project cleanup complete.");
        } catch (Exception e) {
            return new SyncResult(true, false, "Neo4j cleanup skipped after connection/write failure: " + safeMessage(e));
        }
    }

    private String username() {
        String value = env("NEO4J_USERNAME");
        return value != null ? value : env("NEO4J_USER");
    }

    private String env(String key) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String safeMessage(Exception e) {
        String m = e.getMessage();
        return m == null || m.isBlank() ? e.getClass().getSimpleName() : m.replaceAll("[\\r\\n]+", " ");
    }

    public record SyncResult(boolean attempted, boolean success, String message) {}
}
