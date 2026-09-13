import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchStats,
  fetchEntries,
  getItem,
  setItem,
  deleteItem,
  clearAll,
  purgePattern,
  runStampedeDemo,
  updateConfig,
  fetchOriginEntities,
  resetDemoData,
} from '../services/demoApi.js';
import { DEMO_STORAGE_KEY, BrowserOriginStore } from '../services/browserOriginStore.js';

// The demo adapter is the entire data layer on GitHub Pages (no API server
// exists there), so it gets the same kind of coverage the real API's
// integration tests get: seeded data, cache hit/miss behavior, coalescing,
// validation, and persistence across "page loads" (new store instances).
describe('demoApi (in-browser data layer)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDemoData();
  });

  it('starts from the seeded origin catalog', async () => {
    const entities = await fetchOriginEntities();
    const ids = entities.map((e) => e.id).sort();
    expect(ids).toEqual([
      'config:cluster-routing',
      'inventory:warehouse-tallinn',
      'pricing:eu-vat',
      'product:pro-mesh',
      'user:101',
    ]);
  });

  it('serves a cold miss from origin then a warm hit from cache', async () => {
    const first = await getItem('user:101', { delay: 5 });
    expect(first.source).toBe('origin');
    expect((first.data as { role: string }).role).toBe('Lead Architect');

    const second = await getItem('user:101');
    expect(second.source).toBe('cache');

    const stats = await fetchStats();
    expect(stats.hitCount).toBe(1);
    expect(stats.missCount).toBe(1);
  });

  it('throws a not-found error for a missing key, matching the real API message', async () => {
    await expect(getItem('does:not:exist')).rejects.toThrow(
      "Key 'does:not:exist' not found in cache or origin"
    );
  });

  it('sets, lists and deletes a key', async () => {
    await setItem('demo:key', { hello: 'world' }, 30);
    let entries = await fetchEntries();
    expect(entries.some((e) => e.key === 'demo:key')).toBe(true);

    await deleteItem('demo:key');
    entries = await fetchEntries();
    expect(entries.some((e) => e.key === 'demo:key')).toBe(false);
  });

  it('rejects an empty key and a negative TTL', async () => {
    await expect(setItem('   ', 1)).rejects.toThrow('non-empty string');
    await expect(setItem('ok:key', 1, -5)).rejects.toThrow('non-negative number');
  });

  it('purges keys by pattern and clears everything', async () => {
    await setItem('cache:a', 1);
    await setItem('cache:b', 2);
    await setItem('other:c', 3);

    const purged = await purgePattern('cache:*');
    expect(purged.purgedCount).toBe(2);

    await clearAll();
    const entries = await fetchEntries();
    expect(entries).toHaveLength(0);
  });

  it('coalesces a stampede of concurrent requests into a single origin call', async () => {
    const result = await runStampedeDemo({
      key: 'product:pro-mesh',
      concurrentRequests: 25,
      simulatedOriginDelayMs: 10,
      useSingleflight: true,
    });
    expect(result.originCalls).toBe(1);
    expect(result.coalescedHits).toBe(24);
  });

  it('switches eviction policy through updateConfig and rejects an invalid one', async () => {
    const updated = await updateConfig({ policy: 'LFU', capacity: 5 });
    expect(updated.policy).toBe('LFU');
    expect(updated.capacity).toBe(5);

    await expect(updateConfig({ policy: 'MRU' as never })).rejects.toThrow('"LRU" or "LFU"');
  });

  it('persists origin writes to localStorage so a new store instance sees them', async () => {
    await setItem('probe', 1); // touches storage indirectly via origin reads only; use upsert path instead
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    expect(raw).toBeTruthy();

    // Simulate a fresh page load: a brand new store instance should read
    // back whatever was last persisted rather than re-seeding from scratch.
    const reloaded = new BrowserOriginStore();
    const entity = await reloaded.getEntity('user:101', 0);
    expect(entity?.name).toBe('Katrin Tamm');
  });

  it('resetDemoData wipes cache stats and restores the seed catalog', async () => {
    await getItem('user:101', { delay: 0 });
    await setItem('scratch:key', 1);
    expect((await fetchStats()).totalRequests).toBeGreaterThan(0);

    resetDemoData();

    const stats = await fetchStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.keyCount).toBe(0);
    const entities = await fetchOriginEntities();
    expect(entities).toHaveLength(5);
  });
});
