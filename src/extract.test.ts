import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  htmlToMarkdown,
  inferLanguage,
  languageFromClass,
  truncateMarkdown,
} from './extract.js';

const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

describe('htmlToMarkdown', () => {
  it('converts headings, links, lists and code', () => {
    const md = htmlToMarkdown(
      page(`<article>
        <h1>Introduction</h1>
        <p>See the <a href="/en/tutorial">tutorial</a>.</p>
        <ul><li>one</li><li>two</li></ul>
        <pre><code>bench start</code></pre>
      </article>`),
    );

    assert.match(md, /^# Introduction$/m);
    assert.match(md, /\[tutorial\]\(\/en\/tutorial\)/);
    assert.match(md, /^- +one$/m);
    assert.match(md, /^- +two$/m);
    assert.match(md, /```bash\nbench start\n```/);
  });

  it('keeps only the article when a sidebar is present', () => {
    const md = htmlToMarkdown(
      page(`<nav><a href="/a">Sidebar link</a></nav>
        <main><article><p>Real content.</p></article></main>`),
    );

    assert.match(md, /Real content\./);
    assert.doesNotMatch(md, /Sidebar link/);
  });

  it('strips chrome nested inside the article', () => {
    const md = htmlToMarkdown(
      page(`<article>
        <p>Body text.</p>
        <script>window.x = 1</script>
        <style>.a { color: red }</style>
        <nav><a href="/next">Next page</a></nav>
        <button>Edit</button>
        <template><p>Unrendered</p></template>
      </article>`),
    );

    assert.match(md, /Body text\./);
    for (const leak of ['window.x', 'color: red', 'Next page', 'Edit', 'Unrendered']) {
      assert.doesNotMatch(md, new RegExp(leak.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  describe('container fallback', () => {
    it('prefers article over main', () => {
      const md = htmlToMarkdown(
        page('<main><p>Outer.</p><article><p>Inner.</p></article></main>'),
      );
      assert.match(md, /Inner\./);
      assert.doesNotMatch(md, /Outer\./);
    });

    it('falls back to main when there is no article', () => {
      const md = htmlToMarkdown(page('<div><p>Chrome.</p></div><main><p>Content.</p></main>'));
      assert.match(md, /Content\./);
      assert.doesNotMatch(md, /Chrome\./);
    });

    it('falls back to role=main', () => {
      const md = htmlToMarkdown(page('<div role="main"><p>Content.</p></div>'));
      assert.match(md, /Content\./);
    });

    it('falls back to the body when nothing matches', () => {
      const md = htmlToMarkdown(page('<div><p>Only this.</p></div>'));
      assert.match(md, /Only this\./);
    });
  });

  describe('degenerate input', () => {
    it('returns an empty string for empty or non-string input', () => {
      assert.equal(htmlToMarkdown(''), '');
      assert.equal(htmlToMarkdown('   '), '');
      assert.equal(htmlToMarkdown(undefined as unknown as string), '');
    });

    it('returns an empty string when the article has no content', () => {
      assert.equal(htmlToMarkdown(page('<article><script>x</script></article>')), '');
    });
  });

  it('collapses runs of blank lines', () => {
    const md = htmlToMarkdown(page('<article><p>a</p><div></div><div></div><p>b</p></article>'));
    assert.doesNotMatch(md, /\n{3,}/);
  });

  describe('code fences', () => {
    it('labels a fence from an explicit language class', () => {
      const md = htmlToMarkdown(
        page('<article><pre><code class="language-python">x = 1</code></pre></article>'),
      );
      assert.match(md, /```python\nx = 1\n```/);
    });

    it('prefers the explicit class over inference', () => {
      const md = htmlToMarkdown(
        page('<article><pre><code class="language-ruby">bench start</code></pre></article>'),
      );
      assert.match(md, /```ruby\n/);
    });

    it('leaves a fence bare when the language is undetermined', () => {
      const md = htmlToMarkdown(page('<article><pre><code>lorem ipsum dolor</code></pre></article>'));
      assert.match(md, /```\nlorem ipsum dolor\n```/);
    });
  });

  it('produces a large reduction on a nav-heavy page', () => {
    const bigNav = '<nav>' + '<a href="/x">link</a>'.repeat(2000) + '</nav>';
    const html = page(`${bigNav}<article><p>Just this sentence.</p></article>`);

    const md = htmlToMarkdown(html);
    assert.equal(md, 'Just this sentence.');
    assert.ok(md.length < html.length / 100, `expected heavy reduction, got ${md.length}`);
  });
});

describe('languageFromClass', () => {
  it('reads the common highlighter conventions', () => {
    assert.equal(languageFromClass('language-python'), 'python');
    assert.equal(languageFromClass('lang-js'), 'js');
    assert.equal(languageFromClass('highlight-bash'), 'bash');
    assert.equal(languageFromClass('prose language-Go'), 'go');
  });

  it('takes the first class that carries a language', () => {
    assert.equal(languageFromClass(null, undefined, '', 'language-rust'), 'rust');
  });

  it('returns empty when no class carries one', () => {
    assert.equal(languageFromClass('prose', 'mt-4'), '');
    assert.equal(languageFromClass(null, undefined), '');
  });
});

describe('inferLanguage', () => {
  it('detects shell sessions', () => {
    assert.equal(inferLanguage('bench start'), 'bash');
    assert.equal(inferLanguage('$ npm install'), 'bash');
    assert.equal(inferLanguage('cd frappe-bench\nbench new-site x'), 'bash');
  });

  it('detects json', () => {
    assert.equal(inferLanguage('{"doctype": "Task"}'), 'json');
    assert.equal(inferLanguage('[1, 2, 3]'), 'json');
  });

  it('does not call malformed json json', () => {
    assert.notEqual(inferLanguage('{ this is not json'), 'json');
  });

  it('detects html', () => {
    assert.equal(inferLanguage('<div class="x">hi</div>'), 'html');
  });

  it('detects javascript before python on the shared frappe namespace', () => {
    assert.equal(inferLanguage('frappe.ui.form.on("Task", {})'), 'javascript');
    assert.equal(inferLanguage('const doc = 1;'), 'javascript');
  });

  it('detects python', () => {
    assert.equal(inferLanguage("doc = frappe.get_doc('Task', 'T1')\ndoc.save()"), 'python');
    assert.equal(inferLanguage('def run(self):\n    pass'), 'python');
    assert.equal(inferLanguage('import frappe'), 'python');
  });

  it('returns empty rather than guessing wrong', () => {
    assert.equal(inferLanguage('lorem ipsum dolor sit amet'), '');
    assert.equal(inferLanguage(''), '');
    assert.equal(inferLanguage('   '), '');
    assert.equal(inferLanguage(undefined as unknown as string), '');
  });
});

describe('truncateMarkdown', () => {
  const encoder = new TextEncoder();

  it('returns short input untouched', () => {
    assert.equal(truncateMarkdown('short', 1000), 'short');
  });

  it('returns input untouched when it exactly fits', () => {
    const text = 'x'.repeat(100);
    assert.equal(truncateMarkdown(text, 100), text);
  });

  it('caps oversized input within the byte ceiling', () => {
    const text = ('line of text\n'.repeat(500)).trim();
    const out = truncateMarkdown(text, 500);

    assert.ok(out.length < text.length, 'should have been shortened');
    assert.ok(
      encoder.encode(out).length <= 500,
      `result must respect the ceiling, got ${encoder.encode(out).length}`,
    );
  });

  it('says how much it dropped', () => {
    const text = 'line of text\n'.repeat(500);
    const out = truncateMarkdown(text, 500);
    assert.match(out, /\[truncated: \d+ of \d+ bytes\./);
  });

  it('accounts for multi-byte characters', () => {
    const text = '日本語のテキスト\n'.repeat(200);
    const out = truncateMarkdown(text, 400);
    assert.ok(
      encoder.encode(out).length <= 400,
      `byte ceiling must hold for multi-byte input, got ${encoder.encode(out).length}`,
    );
  });

  it('treats a non-positive ceiling as unlimited', () => {
    const text = 'x'.repeat(1000);
    assert.equal(truncateMarkdown(text, 0), text);
    assert.equal(truncateMarkdown(text, -1), text);
    assert.equal(truncateMarkdown(text, Number.NaN), text);
  });
});
