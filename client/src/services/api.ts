import type {
  CacheStats,
  CacheItemMetadata,
  StampedeDemoRequest,
  StampedeDemoResult,
  InvalidationPatternResult,
  CacheConfig,
  OriginEntity,
} from '../../../shared/types.js';

const API_BASE = '/api';

export async function fetchStats(): Promise<CacheStats> {
  const res = await fetch(`${API_BASE}/cache/stats`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchEntries(): Promise<CacheItemMetadata[]> {
  const res = await fetch(`${API_BASE}/cache/entries`);
  if (!res.ok) throw new Error(`Failed to fetch entries: ${res.statusText}`);
  const json = await res.json();
  return json.data;
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
  const params = new URLSearchParams();
  if (options?.delay !== undefined) params.append('delay', String(options.delay));
  if (options?.singleflight !== undefined) params.append('singleflight', String(options.singleflight));

  const url = `${API_BASE}/cache/item/${encodeURIComponent(key)}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function setItem(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const res = await fetch(`${API_BASE}/cache/item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, ttlSeconds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

export async function deleteItem(key: string): Promise<void> {
  const res = await fetch(`${API_BASE}/cache/item/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete key: ${res.statusText}`);
}

export async function clearAll(): Promise<void> {
  const res = await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to clear cache: ${res.statusText}`);
}

export async function purgePattern(pattern: string): Promise<InvalidationPatternResult> {
  const res = await fetch(`${API_BASE}/cache/purge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pattern }),
  });
  if (!res.ok) throw new Error(`Failed to purge pattern: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function runStampedeDemo(req: StampedeDemoRequest): Promise<StampedeDemoResult> {
  const res = await fetch(`${API_BASE}/cache/stampede-demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Stampede simulation failed: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function updateConfig(config: Partial<CacheConfig>): Promise<CacheConfig> {
  const res = await fetch(`${API_BASE}/cache/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to update config: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchOriginEntities(): Promise<OriginEntity[]> {
  const res = await fetch(`${API_BASE}/origin/entities`);
  if (!res.ok) throw new Error(`Failed to fetch origin entities: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}
