import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { htmlToMarkdown } from './extract.js';

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
    assert.match(md, /```\nbench start\n```/);
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

  it('produces a large reduction on a nav-heavy page', () => {
    const bigNav = '<nav>' + '<a href="/x">link</a>'.repeat(2000) + '</nav>';
    const html = page(`${bigNav}<article><p>Just this sentence.</p></article>`);

    const md = htmlToMarkdown(html);
    assert.equal(md, 'Just this sentence.');
    assert.ok(md.length < html.length / 100, `expected heavy reduction, got ${md.length}`);
  });
});
