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
`scope`, `maxDepth`, and optional `uploadedRevision` (full 40-character SHA).
Commit requests replace `pullNumber` with `sha` (7–64 hexadecimal characters).
The legacy `*-impact` endpoints retain their list response; the UI now uses reports.

Reports return `baseSha`, `headSha`, `declaredRevision`, `revisionStatus`, `mappingSide`,
`warnings`, `files`, `results` and `summary`. Revision statuses:

- `UNVERIFIED`: no declaration; HEAD NEW lines assumed with a warning.
- `DECLARED_HEAD_MATCH`: declared SHA matches HEAD; use NEW lines.
- `DECLARED_BASE_MATCH`: declared SHA matches BASE; use OLD lines and previous rename paths.
- `DECLARED_MISMATCH`: no impacts computed; file reasons explain the mismatch.

The declaration does not verify ZIP contents. Commit BASE is the first parent.
PR base/head are checked again after file pagination; concurrent changes reject the request.
File mapping states are `MAPPED_METHOD`, `CLASS_FALLBACK`, `UNMAPPED`,
`AMBIGUOUS_PATH`, `SKIPPED_NON_JAVA`; fallback is explicitly labelled.
`summary.uniqueImpactNodes` counts the union by Node ID excluding changed starts.
Tests rank by minimum depth, then confidence, then ID; these are candidates, not executed tests.
`maxStartRiskScore` is the maximum individual CRI, not an aggregate PR risk score.
