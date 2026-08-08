# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version in
`package.json` is the source of truth.

## [0.2.0] - 2026-08-08

Clears every open item from `TODOS.md`.

### Added

- **`search_frappe_docs` tool.** Fetching previously required knowing a page's
  exact path. Every docs page embeds the full navigation tree, so one fetch
  yields a catalogue of all ~215 pages, searchable by keyword. Every query token
  must match, so extra words narrow the results.
- **In-memory caching** of fetched pages and the catalogue, with a configurable
  TTL (`FRAPPE_DOCS_CACHE_TTL_MS`, default 15 minutes). Concurrent requests for
  the same page share one fetch rather than racing. Measured on a repeat lookup:
  709 ms to 51 ms.
- **Response ceiling** (`FRAPPE_DOCS_MAX_BYTES`, default 100 KB), cutting on a
  line boundary with an explicit truncation notice. Byte-accurate for multi-byte
  text. Set to `0` to disable.
- **Language hints on code fences.** See the caveat below.
- **CI** on Node 20 and 22: `npm ci`, typecheck, tests, a check that no test
  files leak into the production build, and a Docker smoke test asserting the
  server writes nothing to stdout before a client speaks.
- **`package-lock.json`**, with the Docker build switched from `npm install` to
  `npm ci`, so image builds are reproducible and fail loudly on lockfile drift.

### Changed

- `get_frappe_doc` responses are now capped and served from cache when warm.

### Caveat: code fence languages

The original task assumed the docs mark language with a class such as
`language-python`. They do not. Every `<pre><code>` on the site carries no class
at all, so there is nothing to map. The class-based path is implemented and takes
precedence when a marker exists, but on this site the language is inferred from
content instead, and only on high-confidence signals: parseable JSON, a leading
shell command, a leading HTML tag, JavaScript keywords, or Python keywords and
the Python-only `frappe` APIs. Anything ambiguous stays unlabelled, since a
wrong label is worse for a reader than none.

## [0.1.0] - 2026-08-08

Initial commit. An MCP server exposing the Frappe framework documentation over
stdio.

### Added

- `get_frappe_doc` tool that fetches a documentation page and returns its
  readable content as markdown.
- `src/docs-url.ts` — path sanitising and URL construction, isolated so the
  containment rules are directly testable.
- `src/extract.ts` — article extraction and HTML-to-markdown conversion.
- `node:test` suites covering both (28 tests).
- `.dockerignore`, multi-stage `Dockerfile`, and a `docker-compose.yml` that
  reflects how a stdio server is actually run.

### Notes on the starting point

The pre-commit working tree had a set of defects that were fixed before the
initial commit. Recorded here because the code shape changed substantially:

- **Was not an MCP server.** The code was a plain Express HTTP endpoint that
  never read stdin, while `.vscode/mcp.json` declared `"type": "stdio"`. The
  `initialize` handshake could never complete. It now uses
  `@modelcontextprotocol/sdk` with `StdioServerTransport`. The README also
  credited a `@modelcontextprotocol/mcp` SDK that was neither a dependency nor
  imported.
- **Startup banner corrupted the protocol stream.** `console.log` wrote to
  stdout, the channel MCP frames JSON-RPC on. All diagnostics now go to stderr.
  `.vscode/mcp.json` invokes `node` directly rather than `npm run start`, which
  prints its own banner to stdout.
- **Remote crash on a repeated query parameter.** `?path=a&path=b` made Express
  set `req.query.path` to an array, which passed the truthy guard and then threw
  from `path.replace` outside the `try`. Express 4 ignores rejected promises from
  async handlers, so the request hung and the process died. With the HTTP surface
  removed and input validated through zod, the vector is gone.
- **Path traversal.** `..` segments were never stripped, so
  `../../private-page` escaped the documented `framework/user` base. Segments are
  now rejected rather than resolved, and each is percent-encoded, so `?` and `#`
  can no longer pass through unescaped.
- **Broken prefix deduplication.** The `framework\/user\//gi` regex required a
  trailing slash, so a bare `framework/user` was not deduplicated and 404'd.
  Being global and unanchored, it also rewrote `en/framework/user/guide` to
  `en/guide` and fetched the wrong page. The match is now anchored and applied
  only to leading segments.
- **ESM/CJS mismatch.** `node-fetch` 3.x is ESM-only while `tsconfig.json`
  emitted CommonJS. The dependency is removed; Node 20's global `fetch` is used
  instead. The project is now ESM throughout.
- **Docker context pollution.** `COPY . ./` after `npm install` with no
  `.dockerignore` copied the host's `node_modules` and stale `dist` over the
  container's correctly-installed tree. The build is now multi-stage and copies
  only `tsconfig.json` and `src/`.
- **Oversized responses.** A docs page is ~960 KB of raw HTML (~240k tokens),
  which overflows a typical context window on a single call. Responses are now
  reduced to the article body and converted to markdown.

[0.2.0]: https://github.com/muthanii/frappe_docs_mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/muthanii/frappe_docs_mcp/releases/tag/v0.1.0
