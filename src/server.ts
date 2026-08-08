#!/usr/bin/env node
/**
 * MCP server exposing the Frappe framework documentation over stdio.
 *
 * Tools:
 *   search_frappe_docs({ query, limit }) -> matching page titles and paths.
 *   get_frappe_doc({ path })             -> one page's readable content as
 *                                           markdown.
 *
 * stdout carries the JSON-RPC frames and nothing else. All diagnostics go to
 * stderr; writing to stdout here would corrupt the protocol stream.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { TtlCache } from './cache.js';
import {
  CATALOG_SOURCE_URL,
  type DocEntry,
  formatResults,
  parseCatalog,
  searchCatalog,
} from './catalog.js';
import { InvalidDocPathError, buildDocsUrl } from './docs-url.js';
import { htmlToMarkdown, truncateMarkdown } from './extract.js';

/** Give up on a docs request rather than wedging the tool call indefinitely. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Read a positive-integer setting from the environment.
 *
 * An unset variable takes the default. A malformed one is reported on stderr and
 * then takes the default too, so a typo degrades rather than killing the server.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.error(`${name}: expected a non-negative integer, got ${JSON.stringify(raw)}; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Ceiling on a single response. 0 disables truncation. */
const MAX_RESPONSE_BYTES = envInt('FRAPPE_DOCS_MAX_BYTES', 100_000);
/** How long fetched pages and the catalogue stay fresh. */
const CACHE_TTL_MS = envInt('FRAPPE_DOCS_CACHE_TTL_MS', 15 * 60 * 1000);

const pageCache = new TtlCache<string>(Math.max(CACHE_TTL_MS, 1), 64);
const catalogCache = new TtlCache<DocEntry[]>(Math.max(CACHE_TTL_MS, 1), 1);

const textResult = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const errorResult = (text: string) => ({ isError: true, ...textResult(text) });

/** Fetch a URL as text, or throw an Error whose message is client-presentable. */
async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'text/html', 'user-agent': 'frappe-docs-mcp' },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch ${url}: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

const server = new McpServer({
  name: 'frappe-docs-mcp',
  version: '0.2.0',
});

server.registerTool(
  'search_frappe_docs',
  {
    title: 'Search Frappe documentation',
    description:
      'Find Frappe framework documentation pages by keyword. Returns page ' +
      'titles with the paths to pass to get_frappe_doc. Use this first when ' +
      'you do not already know the exact path of the page you want.',
    inputSchema: {
      query: z.string().describe('Keywords to search for, e.g. "create doctype"'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum results to return (default 10)'),
    },
  },
  async ({ query, limit }) => {
    let catalog: DocEntry[];
    try {
      catalog = await catalogCache.getOrCompute('catalog', async () =>
        parseCatalog(await fetchText(CATALOG_SOURCE_URL)),
      );
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    if (catalog.length === 0) {
      return errorResult(`No navigation links found at ${CATALOG_SOURCE_URL}.`);
    }
    return textResult(formatResults(searchCatalog(catalog, query, limit ?? 10), query));
  },
);

server.registerTool(
  'get_frappe_doc',
  {
    title: 'Get Frappe documentation page',
    description:
      'Fetch a page from the Frappe framework user documentation at ' +
      'https://docs.frappe.io/framework/user and return its readable content ' +
      'as markdown. Paths are relative to that prefix and start with a ' +
      'language segment, e.g. "en/tutorial" or "en/basics/doctypes". ' +
      'Use search_frappe_docs to discover paths.',
    inputSchema: {
      path: z
        .string()
        .describe('Documentation path relative to the docs root, e.g. "en/tutorial"'),
    },
  },
  async ({ path }) => {
    let url: string;
    try {
      url = buildDocsUrl(path);
    } catch (err) {
      if (err instanceof InvalidDocPathError) return errorResult(err.message);
      throw err;
    }

    let markdown: string;
    try {
      markdown = await pageCache.getOrCompute(url, async () =>
        htmlToMarkdown(await fetchText(url)),
      );
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    if (markdown === '') {
      return errorResult(`No readable content found at ${url}`);
    }
    return textResult(`Source: ${url}\n\n${truncateMarkdown(markdown, MAX_RESPONSE_BYTES)}`);
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error('frappe-docs-mcp ready on stdio');
}

main().catch((err: unknown) => {
  console.error('frappe-docs-mcp failed to start:', err);
  process.exit(1);
});
