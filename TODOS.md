# TODOS

Open work, grouped by component, ordered P0 (highest) through P4.

No open items.

## Completed

### v0.2.0 (2026-08-08)

- **Add CI** — GitHub Actions on Node 20 and 22: `npm ci`, typecheck, tests, a
  check that no test files leak into the production build, and a Docker smoke
  test asserting the stdio contract (nothing on stdout before a client speaks).
  **Completed:** v0.2.0 (2026-08-08)
- **Commit a lockfile for reproducible Docker builds** — `package-lock.json`
  generated under Node 20; Dockerfile switched from `npm install` to `npm ci` in
  both stages. **Completed:** v0.2.0 (2026-08-08)
- **Make paths discoverable** — added the `search_frappe_docs` tool, which builds
  a catalogue of all ~215 pages from the navigation tree embedded in any docs
  page and ranks them against a keyword query.
  **Completed:** v0.2.0 (2026-08-08)
- **Cache fetched pages** — `TtlCache` with configurable TTL, bounded size, LRU
  eviction and request coalescing, applied to both pages and the catalogue.
  Repeat lookup measured at 709 ms cold to 51 ms warm.
  **Completed:** v0.2.0 (2026-08-08)
- **Bound response size** — `FRAPPE_DOCS_MAX_BYTES` (default 100 KB), cutting on
  a line boundary with an explicit truncation notice, byte-accurate for
  multi-byte text. **Completed:** v0.2.0 (2026-08-08)
- **Label code fences** — implemented, but not as the original item described.
  The item assumed the docs mark language with a `language-python` class; they
  carry no class at all, so there was nothing to map. The class-based path exists
  and takes precedence where a marker is present, and on this site the language
  is inferred from content on high-confidence signals only, staying unlabelled
  when ambiguous. **Completed:** v0.2.0 (2026-08-08)

### v0.1.0 (2026-08-08)

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
