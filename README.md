# Frappe Docs MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives an
MCP client read access to the
[Frappe framework documentation](https://docs.frappe.io/framework/user).

It speaks MCP over **stdio** using the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk),
so any stdio-capable client (VS Code, Claude Desktop, Claude Code) can run it.

## Tools

### `get_frappe_doc`

Fetches a documentation page and returns its raw HTML.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Path relative to the docs root, e.g. `en/tutorial` |

Paths always resolve under `https://docs.frappe.io/framework/user`. A leading
`framework/user` is stripped if you include it, `..` segments are rejected rather
than resolved, and each segment is percent-encoded, so a path cannot escape that
prefix or smuggle in a query string.

## Requirements

Node.js 20 or newer. There is no `node-fetch` dependency; the server uses the
global `fetch` built into Node 20.

## Quick start

```bash
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

- `src/docs-url.ts` — URL construction and path sanitising, kept separate so the
  containment rules are directly testable.
- `src/extract.ts` — article extraction and HTML-to-markdown conversion.
- `src/*.test.ts` — `node:test` suites covering both.
- `src/server.ts` — tool registration and the stdio transport.

`npm run build` uses `tsconfig.build.json`, which excludes `*.test.ts` so tests
do not ship in the image. `npm test` compiles everything, including the tests.

Diagnostics must go to **stderr**. Anything written to stdout is interpreted as
a protocol frame.

## License

MIT
