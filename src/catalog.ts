/**
 * Discovery for the docs site.
 *
 * Fetching a page requires knowing its exact path, which a client generally does
 * not. Every docs page embeds the full navigation tree, so one fetch yields a
 * catalogue of every page on the site, which can then be searched by keyword.
 */
import { parse } from 'node-html-parser';

import { BASE_URL } from './docs-url.js';

/** A single documentation page. */
export interface DocEntry {
  /** Path relative to the docs root, e.g. `en/tutorial/create-a-doctype`. */
  path: string;
  /** Human-readable title as it appears in the navigation tree. */
  title: string;
}

/** Marks where the site-relative docs path begins inside an `href`. */
const DOCS_HREF_PREFIX = '/framework/user/';

/**
 * Extract every documentation page linked from a docs page.
 *
 * Entries are taken from the largest `<nav>`, which is the full site tree.
 * Documents without one fall back to every link on the page.
 *
 * @param html Raw HTML of any documentation page.
 * @returns Unique entries in document order.
 */
export function parseCatalog(html: string): DocEntry[] {
  if (typeof html !== 'string' || html.trim() === '') {
    return [];
  }

  const root = parse(html, { comment: false });

  let scope: { querySelectorAll: (s: string) => ReturnType<typeof root.querySelectorAll> } = root;
  let best = 0;
  for (const nav of root.querySelectorAll('nav')) {
    const count = nav.querySelectorAll('a[href]').length;
    if (count > best) {
      best = count;
      scope = nav;
    }
  }

  const entries = new Map<string, DocEntry>();
  for (const anchor of scope.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    const start = href.indexOf(DOCS_HREF_PREFIX);
    if (start === -1) continue;

    // Drop any query string or fragment; those are not part of the page path.
    const path = href
      .slice(start + DOCS_HREF_PREFIX.length)
      .split(/[?#]/, 1)[0]
      .replace(/\/+$/, '');
    if (path === '') continue;

    const title = anchor.text.replace(/\s+/g, ' ').trim();
    if (title === '') continue;

    if (!entries.has(path)) {
      entries.set(path, { path, title });
    }
  }

  return [...entries.values()];
}

/** Splits a string into lowercase alphanumeric tokens. */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== '');
}

/**
 * Score one entry against a set of query tokens. Higher is better; 0 means the
 * entry does not match and should be dropped.
 *
 * Every query token must appear somewhere in the entry, so adding a word always
 * narrows the result set rather than widening it.
 */
function scoreEntry(entry: DocEntry, queryTokens: string[]): number {
  const titleTokens = tokenize(entry.title);
  const pathTokens = tokenize(entry.path);
  const title = entry.title.toLowerCase();
  const path = entry.path.toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.includes(token)) {
      score += 10;
    } else if (pathTokens.includes(token)) {
      score += 6;
    } else if (title.includes(token)) {
      score += 3;
    } else if (path.includes(token)) {
      score += 2;
    } else {
      return 0; // Every token must match somewhere.
    }
  }

  // Prefer a title that is mostly the query over one that merely contains it.
  if (titleTokens.length > 0) {
    score += Math.round((queryTokens.length / titleTokens.length) * 5);
  }
  // Prefer shallower pages; they are usually the more general reference.
  score -= path.split('/').length;

  return score;
}

/**
 * Rank catalogue entries against a free-text query.
 *
 * @param entries Catalogue to search.
 * @param query Free-text query, e.g. "create doctype".
 * @param limit Maximum results to return.
 * @returns Matching entries, best first. Empty if the query has no usable tokens.
 */
export function searchCatalog(entries: DocEntry[], query: string, limit = 10): DocEntry[] {
  const queryTokens = tokenize(typeof query === 'string' ? query : '');
  if (queryTokens.length === 0) return [];
  if (!Number.isInteger(limit) || limit < 1) return [];

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, limit)
    .map((scored) => scored.entry);
}

/** Renders search results as markdown for an MCP text response. */
export function formatResults(results: DocEntry[], query: string): string {
  if (results.length === 0) {
    return `No documentation pages matched "${query}".`;
  }
  const lines = results.map((entry) => `- **${entry.title}** — \`${entry.path}\``);
  return [
    `${results.length} page${results.length === 1 ? '' : 's'} matched "${query}":`,
    '',
    ...lines,
    '',
    'Pass a path to `get_frappe_doc` to read one.',
  ].join('\n');
}

/** The page whose navigation tree is parsed to build the catalogue. */
export const CATALOG_SOURCE_URL = `${BASE_URL}/en/introduction`;
