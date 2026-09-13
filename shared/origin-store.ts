import type { OriginEntity } from './types.js';

// CacheService depends on this interface rather than a concrete database, so
// the same service class can run against Node's native SQLite on the server
// and an in-memory, localStorage-backed store in the browser demo.
export interface OriginStore {
  getEntity(id: string, simulatedDelayMs?: number): Promise<OriginEntity | null>;
  upsertEntity(id: string, category: string, name: string, payload: Record<string, unknown>): OriginEntity;
  getAll(): OriginEntity[];
}
