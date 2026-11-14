import { describe, expect, it } from 'vitest';
import { emptyWorkspace, parseAccessLog, parseWorkspace, replay, resultsCsv, validateSettings, type Access } from './replay';

function reference(accesses: Access[], capacity: number, policy: 'LRU' | 'LFU' | 'TTL', ttlMs: number) {
  const residents: { key: string; frequency: number; expires: number }[] = [];
  let hits = 0, misses = 0, evictions = 0, expirations = 0;
  for (const access of accesses) {
    if (policy === 'TTL') {
      for (let i = residents.length - 1; i >= 0; i -= 1) {
        if (residents[i].expires <= access.timeMs) { residents.splice(i, 1); expirations += 1; }
      }
    }
    const index = residents.findIndex((entry) => entry.key === access.key);
    if (index >= 0) {
      hits += 1;
      if (policy === 'LRU') residents.push(residents.splice(index, 1)[0]);
      if (policy === 'LFU') { residents[index].frequency += 1; residents.push(residents.splice(index, 1)[0]); }
      continue;
    }
    misses += 1;
    if (residents.length === capacity) {
      let victim = 0;
      if (policy === 'LFU') for (let i = 1; i < residents.length; i += 1) if (residents[i].frequency < residents[victim].frequency) victim = i;
      residents.splice(victim, 1); evictions += 1;
    }
    residents.push({ key: access.key, frequency: 1, expires: access.timeMs + ttlMs });
  }
  return { hits, misses, evictions, expirations, hitRate: accesses.length ? hits / accesses.length : 0 };
}

describe('local replay domain', () => {
  it('starts with valid defaults and validates sorted settings without mutating input', () => {
    expect(parseWorkspace(JSON.stringify(emptyWorkspace()))).toEqual(emptyWorkspace());
    const sizes = [10, 1];
    const settings = validateSettings({ sizes, ttlMs: 10, targetHitRate: 0.5 });
    expect(settings.sizes).toEqual([1, 10]);
    expect(sizes).toEqual([10, 1]);
  });

  it('parses quoted CSV, BOM, embedded newlines, and escaped quotes', () => {
    const accesses = parseAccessLog('\uFEFFkey,timestamp\r\n"page,home",1000\r\n"line one\nline two",1500\r\n"say ""hello""",2000', 'csv');
    expect(accesses).toEqual([
      { key: 'page,home', timeMs: 1000 },
      { key: 'line one\nline two', timeMs: 1500 },
      { key: 'say "hello"', timeMs: 2000 },
    ]);
  });

  it('uses synthetic one second timestamps for nonblank key lines', () => {
    expect(parseAccessLog('\uFEFF alpha \r\n\nbeta\n alpha', 'lines')).toEqual([
      { key: 'alpha', timeMs: 1000 }, { key: 'beta', timeMs: 2000 }, { key: 'alpha', timeMs: 3000 },
    ]);
  });

  it('rejects malformed CSV, repeated headers, invalid timestamps, and reversed time', () => {
    expect(() => parseAccessLog('key,key\na,b', 'csv')).toThrow(/unique/u);
    expect(() => parseAccessLog('key,timestamp\n"unterminated,1', 'csv')).toThrow(/unterminated/u);
    expect(() => parseAccessLog('key,timestamp\na,-1', 'csv')).toThrow(/timestamp/u);
    expect(() => parseAccessLog('key,timestamp\na,2\nb,1', 'csv')).toThrow(/nondecreasing/u);
  });

  it('rejects invalid workspace schemas and settings bounds', () => {
    expect(() => parseWorkspace('{"version":2}')).toThrow(/version/u);
    expect(() => validateSettings({ sizes: [2, 2], ttlMs: 1, targetHitRate: 0.5 })).toThrow(/unique/u);
    expect(() => validateSettings({ sizes: [1], ttlMs: 0, targetHitRate: 0.5 })).toThrow(/ttlMs/u);
    expect(() => parseWorkspace(JSON.stringify({ version: 1, accesses: [{ key: 'x', timeMs: Number.MAX_SAFE_INTEGER }], settings: emptyWorkspace().settings }))).toThrow(/TTL arithmetic/u);
  });

  it('replays LRU with recency and LFU with recency tie breaking', () => {
    const accesses: Access[] = [
      { key: 'a', timeMs: 0 }, { key: 'b', timeMs: 1 }, { key: 'a', timeMs: 2 }, { key: 'c', timeMs: 3 },
      { key: 'a', timeMs: 4 }, { key: 'b', timeMs: 5 },
    ];
    const report = replay(accesses, { sizes: [2], ttlMs: 100, targetHitRate: 0 });
    expect(report.rows.find((r) => r.policy === 'LRU')).toMatchObject({ hits: 2, misses: 4, evictions: 2 });
    expect(report.rows.find((r) => r.policy === 'LFU')).toMatchObject({ hits: 2, misses: 4, evictions: 2 });
  });

  it('expires at the exact TTL boundary and does not refresh expiry on hits', () => {
    const report = replay([{ key: 'x', timeMs: 10 }, { key: 'x', timeMs: 19 }, { key: 'x', timeMs: 20 }], { sizes: [1], ttlMs: 10, targetHitRate: 0 });
    expect(report.rows.find((r) => r.policy === 'TTL')).toMatchObject({ hits: 1, misses: 2, expirations: 1 });
  });

  it('does not mutate input and reports stable smallest-capacity recommendation', () => {
    const accesses: Access[] = [{ key: 'a', timeMs: 0 }, { key: 'a', timeMs: 1 }];
    const before = structuredClone(accesses);
    const report = replay(accesses, { sizes: [2, 1], ttlMs: 10, targetHitRate: 0.5 });
    expect(accesses).toEqual(before);
    expect(report.rows.map((r) => r.capacity)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(report.recommendation).toMatchObject({ capacity: 1, policy: 'LRU' });
    expect(resultsCsv(report)).toContain('policy,capacity,hits,misses,evictions,expirations,hitRate');
  });

  it('keeps one FIFO resident at tied expiry times', () => {
    const report = replay([{ key: 'a', timeMs: 0 }, { key: 'b', timeMs: 0 }, { key: 'c', timeMs: 1 }, { key: 'a', timeMs: 2 }], { sizes: [2], ttlMs: 20, targetHitRate: 0 });
    const ttl = report.rows.find((r) => r.policy === 'TTL')!;
    expect(ttl).toMatchObject({ hits: 0, misses: 4, evictions: 2 });
  });

  it('matches a simple reference simulator across deterministic random traces', () => {
    let state = 713;
    const random = () => { state = (state * 48271) % 2_147_483_647; return state / 2_147_483_647; };
    for (let trial = 0; trial < 40; trial += 1) {
      let timeMs = 0;
      const accesses = Array.from({ length: 35 }, () => {
        timeMs += Math.floor(random() * 4);
        return { key: `k${Math.floor(random() * 6)}`, timeMs };
      });
      const settings = { sizes: [1, 2, 4], ttlMs: 5, targetHitRate: 0.5 };
      const actual = replay(accesses, settings);
      for (const row of actual.rows) {
        expect(row).toMatchObject(reference(accesses, row.capacity, row.policy, settings.ttlMs));
      }
    }
  });

  it('returns no recommendation for an empty trace', () => {
    expect(replay([], { sizes: [1], ttlMs: 1, targetHitRate: 0 }).recommendation).toBeNull();
  });
});
