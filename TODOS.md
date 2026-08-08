# TODOS

Open work, grouped by component, ordered P0 (highest) through P4.

## Build & tooling

### No CI pipeline
**Priority:** P2

Nothing runs `npm test` automatically. The suite currently passes under Node
20.20.2 in the build image, but that was executed by hand. Add a workflow that
builds the image and runs the tests on push.

### No lockfile for reproducible Docker builds
**Priority:** P2

`bun install` writes `bun.lock`, but the `Dockerfile` runs `npm install` against
`node:20-alpine`, so container builds do not use it and are not reproducible.
Either generate a `package-lock.json` and switch the Dockerfile to `npm ci`, or
switch the image to a Bun base and use `bun install --frozen-lockfile`.

## get_frappe_doc

### No way to discover valid paths
**Priority:** P2

The tool fetches by exact path only. A client that does not already know
`en/basics/doctypes` has no way to find it. Add a `search_frappe_docs` tool, or
expose the docs navigation tree as an MCP resource.

### No caching
**Priority:** P3

Every call re-fetches and re-parses ~960 KB. Repeated lookups of the same page
within a session pay the full cost each time. An in-memory TTL cache keyed by
resolved URL would be a small change.

### Code blocks lose their language hint
**Priority:** P3

Turndown emits bare ``` fences. Frappe docs mark language via a class on the
`<code>` element (e.g. `language-python`). Mapping that class onto the fence
would make returned snippets more useful.

### Response size is unbounded
**Priority:** P3

Extraction cuts a typical page from ~960 KB to a few KB, which resolves the
practical problem. There is still no hard cap, so an unusually large article
could return more than a client wants. Consider a configurable byte ceiling with
an explicit truncation notice.

## Completed

- **Rewrite as a real MCP stdio server** — replaced the Express HTTP endpoint
  with `@modelcontextprotocol/sdk` + `StdioServerTransport`; handshake verified
  end to end. **Completed:** v0.1.0 (2026-08-08)
- **Move diagnostics off stdout** — startup banner goes to stderr; `.vscode/mcp.json`
  invokes `node` directly instead of `npm run start`. **Completed:** v0.1.0 (2026-08-08)
- **Fix the repeated-query-parameter crash** — HTTP surface removed, input
  validated through zod. **Completed:** v0.1.0 (2026-08-08)
- **Reject path traversal** — `..` segments rejected, segments percent-encoded.
  **Completed:** v0.1.0 (2026-08-08)
- **Fix prefix deduplication** — anchored to leading segments; bare
  `framework/user` resolves to the index. **Completed:** v0.1.0 (2026-08-08)
- **Drop node-fetch** — project is ESM, uses Node 20 global `fetch`.
  **Completed:** v0.1.0 (2026-08-08)
- **Fix the Docker build context** — multi-stage build, `.dockerignore` added;
  `tsconfig.build.json` keeps `*.test.ts` out of the image.
  **Completed:** v0.1.0 (2026-08-08)
- **Reduce response size** — article extraction and markdown conversion.
  **Completed:** v0.1.0 (2026-08-08)
