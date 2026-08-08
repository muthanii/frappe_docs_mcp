import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TtlCache } from './cache.js';

/** A clock the test drives by hand, so no real time passes. */
function fakeClock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('TtlCache', () => {
  it('returns a stored value before it expires', () => {
    const clock = fakeClock();
    const cache = new TtlCache<string>(1000, 10, clock.now);

    cache.set('a', 'one');
    clock.advance(999);
    assert.equal(cache.get('a'), 'one');
  });

  it('drops a value once the ttl elapses', () => {
    const clock = fakeClock();
    const cache = new TtlCache<string>(1000, 10, clock.now);

    cache.set('a', 'one');
    clock.advance(1000);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.size, 0, 'expired entry should be evicted on read');
  });

  it('returns undefined for an unknown key', () => {
    assert.equal(new TtlCache<string>(1000).get('missing'), undefined);
  });

  it('resets expiry when a key is overwritten', () => {
    const clock = fakeClock();
    const cache = new TtlCache<string>(1000, 10, clock.now);

    cache.set('a', 'one');
    clock.advance(900);
    cache.set('a', 'two');
    clock.advance(900);
    assert.equal(cache.get('a'), 'two');
  });

  describe('bounded size', () => {
    it('evicts the oldest entry past the limit', () => {
      const cache = new TtlCache<number>(10_000, 2);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      assert.equal(cache.size, 2);
      assert.equal(cache.get('a'), undefined);
      assert.equal(cache.get('b'), 2);
      assert.equal(cache.get('c'), 3);
    });

    it('treats a read as recent use', () => {
      const cache = new TtlCache<number>(10_000, 2);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // 'b' is now the least recently used.
      cache.set('c', 3);

      assert.equal(cache.get('a'), 1);
      assert.equal(cache.get('b'), undefined);
    });
  });

  describe('getOrCompute', () => {
    it('computes once and caches the result', async () => {
      const cache = new TtlCache<string>(10_000);
      let calls = 0;
      const compute = async () => {
        calls += 1;
        return 'value';
      };

      assert.equal(await cache.getOrCompute('k', compute), 'value');
      assert.equal(await cache.getOrCompute('k', compute), 'value');
      assert.equal(calls, 1);
    });

    it('shares one computation between concurrent callers', async () => {
      const cache = new TtlCache<string>(10_000);
      let calls = 0;
      const compute = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return 'value';
      };

      const results = await Promise.all([
        cache.getOrCompute('k', compute),
        cache.getOrCompute('k', compute),
        cache.getOrCompute('k', compute),
      ]);

      assert.deepEqual(results, ['value', 'value', 'value']);
      assert.equal(calls, 1, 'concurrent callers should share one fetch');
    });

    it('does not cache a rejection, and retries on the next call', async () => {
      const cache = new TtlCache<string>(10_000);
      let calls = 0;
      const compute = async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return 'recovered';
      };

      await assert.rejects(() => cache.getOrCompute('k', compute), /boom/);
      assert.equal(await cache.getOrCompute('k', compute), 'recovered');
      assert.equal(calls, 2);
    });

    it('recomputes after the entry expires', async () => {
      const clock = fakeClock();
      const cache = new TtlCache<number>(1000, 10, clock.now);
      let calls = 0;
      const compute = async () => ++calls;

      assert.equal(await cache.getOrCompute('k', compute), 1);
      clock.advance(1000);
      assert.equal(await cache.getOrCompute('k', compute), 2);
    });
  });

  it('clears every entry', () => {
    const cache = new TtlCache<number>(10_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    assert.equal(cache.size, 0);
  });

  describe('constructor validation', () => {
    it('rejects a non-positive ttl', () => {
      assert.throws(() => new TtlCache<number>(0), RangeError);
      assert.throws(() => new TtlCache<number>(-1), RangeError);
      assert.throws(() => new TtlCache<number>(Number.NaN), RangeError);
    });

    it('rejects a non-positive entry bound', () => {
      assert.throws(() => new TtlCache<number>(1000, 0), RangeError);
      assert.throws(() => new TtlCache<number>(1000, 1.5), RangeError);
    });
  });
});
