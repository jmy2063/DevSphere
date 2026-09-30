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
