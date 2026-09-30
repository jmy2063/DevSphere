package com.devsphere.ax.api;

import com.devsphere.ax.service.Neo4jSyncService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {
    private final Neo4jSyncService neo4j;
    public HealthController(Neo4jSyncService neo4j) { this.neo4j = neo4j; }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "service", "DevSphere AX",
                "time", Instant.now().toString(),
                "neo4jConfigured", neo4j.configured()
        );
    }
}
