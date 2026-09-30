package com.devsphere.ax.api;

import com.devsphere.ax.model.AnalysisScope;
import com.devsphere.ax.model.AnalysisSummary;
import com.devsphere.ax.model.ImpactResult;
import com.devsphere.ax.model.EvaluationResult;
import com.devsphere.ax.impact.ChangedNodeLocator;
import com.devsphere.ax.service.AiExplanationService;
import com.devsphere.ax.service.AnalysisService;
import com.devsphere.ax.service.GithubService;
import com.devsphere.ax.service.EvaluationService;
import com.devsphere.ax.util.FileTrees;
import com.devsphere.ax.util.UnifiedDiffParser;
import com.devsphere.ax.util.SafeZip;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@RestController
@RequestMapping("/api/analysis")
public class AnalysisController {
    private static final long MAX_UPLOAD_BYTES = 50L * 1024 * 1024;
    private final AnalysisService analysis;
    private final AiExplanationService ai;
    private final GithubService github;
    private final EvaluationService evaluation;
    private final ChangedNodeLocator changedNodeLocator = new ChangedNodeLocator();

    public AnalysisController(AnalysisService analysis, AiExplanationService ai, GithubService github,
                              EvaluationService evaluation) {
        this.analysis = analysis;
        this.ai = ai;
        this.github = github;
        this.evaluation = evaluation;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AnalysisSummary upload(@RequestPart("file") MultipartFile file,
                                  @RequestParam(value = "name", required = false) String name) throws IOException {
        validateUpload(file);
        Path dir = Files.createTempDirectory("devsphere-src-");
        try {
            SafeZip.extract(file.getInputStream(), dir);
            return analysis.analyze(dir, name == null || name.isBlank() ? file.getOriginalFilename() : name);
        } finally {
            FileTrees.deleteRecursively(dir);
        }
    }

    @GetMapping("/{projectId}/graph")
    public AnalysisSummary graph(@PathVariable String projectId) {
        return analysis.summary(projectId, analysis.graph(projectId));
    }

    @GetMapping("/projects")
    public Map<String, Object> projects() {
        return Map.of("projects", analysis.projectIds(), "limit", 20);
    }

    @DeleteMapping("/{projectId}")
    public Map<String, Object> deleteProject(@PathVariable String projectId) {
        return Map.of("projectId", projectId, "removed", analysis.removeProject(projectId));
    }

    @PostMapping("/{projectId}/impact")
    public ImpactResult impact(@PathVariable String projectId, @RequestBody ImpactRequest request) {
        AnalysisScope scope = AnalysisScope.from(request.scope());
        ImpactResult base = analysis.impact(projectId, request.nodeId(), scope, request.maxDepth());
        return base.withExplanation(ai.explain(base));
    }


    /**
     * Compares LOCAL / FEATURE / SYSTEM from the same changed node.
     * Useful for proving how blast radius expands without changing the starting evidence.
     */
    @PostMapping("/{projectId}/impact-comparison")
    public Map<String, ImpactResult> impactComparison(@PathVariable String projectId, @RequestBody ImpactComparisonRequest request) {
        if (request.nodeId() == null || request.nodeId().isBlank()) {
            throw new IllegalArgumentException("nodeId is required.");
        }
        LinkedHashMap<String, ImpactResult> out = new LinkedHashMap<>();
        for (AnalysisScope scope : AnalysisScope.values()) {
            ImpactResult base = analysis.impact(projectId, request.nodeId(), scope, scope.defaultDepth());
            out.put(scope.name(), base.withExplanation(ai.explain(base)));
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(out));
    }

    /**
     * Pull Request impact analysis.
     * GitHub patch line ranges are mapped to method nodes first; file/class fallback is used only when line data is unavailable.
     */
    @PostMapping("/{projectId}/github-pr-impact")
    public List<ImpactResult> githubPrImpact(@PathVariable String projectId,
                                             @RequestBody GithubPrImpactRequest request,
                                             @RequestHeader(value = "X-GitHub-Token", required = false) String token) {
        var files = github.pullRequestFiles(request.owner(), request.repo(), request.pullNumber(), token);
        return analyzeGithubFiles(projectId, files, AnalysisScope.from(request.scope()), request.maxDepth());
    }

    /** Commit-level counterpart to PR analysis. Uses GitHub's commit file patches and the same method locator. */
    @PostMapping("/{projectId}/github-commit-impact")
    public List<ImpactResult> githubCommitImpact(@PathVariable String projectId,
                                                 @RequestBody GithubCommitImpactRequest request,
                                                 @RequestHeader(value = "X-GitHub-Token", required = false) String token) {
        var files = github.commitFiles(request.owner(), request.repo(), request.sha(), token);
        return analyzeGithubFiles(projectId, files, AnalysisScope.from(request.scope()), request.maxDepth());
    }

    /** Ground Truth evaluation for one change scenario. */
    @PostMapping("/{projectId}/evaluate")
    public EvaluationResult evaluate(@PathVariable String projectId, @RequestBody EvaluationRequest request) {
        if (request.nodeId() == null || request.nodeId().isBlank()) {
            throw new IllegalArgumentException("nodeId is required.");
        }
        ImpactResult result = analysis.impact(projectId, request.nodeId(),
                AnalysisScope.from(request.scope()), request.maxDepth());
        return evaluation.evaluate(result, request.expectedTargets(), request.topK());
    }

    private List<ImpactResult> analyzeGithubFiles(String projectId, Iterable<JsonNode> files,
                                                  AnalysisScope scope, Integer maxDepth) {
        var graph = analysis.graph(projectId);
        LinkedHashMap<String, ImpactResult> results = new LinkedHashMap<>();
        for (JsonNode file : files) {
            String filename = file.path("filename").asText("").replace('\\', '/');
            String previousFilename = file.path("previous_filename").asText("").replace('\\', '/');
            if (filename.isBlank() || !filename.toLowerCase(Locale.ROOT).endsWith(".java")) continue;

            var changed = UnifiedDiffParser.changedLines(file.path("patch").asText(""));
            LinkedHashMap<String, com.devsphere.ax.model.GraphNode> starts = new LinkedHashMap<>();

            // HEAD checkout: current path + NEW line positions is the most precise mapping.
            changedNodeLocator.locate(graph, filename, changed.newLines()).forEach(n -> starts.putIfAbsent(n.id(), n));

            // BASE checkout or rename: try previous path + OLD positions only when the HEAD mapping found nothing.
            if (starts.isEmpty() && !previousFilename.isBlank()) {
                changedNodeLocator.locate(graph, previousFilename, changed.oldLines()).forEach(n -> starts.putIfAbsent(n.id(), n));
            }
            if (starts.isEmpty() && !changed.oldLines().isEmpty()) {
                changedNodeLocator.locate(graph, filename, changed.oldLines()).forEach(n -> starts.putIfAbsent(n.id(), n));
            }

            // GitHub may omit a patch for very large/binary-like diffs. Fall back to the class/file node.
            if (starts.isEmpty() && changed.newLines().isEmpty() && changed.oldLines().isEmpty()) {
                changedNodeLocator.locate(graph, filename, Set.of()).forEach(n -> starts.putIfAbsent(n.id(), n));
                if (starts.isEmpty() && !previousFilename.isBlank()) {
                    changedNodeLocator.locate(graph, previousFilename, Set.of()).forEach(n -> starts.putIfAbsent(n.id(), n));
                }
            }

            for (var node : starts.values()) {
                ImpactResult base = analysis.impact(projectId, node.id(), scope, maxDepth);
                results.put(node.id(), base.withExplanation(ai.explain(base)));
            }
        }
        return results.values().stream()
                .sorted(Comparator.comparingInt(ImpactResult::riskScore).reversed()
                        .thenComparing(ImpactResult::changedNodeName))
                .toList();
    }

    private void validateUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("A non-empty ZIP file is required.");
        if (file.getSize() > MAX_UPLOAD_BYTES) throw new IllegalArgumentException("ZIP file exceeds the 50 MB upload limit.");
        String filename = Optional.ofNullable(file.getOriginalFilename()).orElse("");
        if (!filename.toLowerCase(Locale.ROOT).endsWith(".zip")) throw new IllegalArgumentException("Only .zip project uploads are supported.");
    }

    public record ImpactRequest(String nodeId, String scope, Integer maxDepth) {}
    public record ImpactComparisonRequest(String nodeId) {}
    public record GithubPrImpactRequest(String owner, String repo, int pullNumber, String scope, Integer maxDepth) {}
    public record GithubCommitImpactRequest(String owner, String repo, String sha, String scope, Integer maxDepth) {}
    public record EvaluationRequest(String nodeId, String scope, Integer maxDepth,
                                    List<String> expectedTargets, Integer topK) {}
}
