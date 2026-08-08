# Frappe Docs MCP Server

[![CI](https://github.com/muthanii/frappe_docs_mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/muthanii/frappe_docs_mcp/actions/workflows/ci.yml)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives an
MCP client read access to the
[Frappe framework documentation](https://docs.frappe.io/framework/user).

It speaks MCP over **stdio** using the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk),
so any stdio-capable client (VS Code, Claude Desktop, Claude Code) can run it.

## Tools

### `search_frappe_docs`

Finds documentation pages by keyword. Start here when you do not already know a
page's exact path.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Keywords, e.g. `create doctype` |
| `limit` | number | Optional, 1-50, default 10 |

Every docs page embeds the full navigation tree, so one fetch yields a catalogue
of all ~215 pages. Every query token must match somewhere in a result's title or
path, so adding a word narrows the results rather than widening them.

```
1 page matched "create doctype":

- **Create a DocType** — `en/tutorial/create-a-doctype`
```

### `get_frappe_doc`

Fetches a documentation page and returns its readable content as markdown.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Path relative to the docs root, e.g. `en/tutorial` |

Paths always resolve under `https://docs.frappe.io/framework/user`. A leading
`framework/user` is stripped if you include it, `..` segments are rejected rather
than resolved, and each segment is percent-encoded, so a path cannot escape that
prefix or smuggle in a query string.

A raw docs page is roughly 960 KB of HTML, most of it navigation. Only the
article body is kept and converted to markdown, which brings a typical page down
to a few KB.

## Configuration

Both settings are optional. A malformed value is reported on stderr and the
default is used, so a typo degrades rather than killing the server.

| Variable | Default | Meaning |
|----------|---------|---------|
| `FRAPPE_DOCS_MAX_BYTES` | `100000` | Ceiling on one response, in UTF-8 bytes. `0` disables truncation. |
| `FRAPPE_DOCS_CACHE_TTL_MS` | `900000` | How long fetched pages and the catalogue stay fresh (15 minutes). |

Pages and the catalogue are cached in memory, so repeated lookups within a
session do not re-fetch. Concurrent requests for the same page share a single
fetch.

## Requirements

Node.js 20 or newer. There is no `node-fetch` dependency; the server uses the
global `fetch` built into Node 20.

## Quick start

```bash
git clone https://github.com/muthanii/frappe_docs_mcp.git
cd frappe_docs_mcp
npm install
npm run build
npm test
```

## Wiring it into a client

The server reads JSON-RPC from stdin and writes it to stdout, so it must be
launched directly rather than through `npm run start` (npm prints its own banner
to stdout, which corrupts the protocol stream).

VS Code — `.vscode/mcp.json` is already set up:

```json
{
  "servers": {
    "frappe-docs-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/server.js"]
    }
  }
}
```

Claude Desktop / Claude Code — point at the built entry point:

```json
{
  "mcpServers": {
    "frappe-docs-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/frappe_docs_mcp/dist/server.js"]
    }
  }
}
```

Run `npm run build` after any source change so `dist/` stays current.

## Docker

```bash
docker compose run --rm -T frappe-docs-mcp
```

The image publishes no port. This is a stdio server, not an HTTP service, so it
must be run attached with a client owning stdin and stdout.

## Development

| File | Role |
|------|------|
| `src/docs-url.ts` | URL construction and path sanitising |
| `src/catalog.ts` | Navigation-tree parsing and keyword search |
| `src/extract.ts` | Article extraction, markdown conversion, truncation |
| `src/cache.ts` | TTL cache with request coalescing |
| `src/server.ts` | Tool registration and the stdio transport |
| `src/*.test.ts` | `node:test` suites (84 tests) |

Logic is kept out of `server.ts` so it can be tested without spawning a process.

`npm run build` uses `tsconfig.build.json`, which excludes `*.test.ts` so tests
do not ship in the image. `npm test` compiles everything, including the tests.
`package-lock.json` is committed and the Docker build uses `npm ci`, so image
builds are reproducible.

Diagnostics must go to **stderr**. Anything written to stdout is interpreted as
a protocol frame; CI asserts that the server writes nothing to stdout before a
client speaks.

## License

MIT
