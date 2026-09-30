package com.devsphere.ax.service;

import com.devsphere.ax.model.ImpactResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Optional grounded LLM explanation layer.
 * If configuration is absent or the provider fails, deterministic graph-based explanation is returned.
 */
@Service
public class AiExplanationService {
    private static final int MAX_AI_RESPONSE_BYTES = 1 * 1024 * 1024;
    private static final int MAX_ENV_CHARS = 4096;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public String explain(ImpactResult result) {
        String url = env("AI_API_URL");
        String key = env("AI_API_KEY");
        String model = env("AI_MODEL");
        if (url == null || key == null || model == null) return result.explanation();
        if (url.length() > MAX_ENV_CHARS || key.length() > MAX_ENV_CHARS || model.length() > 256) return result.explanation();

        try {
            URI endpoint = URI.create(url);
            if (!"https".equalsIgnoreCase(endpoint.getScheme()) && !isLocal(endpoint)) return result.explanation();
            if (endpoint.getHost() == null) return result.explanation();

            ObjectNode facts = mapper.createObjectNode();
            facts.put("changedNode", result.changedNodeName());
            facts.put("riskLevel", result.riskLevel());
            facts.put("riskScore", result.riskScore());
            facts.put("scope", result.scope());
            facts.put("evidenceConfidence", result.evidenceConfidence());
            facts.put("blastRadius", result.blastRadius());
            facts.set("riskBreakdown", mapper.valueToTree(result.riskBreakdown()));
            facts.set("riskReasons", mapper.valueToTree(result.riskReasons()));
            facts.set("directImpact", mapper.valueToTree(result.directImpact().stream().limit(40).toList()));
            facts.set("indirectImpact", mapper.valueToTree(result.indirectImpact().stream().limit(80).toList()));
            facts.set("apis", mapper.valueToTree(result.apis().stream().limit(40).toList()));
            facts.set("entities", mapper.valueToTree(result.entities().stream().limit(40).toList()));
            facts.set("tests", mapper.valueToTree(result.tests().stream().limit(40).toList()));
            facts.set("areas", mapper.valueToTree(result.areas()));
            facts.set("paths", mapper.valueToTree(result.paths().stream().limit(12).toList()));

            ObjectNode body = mapper.createObjectNode();
            body.put("model", model);
            ArrayNode messages = body.putArray("messages");
            messages.addObject().put("role", "system").put("content",
                    "You are DevSphere AX. Explain software change impact in Korean using ONLY the supplied structured graph facts. " +
                    "Never invent dependencies, files, APIs, database objects, tests, or certainty. State uncertain items as candidates. " +
                    "Risk score is a relative Change Risk Index, not a probability of failure. Cite path/source-line evidence when available.");
            messages.addObject().put("role", "user").put("content", mapper.writeValueAsString(facts));
            body.put("temperature", 0.1);

            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + key)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            String responseBody;
            try (InputStream stream = response.body()) {
                responseBody = readLimitedUtf8(stream, MAX_AI_RESPONSE_BYTES);
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300 || responseBody.isBlank()) return result.explanation();
            JsonNode content = mapper.readTree(responseBody).at("/choices/0/message/content");
            return content.isTextual() && !content.asText().isBlank() ? content.asText().trim() : result.explanation();
        } catch (Exception ignored) {
            return result.explanation();
        }
    }

    static String readLimitedUtf8(InputStream in, int maxBytes) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maxBytes, 32 * 1024));
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) throw new IOException("AI response exceeded the supported size limit.");
            out.write(buffer, 0, read);
        }
        return out.toString(StandardCharsets.UTF_8);
    }

    private boolean isLocal(URI uri) {
        String host = uri.getHost();
        return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host);
    }

    private String env(String key) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? null : value.trim();
    }
}
