import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { type DocEntry, formatResults, parseCatalog, searchCatalog } from './catalog.js';

const navPage = (links: string) =>
  `<!doctype html><html><body><nav>${links}</nav></body></html>`;

const link = (href: string, text: string) => `<a href="${href}">${text}</a>`;

describe('parseCatalog', () => {
  it('extracts paths and titles from docs links', () => {
    const html = navPage(
      link('/framework/user/en/introduction', 'Introduction') +
        link('/framework/user/en/tutorial/create-an-app', 'Create an App'),
    );

    assert.deepEqual(parseCatalog(html), [
      { path: 'en/introduction', title: 'Introduction' },
      { path: 'en/tutorial/create-an-app', title: 'Create an App' },
    ]);
  });

  it('handles absolute hrefs', () => {
    const html = navPage(link('https://docs.frappe.io/framework/user/en/intro', 'Intro'));
    assert.deepEqual(parseCatalog(html), [{ path: 'en/intro', title: 'Intro' }]);
  });

  it('ignores links outside the docs tree', () => {
    const html = navPage(
      link('/framework/user/en/intro', 'Intro') +
        link('https://github.com/frappe/frappe', 'GitHub') +
        link('/other/section/page', 'Elsewhere'),
    );
    assert.deepEqual(parseCatalog(html), [{ path: 'en/intro', title: 'Intro' }]);
  });

  it('strips query strings, fragments and trailing slashes', () => {
    const html = navPage(
      link('/framework/user/en/intro?utm=nav', 'A') +
        link('/framework/user/en/other#section', 'B') +
        link('/framework/user/en/third/', 'C'),
    );
    assert.deepEqual(
      parseCatalog(html).map((e) => e.path),
      ['en/intro', 'en/other', 'en/third'],
    );
  });

  it('keeps the first title when a path repeats', () => {
    const html = navPage(
      link('/framework/user/en/intro', 'Introduction') +
        link('/framework/user/en/intro', 'Intro (duplicate)'),
    );
    assert.deepEqual(parseCatalog(html), [{ path: 'en/intro', title: 'Introduction' }]);
  });

  it('collapses whitespace in titles', () => {
    const html = navPage(link('/framework/user/en/intro', '\n  Getting   Started \n'));
    assert.equal(parseCatalog(html)[0].title, 'Getting Started');
  });

  it('skips links with no visible text', () => {
    const html = navPage(
      link('/framework/user/en/blank', '') + link('/framework/user/en/real', 'Real'),
    );
    assert.deepEqual(
      parseCatalog(html).map((e) => e.path),
      ['en/real'],
    );
  });

  it('skips a bare link to the docs root', () => {
    const html = navPage(link('/framework/user/', 'Docs home'));
    assert.deepEqual(parseCatalog(html), []);
  });

  it('prefers the largest nav when several exist', () => {
    const html = `<!doctype html><html><body>
      <nav>${link('/framework/user/en/breadcrumb', 'Breadcrumb')}</nav>
      <nav>${link('/framework/user/en/a', 'A')}${link('/framework/user/en/b', 'B')}</nav>
    </body></html>`;

    assert.deepEqual(
      parseCatalog(html).map((e) => e.path),
      ['en/a', 'en/b'],
    );
  });

  it('falls back to the whole document when there is no nav', () => {
    const html = `<!doctype html><html><body><div>${link('/framework/user/en/a', 'A')}</div></body></html>`;
    assert.deepEqual(parseCatalog(html), [{ path: 'en/a', title: 'A' }]);
  });

  it('returns an empty catalogue for empty or non-string input', () => {
    assert.deepEqual(parseCatalog(''), []);
    assert.deepEqual(parseCatalog('   '), []);
    assert.deepEqual(parseCatalog(undefined as unknown as string), []);
  });
});

describe('searchCatalog', () => {
  const catalog: DocEntry[] = [
    { path: 'en/introduction', title: 'Introduction' },
    { path: 'en/tutorial/create-a-doctype', title: 'Create a DocType' },
    { path: 'en/tutorial/doctype-features', title: 'DocType Features' },
    { path: 'en/basics/doctypes', title: 'DocTypes' },
    { path: 'en/api/document', title: 'Document API' },
    { path: 'en/guides/deployment/installation', title: 'Installation' },
  ];

  it('ranks a title match above a path-only match', () => {
    const results = searchCatalog(catalog, 'document');
    assert.equal(results[0].title, 'Document API');
  });

  it('requires every query token to match', () => {
    const results = searchCatalog(catalog, 'create doctype');
    assert.deepEqual(
      results.map((e) => e.path),
      ['en/tutorial/create-a-doctype'],
    );
  });

  it('narrows rather than widens as tokens are added', () => {
    const broad = searchCatalog(catalog, 'doctype');
    const narrow = searchCatalog(catalog, 'doctype features');
    assert.ok(narrow.length < broad.length, 'extra token should narrow the results');
    assert.deepEqual(
      narrow.map((e) => e.path),
      ['en/tutorial/doctype-features'],
    );
  });

  it('is case and punctuation insensitive', () => {
    assert.deepEqual(searchCatalog(catalog, 'DOCTYPE!!'), searchCatalog(catalog, 'doctype'));
  });

  it('prefers a shallower page when scores are otherwise close', () => {
    const results = searchCatalog(catalog, 'doctypes');
    assert.equal(results[0].path, 'en/basics/doctypes');
  });

  it('honours the limit', () => {
    assert.equal(searchCatalog(catalog, 'doctype', 1).length, 1);
    assert.equal(searchCatalog(catalog, 'en', 3).length, 3);
  });

  it('returns nothing for a query with no matches', () => {
    assert.deepEqual(searchCatalog(catalog, 'kubernetes'), []);
  });

  it('returns nothing for an empty or unusable query', () => {
    assert.deepEqual(searchCatalog(catalog, ''), []);
    assert.deepEqual(searchCatalog(catalog, '   '), []);
    assert.deepEqual(searchCatalog(catalog, '!!!'), []);
    assert.deepEqual(searchCatalog(catalog, undefined as unknown as string), []);
  });

  it('returns nothing for an invalid limit', () => {
    assert.deepEqual(searchCatalog(catalog, 'doctype', 0), []);
    assert.deepEqual(searchCatalog(catalog, 'doctype', -1), []);
  });

  it('handles an empty catalogue', () => {
    assert.deepEqual(searchCatalog([], 'doctype'), []);
  });
});

describe('formatResults', () => {
  it('lists each result with its path', () => {
    const out = formatResults([{ path: 'en/intro', title: 'Introduction' }], 'intro');
    assert.match(out, /1 page matched "intro"/);
    assert.match(out, /- \*\*Introduction\*\* — `en\/intro`/);
    assert.match(out, /get_frappe_doc/);
  });

  it('pluralises the count', () => {
    const out = formatResults(
      [
        { path: 'a', title: 'A' },
        { path: 'b', title: 'B' },
      ],
      'q',
    );
    assert.match(out, /2 pages matched/);
  });

  it('reports an empty result set', () => {
    assert.match(formatResults([], 'kubernetes'), /No documentation pages matched "kubernetes"/);
  });
});
