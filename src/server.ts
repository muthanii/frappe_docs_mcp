#!/usr/bin/env node
/**
 * MCP server exposing the Frappe framework documentation over stdio.
 *
 * Tools:
 *   get_frappe_doc({ path }) -> the readable content of the requested
 *   documentation page as markdown. `path` is relative to the docs site,
 *   e.g. "en/tutorial".
 *
 * stdout carries the JSON-RPC frames and nothing else. All diagnostics go to
 * stderr; writing to stdout here would corrupt the protocol stream.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { InvalidDocPathError, buildDocsUrl } from './docs-url.js';
import { htmlToMarkdown } from './extract.js';

/** Give up on a docs request rather than wedging the tool call indefinitely. */
const FETCH_TIMEOUT_MS = 15_000;

const server = new McpServer({
  name: 'frappe-docs-mcp',
  version: '0.1.0',
});

server.registerTool(
  'get_frappe_doc',
  {
    title: 'Get Frappe documentation page',
    description:
      'Fetch a page from the Frappe framework user documentation at ' +
      'https://docs.frappe.io/framework/user and return its readable content ' +
      'as markdown. Paths are relative to that prefix and start with a ' +
      'language segment, e.g. "en/tutorial" or "en/basics/doctypes".',
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
      if (err instanceof InvalidDocPathError) {
        return { isError: true, content: [{ type: 'text' as const, text: err.message }] };
      }
      throw err;
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'text/html', 'user-agent': 'frappe-docs-mcp' },
      });
      if (!response.ok) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`,
            },
          ],
        };
      }
      const markdown = htmlToMarkdown(await response.text());
      if (markdown === '') {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `No readable content found at ${url}` }],
        };
      }
      return { content: [{ type: 'text' as const, text: `Source: ${url}\n\n${markdown}` }] };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Failed to fetch ${url}: ${reason}` }],
      };
    }
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
