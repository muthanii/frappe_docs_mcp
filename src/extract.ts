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

/** Conventional ways a highlighter records the language of a code block. */
const LANGUAGE_CLASS = /(?:^|\s)(?:language|lang|highlight)-([a-z0-9+#]+)/i;

/**
 * Read an explicit language marker off a `<pre>`/`<code>` class list.
 *
 * The Frappe docs site strips these, so in practice inference does the work.
 * Kept because it is the correct precedence when a marker does exist.
 */
export function languageFromClass(...classNames: (string | null | undefined)[]): string {
  for (const className of classNames) {
    const match = className?.match(LANGUAGE_CLASS);
    if (match) return match[1].toLowerCase();
  }
  return '';
}

/**
 * Guess the language of a code block from its content.
 *
 * Deliberately conservative: an unlabelled fence is more useful to a reader than
 * a confidently wrong one, so anything ambiguous returns an empty string.
 *
 * @param code Body of the code block.
 * @returns A markdown fence info string, or `''` when undetermined.
 */
export function inferLanguage(code: string): string {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (trimmed === '') return '';

  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not JSON; fall through to the other checks.
    }
  }

  // A shell session: the first line invokes a known command.
  if (
    /^(?:[$#>]\s*)?(?:bench|npm|npx|yarn|pnpm|git|cd|sudo|pip3?|docker|mkdir|curl|wget|export|source|systemctl)\b/.test(
      trimmed,
    )
  ) {
    return 'bash';
  }

  if (/^<[a-z!/]/i.test(trimmed)) return 'html';

  // Checked before Python because both share the `frappe.` namespace.
  if (/\b(?:const|let|var|function)\s|=>|\bconsole\.log\(|\bfrappe\.(?:ui|call|msgprint)\b/.test(trimmed)) {
    return 'javascript';
  }

  if (
    /(?:^|\n)\s*(?:def|class|import|from)\s|\bself\.|\bprint\(|\bfrappe\.(?:get_doc|new_doc|get_all|get_list|db)\b/.test(
      trimmed,
    )
  ) {
    return 'python';
  }

  return '';
}

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

  // Turndown's built-in fenced rule emits a bare ``` when the source carries no
  // language class, which the Frappe docs never do. Label what we can identify.
  turndown.addRule('fencedCodeWithLanguage', {
    filter: (node) =>
      node.nodeName === 'PRE' &&
      node.firstChild !== null &&
      node.firstChild.nodeName === 'CODE',
    replacement: (_content, node) => {
      const element = node as unknown as {
        firstChild: { textContent: string | null; getAttribute?: (n: string) => string | null };
        getAttribute?: (name: string) => string | null;
      };
      const code = (element.firstChild.textContent ?? '').replace(/\n+$/, '');
      const language =
        languageFromClass(
          element.getAttribute?.('class'),
          element.firstChild.getAttribute?.('class'),
        ) || inferLanguage(code);
      return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    },
  });

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

const encoder = new TextEncoder();

/**
 * Cap a markdown payload at a byte ceiling, cutting on a line boundary.
 *
 * Extraction already reduces a typical page by two orders of magnitude, so this
 * is a backstop against an unusually large article rather than the main defence.
 *
 * @param markdown Markdown to bound.
 * @param maxBytes Ceiling in UTF-8 bytes. Non-positive disables truncation.
 * @returns The input, or a prefix of it with an explicit truncation notice.
 */
export function truncateMarkdown(markdown: string, maxBytes: number): string {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return markdown;

  const totalBytes = encoder.encode(markdown).length;
  if (totalBytes <= maxBytes) return markdown;

  // Walk back from a byte-proportional guess until the notice also fits.
  let end = Math.min(markdown.length, maxBytes);
  const notice = (kept: number) =>
    `\n\n[truncated: ${kept} of ${totalBytes} bytes. Request a more specific page for the rest.]`;

  while (end > 0) {
    const slice = markdown.slice(0, end);
    const bytes = encoder.encode(slice).length;
    if (bytes + encoder.encode(notice(bytes)).length <= maxBytes) {
      const lastBreak = slice.lastIndexOf('\n');
      const cut = lastBreak > end / 2 ? slice.slice(0, lastBreak) : slice;
      return cut.trimEnd() + notice(encoder.encode(cut).length);
    }
    end = Math.floor(end * 0.9);
  }

  return markdown.slice(0, 0) + notice(0);
}
