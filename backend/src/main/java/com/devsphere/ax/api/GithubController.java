package com.devsphere.ax.api;

import com.devsphere.ax.service.GithubService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/github")
public class GithubController {
    private final GithubService github;
    public GithubController(GithubService github) { this.github = github; }

    @GetMapping("/{owner}/{repo}")
    public JsonNode repo(@PathVariable String owner, @PathVariable String repo,
                         @RequestHeader(value = "X-GitHub-Token", required = false) String token) throws Exception {
        return github.repository(owner, repo, token);
    }

    @GetMapping("/{owner}/{repo}/pulls/{number}")
    public JsonNode pull(@PathVariable String owner, @PathVariable String repo, @PathVariable int number,
                         @RequestHeader(value = "X-GitHub-Token", required = false) String token) throws Exception {
        return github.pullRequest(owner, repo, number, token);
    }

    @GetMapping("/{owner}/{repo}/pulls/{number}/files")
    public JsonNode pullFiles(@PathVariable String owner, @PathVariable String repo, @PathVariable int number,
                              @RequestHeader(value = "X-GitHub-Token", required = false) String token) throws Exception {
        return github.pullRequestFiles(owner, repo, number, token);
    }

    @GetMapping("/{owner}/{repo}/commits/{sha}")
    public JsonNode commit(@PathVariable String owner, @PathVariable String repo, @PathVariable String sha,
                           @RequestHeader(value = "X-GitHub-Token", required = false) String token) throws Exception {
        return github.commit(owner, repo, sha, token);
    }
}
