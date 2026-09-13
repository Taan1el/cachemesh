export type EvictionPolicy = 'LRU' | 'LFU';

export interface CacheItemMetadata {
  key: string;
  value: unknown;
  sizeBytes: number;
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number | null; // null means no expiration
  frequency: number;
}

export interface CacheStats {
  hitCount: number;
  missCount: number;
  hitRatio: number;
  totalRequests: number;
  keyCount: number;
  evictionCount: number;
  expiredCount: number;
  memoryBytes: number;
  capacity: number;
  activePolicy: EvictionPolicy;
}

export interface StampedeDemoRequest {
  key: string;
  concurrentRequests: number;
  simulatedOriginDelayMs?: number;
  useSingleflight?: boolean;
}

export interface StampedeDemoResult {
  key: string;
  concurrentRequests: number;
  originCalls: number;
  cacheHits: number;
  coalescedHits: number;
  totalDurationMs: number;
  averageLatencyMs: number;
  savingsPercent: number;
  useSingleflight: boolean;
}

export interface InvalidationPatternResult {
  pattern: string;
  matchedKeys: string[];
  purgedCount: number;
}

export interface CacheConfig {
  capacity: number;
  defaultTtlSeconds: number;
  policy: EvictionPolicy;
}

export interface OriginEntity {
  id: string;
  category: string;
  name: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  latencyMs?: number;
  source?: 'cache' | 'origin';
}
