package com.devsphere.ax.service;

import com.devsphere.ax.api.ExternalServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.regex.Pattern;

@Service
public class GithubService {
    private static final Pattern OWNER_REPO = Pattern.compile("[A-Za-z0-9_.-]{1,100}");
    private static final Pattern SHA = Pattern.compile("[A-Fa-f0-9]{7,64}");
    private static final int PAGE_SIZE = 100;
    private static final int MAX_PR_FILE_PAGES = 10;      // 1,000 files
    private static final int MAX_COMMIT_FILE_PAGES = 30;  // 3,000 files
    private static final int MAX_TOKEN_CHARS = 512;
    private static final int MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public JsonNode repository(String owner, String repo, String token) {
        validateRepo(owner, repo);
        return get("https://api.github.com/repos/" + owner + "/" + repo, token);
    }

    public JsonNode pullRequest(String owner, String repo, int number, String token) {
        validateRepo(owner, repo); validatePullNumber(number);
        return get("https://api.github.com/repos/" + owner + "/" + repo + "/pulls/" + number, token);
    }

    /** Retrieves up to 1,000 PR changed files and fails explicitly rather than silently truncating larger changes. */
    public ArrayNode pullRequestFiles(String owner, String repo, int number, String token) {
        validateRepo(owner, repo); validatePullNumber(number);
        ArrayNode all = mapper.createArrayNode();
        for (int page = 1; page <= MAX_PR_FILE_PAGES; page++) {
            JsonNode chunk = get("https://api.github.com/repos/" + owner + "/" + repo + "/pulls/" + number
                    + "/files?per_page=" + PAGE_SIZE + "&page=" + page, token);
            if (!chunk.isArray()) throw new ExternalServiceException("Unexpected GitHub API response for pull request files.");
            chunk.forEach(all::add);
            if (chunk.size() < PAGE_SIZE) return all;
        }
        throw new ExternalServiceException("Pull request contains more than 1,000 changed files; split the analysis into smaller changes.");
    }

    public JsonNode commit(String owner, String repo, String sha, String token) {
        validateRepo(owner, repo); validateSha(sha);
        return get("https://api.github.com/repos/" + owner + "/" + repo + "/commits/" + sha, token);
    }

    public JsonNode tree(String owner,String repo,String treeSha,String token) {
        validateRepo(owner,repo);validateSha(treeSha);
        return get("https://api.github.com/repos/"+owner+"/"+repo+"/git/trees/"+treeSha+"?recursive=1",token);
    }

    /**
     * Retrieves the paginated commit file list. GitHub may paginate the files field for large commits;
     * this method prevents silently analyzing only the first page.
     */
    public ArrayNode commitFiles(String owner, String repo, String sha, String token) {
        validateRepo(owner, repo); validateSha(sha);
        ArrayNode all = mapper.createArrayNode();
        for (int page = 1; page <= MAX_COMMIT_FILE_PAGES; page++) {
            JsonNode response = get("https://api.github.com/repos/" + owner + "/" + repo + "/commits/" + sha
                    + "?per_page=" + PAGE_SIZE + "&page=" + page, token);
            JsonNode files = response.path("files");
            if (!files.isArray()) throw new ExternalServiceException("GitHub commit response did not include a files array.");
            files.forEach(all::add);
            if (files.size() < PAGE_SIZE) return all;
        }
        throw new ExternalServiceException("Commit contains more than 3,000 changed files; split the analysis into smaller changes.");
    }

    private JsonNode get(String url, String token) {
        String safeToken = normalizeToken(token);
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .header("User-Agent", "DevSphere-AX")
                .GET();
        if (safeToken != null) builder.header("Authorization", "Bearer " + safeToken);
        try {
            HttpResponse<InputStream> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            String body;
            try (InputStream stream = response.body()) {
                body = readLimitedUtf8(stream, MAX_RESPONSE_BYTES);
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String detail;
                try { detail = mapper.readTree(body).path("message").asText("GitHub request failed"); }
                catch (Exception ignored) { detail = "GitHub request failed"; }
                throw new ExternalServiceException("GitHub API error " + response.statusCode() + ": " + detail);
            }
            if (body.isBlank()) throw new ExternalServiceException("GitHub returned an empty response.");
            return mapper.readTree(body);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ExternalServiceException("GitHub request was interrupted.", e);
        } catch (IOException e) {
            throw new ExternalServiceException("GitHub network/response error: " + safeNetworkMessage(e), e);
        }
    }

    static String readLimitedUtf8(InputStream in, int maxBytes) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maxBytes, 64 * 1024));
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) throw new IOException("Remote response exceeded the supported size limit.");
            out.write(buffer, 0, read);
        }
        return out.toString(StandardCharsets.UTF_8);
    }

    private void validateRepo(String owner, String repo) {
        if (owner == null || repo == null || !OWNER_REPO.matcher(owner).matches() || !OWNER_REPO.matcher(repo).matches()) {
            throw new IllegalArgumentException("Invalid GitHub owner/repository name.");
        }
    }

    private void validatePullNumber(int number) {
        if (number <= 0) throw new IllegalArgumentException("Pull request number must be positive.");
    }

    private void validateSha(String sha) {
        if (sha == null || !SHA.matcher(sha).matches()) throw new IllegalArgumentException("Invalid commit SHA.");
    }

    private String normalizeToken(String token) {
        if (token == null || token.isBlank()) return null;
        String value = token.trim();
        if (value.length() > MAX_TOKEN_CHARS || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            throw new IllegalArgumentException("Invalid GitHub token format.");
        }
        return value;
    }

    private String safeNetworkMessage(IOException e) {
        String m = e.getMessage();
        return m == null || m.isBlank() ? e.getClass().getSimpleName() : m.replaceAll("[\\r\\n]+", " ");
    }
}
