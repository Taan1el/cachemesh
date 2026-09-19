// In-browser stand-in for services/api.ts, used on the GitHub Pages build
// (import.meta.env.VITE_DEMO_MODE === 'true') where there is no Express API
// to call. Every export here matches api.ts's name and signature, backed by
// the same CacheService class the server runs, wired to a localStorage
// origin store instead of SQLite. See services/index.ts for the switch.
import type {
  CacheStats,
  CacheItemMetadata,
  StampedeDemoRequest,
  StampedeDemoResult,
  InvalidationPatternResult,
  CacheConfig,
  OriginEntity,
  WriteAccess,
} from '../../../shared/types.js';
import { CacheService } from '../../../shared/cache.service.js';
import { BrowserOriginStore } from './browserOriginStore.js';

const DEMO_CAPACITY = 50;
const SWEEP_INTERVAL_MS = 30_000;

let store = new BrowserOriginStore();
let service = new CacheService(store, DEMO_CAPACITY);
service.startExpirySweep(SWEEP_INTERVAL_MS);

// Wipes the simulated origin catalog back to the seed data and starts a
// fresh cache (clears entries, hit/miss counts and eviction stats), the
// same way restarting the real server would.
// The demo has no server, so there is never a key to enter.
export async function fetchWriteAccess(): Promise<WriteAccess> {
  return 'open';
}

export function resetDemoData(): void {
  service.stopExpirySweep();
  store = new BrowserOriginStore();
  store.reset();
  service = new CacheService(store, DEMO_CAPACITY);
  service.startExpirySweep(SWEEP_INTERVAL_MS);
}

export async function fetchStats(): Promise<CacheStats> {
  return service.getStats();
}

export async function fetchEntries(): Promise<CacheItemMetadata[]> {
  return service.getAllEntries();
}

export async function getItem(
  key: string,
  options?: { delay?: number; singleflight?: boolean }
): Promise<{
  data: unknown;
  source: 'cache' | 'origin';
  coalesced: boolean;
  latencyMs: number;
  metadata?: CacheItemMetadata;
}> {
  const result = await service.get(key, {
    simulatedOriginDelayMs: options?.delay,
    useSingleflight: options?.singleflight,
  });
  if (result.value === null || result.value === undefined) {
    // Matches the message the real API sends for a 404 (see
    // server/src/controllers/cache.controller.ts getItem).
    throw new Error(`Key '${key}' not found in cache or origin`);
  }
  return {
    data: result.value,
    source: result.source,
    coalesced: result.coalesced,
    latencyMs: result.latencyMs,
    metadata: result.metadata,
  };
}

export async function setItem(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Field "key" must be a non-empty string');
  }
  if (ttlSeconds !== undefined && (!Number.isFinite(ttlSeconds) || ttlSeconds < 0)) {
    throw new Error('Field "ttlSeconds" must be a non-negative number');
  }
  service.set(key, value, ttlSeconds);
}

export async function deleteItem(key: string): Promise<void> {
  service.delete(key);
}

export async function clearAll(): Promise<void> {
  service.clear();
}

export async function purgePattern(pattern: string): Promise<InvalidationPatternResult> {
  return service.purgePattern(pattern);
}

export async function runStampedeDemo(req: StampedeDemoRequest): Promise<StampedeDemoResult> {
  const count = Math.min(Math.max(1, Math.round(req.concurrentRequests) || 1), 200);
  return service.runStampedeDemo({ ...req, concurrentRequests: count });
}

export async function updateConfig(config: Partial<CacheConfig>): Promise<CacheConfig> {
  if (config.policy !== undefined && config.policy !== 'LRU' && config.policy !== 'LFU') {
    throw new Error('Field "policy" must be "LRU" or "LFU"');
  }
  return service.updateConfig(config);
}

export async function fetchOriginEntities(): Promise<OriginEntity[]> {
  return service.getOriginEntities();
}
