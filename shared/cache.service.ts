import { LRUCache } from './lru.js';
import { LFUCache } from './lfu.js';
import { Singleflight } from './singleflight.js';
import type { OriginStore } from './origin-store.js';
import type {
  CacheConfig,
  CacheItemMetadata,
  CacheStats,
  EvictionPolicy,
  StampedeDemoRequest,
  StampedeDemoResult,
  InvalidationPatternResult,
} from './types.js';

// Cache coordination logic shared between the Express gateway and the
// in-browser GitHub Pages demo. It only ever talks to origin data through
// the OriginStore interface, so it has no Node-only dependencies itself.
export class CacheService {
  private lruCache: LRUCache;
  private lfuCache: LFUCache;
  private activePolicy: EvictionPolicy = 'LRU';
  private singleflight = new Singleflight();
  private originDb: OriginStore;

  private hitCount = 0;
  private missCount = 0;
  private coalescedHits = 0;
  private defaultTtlSeconds = 60; // 1 minute default
  private capacity = 50;

  constructor(originDb: OriginStore, initialCapacity = 50) {
    this.capacity = initialCapacity;
    this.lruCache = new LRUCache(this.capacity);
    this.lfuCache = new LFUCache(this.capacity);
    this.originDb = originDb;
  }

  private get activeCache(): LRUCache | LFUCache {
    return this.activePolicy === 'LRU' ? this.lruCache : this.lfuCache;
  }

  public async get(
    key: string,
    options: { simulatedOriginDelayMs?: number; useSingleflight?: boolean } = {}
  ): Promise<{ value: unknown; source: 'cache' | 'origin'; coalesced: boolean; latencyMs: number; metadata?: CacheItemMetadata }> {
    const start = performance.now();
    const useSf = options.useSingleflight !== false; // default true
    const simulatedDelay = options.simulatedOriginDelayMs ?? 70;

    // 1. Check in-memory cache
    const cached = this.activeCache.get(key);
    if (cached.found) {
      this.hitCount++;
      const latencyMs = Number((performance.now() - start).toFixed(2));
      return {
        value: cached.value,
        source: 'cache',
        coalesced: false,
        latencyMs,
        metadata: cached.metadata,
      };
    }

    // 2. Cache Miss: Query slow origin DB
    this.missCount++;

    if (useSf) {
      const { value, coalesced } = await this.singleflight.do(key, async () => {
        const entity = await this.originDb.getEntity(key, simulatedDelay);
        if (entity) {
          this.activeCache.set(key, entity.payload, this.defaultTtlSeconds);
        }
        return entity ? entity.payload : null;
      });

      if (coalesced) {
        this.coalescedHits++;
      }

      const latencyMs = Number((performance.now() - start).toFixed(2));
      return {
        value,
        source: 'origin',
        coalesced,
        latencyMs,
        metadata: this.activeCache.getMetadata(key),
      };
    } else {
      // Without singleflight (direct origin call every time)
      const entity = await this.originDb.getEntity(key, simulatedDelay);
      if (entity) {
        this.activeCache.set(key, entity.payload, this.defaultTtlSeconds);
      }
      const latencyMs = Number((performance.now() - start).toFixed(2));
      return {
        value: entity ? entity.payload : null,
        source: 'origin',
        coalesced: false,
        latencyMs,
        metadata: this.activeCache.getMetadata(key),
      };
    }
  }

  public set(key: string, value: unknown, ttlSeconds?: number): { evicted?: CacheItemMetadata } {
    const ttl = ttlSeconds !== undefined ? ttlSeconds : this.defaultTtlSeconds;
    return this.activeCache.set(key, value, ttl);
  }

  public delete(key: string): boolean {
    return this.activeCache.delete(key);
  }

  public clear(): void {
    this.activeCache.clear();
  }

  public purgePattern(pattern: string): InvalidationPatternResult {
    const purgedKeys = this.activeCache.purgePattern(pattern);
    return {
      pattern,
      matchedKeys: purgedKeys,
      purgedCount: purgedKeys.length,
    };
  }

  public async runStampedeDemo(req: StampedeDemoRequest): Promise<StampedeDemoResult> {
    const { key, concurrentRequests, simulatedOriginDelayMs = 90, useSingleflight = true } = req;

    // Ensure key is invalidated first to simulate a cold miss / cache stampede scenario
    this.activeCache.delete(key);
    this.singleflight.resetCounts();

    const start = performance.now();
    const promises: Promise<{ value: unknown; source: 'cache' | 'origin'; coalesced: boolean; latencyMs: number }>[] = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(this.get(key, { simulatedOriginDelayMs, useSingleflight }));
    }

    const results = await Promise.all(promises);
    const totalDurationMs = Number((performance.now() - start).toFixed(2));
    const averageLatencyMs = Number((results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length).toFixed(2));

    const coalescedCount = results.filter((r) => r.coalesced).length;
    const originCalls = useSingleflight ? 1 : concurrentRequests;
    const cacheHits = results.filter((r) => r.source === 'cache').length;

    // Savings estimate: without singleflight, origin would do concurrentRequests calls
    const savingsPercent = useSingleflight && concurrentRequests > 1
      ? Number((((concurrentRequests - 1) / concurrentRequests) * 100).toFixed(1))
      : 0;

    return {
      key,
      concurrentRequests,
      originCalls,
      cacheHits,
      coalescedHits: coalescedCount,
      totalDurationMs,
      averageLatencyMs,
      savingsPercent,
      useSingleflight,
    };
  }

  public getStats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount;
    const hitRatio = totalRequests > 0 ? Number(((this.hitCount / totalRequests) * 100).toFixed(1)) : 0;

    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRatio,
      totalRequests,
      keyCount: this.activeCache.size(),
      evictionCount: this.activeCache.getEvictionCount(),
      expiredCount: this.activeCache.getExpiredCount(),
      memoryBytes: this.activeCache.getMemoryBytes(),
      capacity: this.capacity,
      activePolicy: this.activePolicy,
    };
  }

  public getAllEntries(): CacheItemMetadata[] {
    return this.activeCache.getAllEntries();
  }

  public updateConfig(config: Partial<CacheConfig>): CacheConfig {
    if (config.capacity && config.capacity > 0 && config.capacity !== this.capacity) {
      this.capacity = config.capacity;
      this.lruCache.setCapacity(this.capacity);
      this.lfuCache.setCapacity(this.capacity);
    }

    if (config.defaultTtlSeconds && config.defaultTtlSeconds >= 0) {
      this.defaultTtlSeconds = config.defaultTtlSeconds;
    }

    if (config.policy && config.policy !== this.activePolicy) {
      const oldEntries = this.activeCache.getAllEntries();
      this.activePolicy = config.policy;
      // Transfer entries to new cache policy
      const newCache = this.activeCache;
      newCache.clear();
      for (const entry of oldEntries) {
        const remainingTtl = entry.expiresAt ? Math.max(1, Math.round((entry.expiresAt - Date.now()) / 1000)) : undefined;
        newCache.set(entry.key, entry.value, remainingTtl);
      }
    }

    return {
      capacity: this.capacity,
      defaultTtlSeconds: this.defaultTtlSeconds,
      policy: this.activePolicy,
    };
  }

  public getOriginEntities() {
    return this.originDb.getAll();
  }

  public upsertOriginEntity(id: string, category: string, name: string, payload: Record<string, unknown>) {
    const updated = this.originDb.upsertEntity(id, category, name, payload);
    // Write-through or invalidate: invalidate on write
    this.activeCache.delete(id);
    return updated;
  }
}
