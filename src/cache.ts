/**
 * A small in-memory cache with time-based expiry and a bounded entry count.
 *
 * Docs pages change rarely but are expensive to fetch and parse, so repeated
 * lookups within a session should not pay the full cost each time.
 */

/** Reads the current time in milliseconds. Injectable so tests need no timers. */
export type Clock = () => number;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  readonly #entries = new Map<string, Entry<T>>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: Clock;

  /**
   * @param ttlMs How long an entry stays fresh. Must be positive.
   * @param maxEntries Upper bound on retained entries; the oldest insertion is
   *   evicted once the bound is exceeded.
   * @param now Clock source, overridable in tests.
   */
  constructor(ttlMs: number, maxEntries = 128, now: Clock = Date.now) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive, finite number');
    }
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('maxEntries must be a positive integer');
    }
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
    this.#now = now;
  }

  /** Returns the cached value, or `undefined` if absent or expired. */
  get(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so eviction favours the least recently read.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /** Stores a value, replacing any existing entry and resetting its expiry. */
  set(key: string, value: T): void {
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }

  /**
   * Returns the cached value, or computes, stores and returns it.
   *
   * Concurrent callers for the same key share one in-flight computation, so a
   * burst of identical requests results in a single fetch. A rejected
   * computation is not cached.
   */
  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inFlight = this.#pending.get(key);
    if (inFlight) return inFlight;

    const promise = compute()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.#pending.delete(key);
      });

    this.#pending.set(key, promise);
    return promise;
  }

  readonly #pending = new Map<string, Promise<T>>();

  /** Number of retained entries, including any not yet observed as expired. */
  get size(): number {
    return this.#entries.size;
  }

  /** Drops every entry. */
  clear(): void {
    this.#entries.clear();
  }
}
