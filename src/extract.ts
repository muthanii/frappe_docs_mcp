/**
 * Reduce a documentation page to the readable prose an MCP client actually wants.
 *
 * A Frappe docs page is roughly a megabyte of HTML, most of it navigation trees
 * and inlined component templates. Handing that to a model would blow past its
 * context window on a single tool call, so we keep the article body and convert
 * it to markdown.
 */
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

/** Chrome that carries no documentation content. */
const STRIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'template',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'iframe',
];

/** Tried in order; the first match becomes the extraction root. */
const CONTENT_SELECTORS = ['article', 'main', '[role="main"]', 'body'];

function newTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    hr: '---',
  });
  // Belt and braces: these are dropped from the tree before conversion, but one
  // that survives selector matching should never reach the output either.
  turndown.remove(STRIP_SELECTORS);
  return turndown;
}

/**
 * Convert a documentation HTML page to markdown, keeping only the article body.
 *
 * Narrows to the content container first, then strips chrome inside it, so a
 * page-level sidebar is excluded by the narrowing rather than by tag matching.
 * Falls back through `<article>` to `<main>` to `[role=main]` to `<body>` so a
 * page with unexpected markup still yields its text rather than nothing.
 *
 * @param html Raw HTML of a documentation page.
 * @returns Markdown for the page's readable content, or an empty string if the
 *   page had none.
 */
export function htmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || html.trim() === '') {
    return '';
  }

  const root = parse(html, { comment: false });

  let content = null;
  for (const selector of CONTENT_SELECTORS) {
    content = root.querySelector(selector);
    if (content) break;
  }
  const scope = content ?? root;

  for (const selector of STRIP_SELECTORS) {
    for (const node of scope.querySelectorAll(selector)) {
      node.remove();
    }
  }

  const source = scope.innerHTML;
  if (source.trim() === '') {
    return '';
  }

  return newTurndown()
    .turndown(source)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
