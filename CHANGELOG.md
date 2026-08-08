# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version in
`package.json` is the source of truth.

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

[0.1.0]: https://github.com/OWNER/frappe_docs_mcp/releases/tag/v0.1.0
