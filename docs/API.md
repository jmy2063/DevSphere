# DevSphere AX REST API

Base URL: `http://127.0.0.1:8080`

## Health
`GET /api/health`

## Upload / Analyze Project
`POST /api/analysis/upload`
- multipart/form-data
- `file`: Java/Spring project ZIP
- `name`: optional project name

Returns graph summary, nodes, edges, counts, warnings.

## Read Graph
`GET /api/analysis/{projectId}/graph`

## Impact Analysis
`POST /api/analysis/{projectId}/impact`

```json
{
  "nodeId": "class:com.example.shop.service.OrderService#createOrder",
  "scope": "SYSTEM",
  "maxDepth": 6
}
```

Scopes:
- LOCAL: default depth 2
- FEATURE: default depth 4
- SYSTEM: default depth 6

## Compare All Scopes
`POST /api/analysis/{projectId}/impact-comparison`

```json
{
  "nodeId": "class:com.example.shop.service.OrderService#createOrder"
}
```

Returns `LOCAL`, `FEATURE`, `SYSTEM` results from the same changed node.

## GitHub PR Impact
`POST /api/analysis/{projectId}/github-pr-impact`

Optional header:
`X-GitHub-Token: <token>`

```json
{
  "owner": "organization",
  "repo": "repository",
  "pullNumber": 12,
  "scope": "SYSTEM",
  "maxDepth": 6
}
```

Flow:
GitHub changed file/patch → changed NEW-file lines → exact Method node mapping → wide-scope impact analysis.

## Projects in Current Server Memory
`GET /api/analysis/projects`

The MVP keeps a bounded in-memory registry (maximum 20 analyzed projects). Neo4j synchronization is optional and does not replace the in-memory runtime graph.

## GitHub Change Reports

`POST /api/analysis/{projectId}/github-pr-report`
`POST /api/analysis/{projectId}/github-commit-report`

Both accept optional `X-GitHub-Token`. PR requests use `owner`, `repo`, `pullNumber`,
`scope`, `maxDepth`, optional `uploadedRevision` (full 40-character SHA), and optional `verifySources` (boolean, default false for API compatibility; true in the UI).
Commit requests replace `pullNumber` with `sha` (7–64 hexadecimal characters).
The legacy `*-impact` endpoints retain their list response; the UI now uses reports.

Reports return `baseSha`, `headSha`, `declaredRevision`, `revisionStatus`, `mappingSide`,
`warnings`, `files`, `results`, `summary` and `sourceVerification`. Revision statuses:

- `UNVERIFIED`: no declaration; HEAD NEW lines assumed with a warning.
- `DECLARED_HEAD_MATCH`: declared SHA matches HEAD; use NEW lines.
- `DECLARED_BASE_MATCH`: declared SHA matches BASE; use OLD lines and previous rename paths.
- `DECLARED_MISMATCH`: no impacts computed; file reasons explain the mismatch.
- `VERIFIED_JAVA_HEAD` / `VERIFIED_JAVA_BASE`: the complete analyzed Java file set matches the selected revision; use NEW / OLD lines respectively.
- `JAVA_CONTENT_MISMATCH`: Java file paths or bytes differ; no impacts computed.
- `JAVA_VERIFICATION_UNAVAILABLE`: complete comparison could not be performed; no impacts computed when verification was requested.

With `verifySources:true` and an empty declaration, compare HEAD first. Only a confirmed
HEAD mismatch triggers a BASE comparison. A verified BASE chooses OLD coordinates without
filling or inventing `declaredRevision`. An unavailable HEAD does not trigger a fallback.
If both revisions differ, report HEAD differences and stop. If HEAD differs but BASE cannot
be checked, report verification unavailable. If both revisions have identical Java, HEAD has priority;
Java equality does not identify a unique historical commit. An explicit SHA restricts comparison
to that revision and never switches to the other side.

`sourceVerification` contains `status` (`NOT_REQUESTED`, `VERIFIED`, `MISMATCH`, `UNAVAILABLE`),
`revision`, `zipPrefix`, file counts (`localFiles`, `repositoryFiles`, `matchedFiles`,
`changedFiles`, `missingFiles`, `extraFiles`), `message`, and up to 100 `differences`.
Differences use `CONTENT_CHANGED`, `MISSING_IN_ZIP`, `EXTRA_IN_ZIP`.
The comparison uses Git blob hashes of original bytes, including line endings, and the shared
analyzer Java file selection. Missing/extra Java files are included; graph-less files such as
`package-info.java` are also included. A common ZIP wrapper may be removed; no repository subtree
is selected implicitly. Partial source ZIPs are not full-repository verification.
Truncated trees, ambiguous roots, eligible submodules, unsupported Java entries (including
symlinks), or more than 5,000 repository Java files cannot receive a verified result.
Configuration, resources, dependencies and runtime behavior are outside the comparison scope.
Fingerprints share the graph's bounded registry entry and disappear on eviction/deletion.

The declaration does not verify ZIP contents. Commit BASE is the first parent.
PR base/head are checked again after file pagination; concurrent changes reject the request.
File mapping states are `MAPPED_METHOD`, `CLASS_FALLBACK`, `UNMAPPED`,
`AMBIGUOUS_PATH`, `SKIPPED_NON_JAVA`; fallback is explicitly labelled.
`summary.uniqueImpactNodes` counts the union by Node ID excluding changed starts.
Tests rank by minimum depth, then confidence, then ID; these are candidates, not executed tests.
`maxStartRiskScore` is the maximum individual CRI, not an aggregate PR risk score.

## Browser report review records (not a server endpoint)

Saved report JSON (`formatVersion:1`, or the supported legacy report shape) may contain
`review: {version:1, reviewer:string, entries:[]}`. Each entry contains `analysisKey`,
`nodeId`, `decision`, `reason`, and `updatedAt`. Keys must match an analysis in that
report; node IDs must exist in its graph. Decisions are `CONFIRMED`, `EXCLUDED`,
`NEEDS_REVIEW`, and `MISSING`. The first three refer to predicted candidates;
`MISSING` refers to graph nodes absent from that analysis's candidates. Changed
starts and PROJECT/PACKAGE nodes cannot be annotated. Exclusion/missing reasons
must be nonempty. Entries are unique by analysis key and node ID.

Limits: 2,000 entries per report, 100 characters for the reviewer label, 2,000 for
each reason, and the existing 10MiB whole-report limit. Unknown review fields are
discarded; invalid records reject the import while retaining the previous slot.
The browser editor creates the analysis keys; retain them during JSON round trips.
These records are user claims, not authenticated reviews, executed tests, or
Ground Truth. They never modify the graph, CRI, evaluation metrics, or comparison
delta. HTML report exports include them; comparison HTML includes only records
for the selected analysis. See [review record workflow](REVIEW_NOTES_2026_10_17.md).
