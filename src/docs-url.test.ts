import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_URL, InvalidDocPathError, buildDocsUrl } from './docs-url.js';

describe('buildDocsUrl', () => {
  it('appends a plain relative path to the base', () => {
    assert.equal(buildDocsUrl('en/tutorial'), `${BASE_URL}/en/tutorial`);
  });

  it('treats leading slashes as relative to the base', () => {
    assert.equal(buildDocsUrl('/en/tutorial'), `${BASE_URL}/en/tutorial`);
    assert.equal(buildDocsUrl('///en/tutorial'), `${BASE_URL}/en/tutorial`);
  });

  it('trims surrounding whitespace', () => {
    assert.equal(buildDocsUrl('  en/tutorial  '), `${BASE_URL}/en/tutorial`);
  });

  it('collapses empty segments', () => {
    assert.equal(buildDocsUrl('en//tutorial'), `${BASE_URL}/en/tutorial`);
  });

  describe('base-prefix deduplication', () => {
    it('strips a client-supplied prefix', () => {
      assert.equal(buildDocsUrl('framework/user/en/tutorial'), `${BASE_URL}/en/tutorial`);
    });

    it('strips a repeated prefix', () => {
      assert.equal(
        buildDocsUrl('framework/user/framework/user/en/tutorial'),
        `${BASE_URL}/en/tutorial`,
      );
    });

    it('resolves a bare prefix to the docs index', () => {
      assert.equal(buildDocsUrl('framework/user'), BASE_URL);
      assert.equal(buildDocsUrl('/framework/user/'), BASE_URL);
      assert.equal(buildDocsUrl('/'), BASE_URL);
    });

    it('is case-insensitive', () => {
      assert.equal(buildDocsUrl('Framework/User/en/tutorial'), `${BASE_URL}/en/tutorial`);
    });

    it('leaves the prefix alone when it appears mid-path', () => {
      assert.equal(
        buildDocsUrl('en/framework/user/guide'),
        `${BASE_URL}/en/framework/user/guide`,
      );
    });
  });

  describe('containment', () => {
    it('rejects parent-directory traversal', () => {
      assert.throws(() => buildDocsUrl('../../private-page'), InvalidDocPathError);
      assert.throws(() => buildDocsUrl('/../../private-page'), InvalidDocPathError);
      assert.throws(() => buildDocsUrl('en/../../private-page'), InvalidDocPathError);
    });

    it('rejects current-directory segments', () => {
      assert.throws(() => buildDocsUrl('./en/tutorial'), InvalidDocPathError);
    });

    it('keeps a protocol-relative path under the base', () => {
      assert.equal(buildDocsUrl('//evil.example/x'), `${BASE_URL}/evil.example/x`);
    });

    it('keeps an absolute URL under the base', () => {
      const url = buildDocsUrl('https://evil.example/x');
      assert.ok(url.startsWith(`${BASE_URL}/`), `expected containment, got ${url}`);
      assert.ok(!url.includes('//evil.example'), `expected no host swap, got ${url}`);
    });
  });

  describe('rejected input', () => {
    it('rejects a query string or fragment', () => {
      assert.throws(() => buildDocsUrl('en/tutorial?raw=1'), InvalidDocPathError);
      assert.throws(() => buildDocsUrl('en/tutorial#section'), InvalidDocPathError);
    });

    it('rejects an empty or whitespace-only path', () => {
      assert.throws(() => buildDocsUrl(''), InvalidDocPathError);
      assert.throws(() => buildDocsUrl('   '), InvalidDocPathError);
    });

    it('rejects a non-string path', () => {
      assert.throws(() => buildDocsUrl(42 as unknown as string), InvalidDocPathError);
      assert.throws(() => buildDocsUrl(undefined as unknown as string), InvalidDocPathError);
    });
  });

  it('percent-encodes segments', () => {
    assert.equal(buildDocsUrl('en/a b'), `${BASE_URL}/en/a%20b`);
    assert.equal(buildDocsUrl('en/a%b'), `${BASE_URL}/en/a%25b`);
  });
});
