# gitstate-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that
exposes **gitstate** to any MCP-capable agent host (Claude Code, Cursor, …).
It is the capstone of gitstate's AI/agent flywheel: agents can search work,
pull a token-efficient context bundle to start from, record what they did, and
move issue state — all through the host's native tool UI.

`gitstate-mcp` is a thin **MCP ↔ HTTP bridge**. Every tool call proxies to
gitstate's existing HTTP API using a gitstate API token; the bridge holds no
database logic of its own. The token's scopes gate what works.

## Build

```sh
go build -o gitstate-mcp ./cmd/gitstate-mcp
```

Put the resulting `gitstate-mcp` binary on your `PATH` (or reference it by
absolute path in the client config below).

## Configuration

Configured entirely via environment variables:

| Variable         | Required | Default                 | Notes                                            |
| ---------------- | -------- | ----------------------- | ------------------------------------------------ |
| `GITSTATE_TOKEN` | yes      | —                       | A gitstate API token (`gsk_…`). Never logged.    |
| `GITSTATE_URL`   | no       | `http://localhost:8080` | Base URL of your gitstate server.                |

Every request is sent with `Authorization: Bearer $GITSTATE_TOKEN`. The token's
**scopes** decide which tools succeed:

- `read:context` / `read:issues` → `search_issues`, `get_issue`, `get_pr_context`, `list_issues`
- `write:agent_runs` → `log_agent_run`
- `write:issues` → `update_issue_state`

The transport is **stdio**: newline-delimited JSON-RPC 2.0, one object per line.
`stdout` carries protocol frames only; all diagnostics go to `stderr`.

## Client configuration

Add the server to your MCP client config (e.g. Claude Code's
`~/.claude.json` / a project `.mcp.json`, or Cursor's `mcp.json`):

```json
{
  "mcpServers": {
    "gitstate": {
      "command": "gitstate-mcp",
      "env": {
        "GITSTATE_TOKEN": "gsk_your_token_here",
        "GITSTATE_URL": "http://localhost:8080"
      }
    }
  }
}
```

If the binary is not on your `PATH`, use its absolute path as `command`.

## Tools

| Tool                 | Required scope     | Endpoint                       | Purpose                                                            |
| -------------------- | ------------------ | ------------------------------ | ----------------------------------------------------------------- |
| `search_issues`      | read               | `GET /api/search`              | Full-text search across issues, PRs, and commits.                 |
| `get_issue`          | read:context       | `GET /api/context/issue/{id}`  | Agent start-work bundle for an issue.                             |
| `get_pr_context`     | read:context       | `GET /api/context/pr/{id}`     | PR bundle: header, diff summary, cycle time, calibrated estimate. |
| `list_issues`        | read:issues        | `GET /api/issues`              | List issues (optional `state` filter, client-side `limit`).       |
| `log_agent_run`      | write:agent_runs   | `POST /api/agent-runs`         | Record an agent run (goal, outcome, diff summary, cost).          |
| `update_issue_state` | write:issues       | `PATCH /api/issues/{id}`       | Move an issue to a new state (writes back to git platforms).      |

### Tool arguments

- **search_issues** — `query` (required), `type` (`issues`|`prs`|`commits`), `limit`.
- **get_issue** — `id` (required).
- **get_pr_context** — `id` (required).
- **list_issues** — `state`, `limit`.
- **log_agent_run** — `goal` (required), `repoId`, `prId`, `issueId`, `agentName`,
  `branch`, `testsPassed`, `humanAction` (`accepted`|`edited`|`reverted`),
  `iterations`, `costUsd`, `additions`, `deletions`, `changedFiles`. The diff
  fields are folded into the `diffSummary` object the API expects.
- **update_issue_state** — `id` (required), `state` (required).

Tool failures (bad arguments, HTTP errors from gitstate) are reported **in-band**
as a tool result with `isError: true`, so the host can show the message to the
model rather than aborting the session.

## Development

```sh
go build ./cmd/gitstate-mcp
go vet ./cmd/gitstate-mcp
go test ./cmd/gitstate-mcp
```

The tests drive the server with a scripted stdin against an `httptest` stand-in
for gitstate, asserting the JSON-RPC framing, correct upstream requests
(path + `Authorization` + body), tool-error passthrough, and that nothing other
than protocol frames reaches stdout.
