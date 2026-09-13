import type { OriginEntity } from '../../../shared/types.js';
import type { OriginStore } from '../../../shared/origin-store.js';
import { ORIGIN_SEED_ENTITIES } from '../../../shared/origin-seed.js';

// Namespaced so it never collides with anything else the page might store,
// and versioned so a future shape change can start clean instead of trying
// to migrate old records.
export const DEMO_STORAGE_KEY = 'cachemesh:demo:origin:v1';

function seedEntities(): Map<string, OriginEntity> {
  const now = new Date().toISOString();
  const map = new Map<string, OriginEntity>();
  for (const item of ORIGIN_SEED_ENTITIES) {
    map.set(item.id, { id: item.id, category: item.category, name: item.name, payload: item.payload, updatedAt: now });
  }
  return map;
}

function loadFromStorage(): Map<string, OriginEntity> | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OriginEntity[];
    if (!Array.isArray(parsed)) return null;
    return new Map(parsed.map((entity) => [entity.id, entity]));
  } catch {
    // Corrupt or inaccessible storage (private browsing, quota, a hand-edited
    // value) - fall back to seed data instead of failing the whole page.
    return null;
  }
}

// In-browser stand-in for the server's SQLite origin database. Same shape
// (OriginStore) and same starting catalog (ORIGIN_SEED_ENTITIES), persisted
// to localStorage so a page refresh does not lose data a visitor entered,
// the way the server's database file survives a restart.
export class BrowserOriginStore implements OriginStore {
  private entities: Map<string, OriginEntity>;

  constructor() {
    const loaded = loadFromStorage();
    if (loaded) {
      this.entities = loaded;
    } else {
      this.entities = seedEntities();
      this.persist();
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(Array.from(this.entities.values())));
    } catch {
      // Best effort only; the demo still works for the rest of this session
      // if storage is unavailable or full.
    }
  }

  public async getEntity(id: string, simulatedDelayMs = 80): Promise<OriginEntity | null> {
    if (simulatedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));
    }
    const entity = this.entities.get(id);
    return entity ? { ...entity } : null;
  }

  public upsertEntity(id: string, category: string, name: string, payload: Record<string, unknown>): OriginEntity {
    const entity: OriginEntity = { id, category, name, payload, updatedAt: new Date().toISOString() };
    this.entities.set(id, entity);
    this.persist();
    return { ...entity };
  }

  public getAll(): OriginEntity[] {
    return Array.from(this.entities.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entity) => ({ ...entity }));
  }

  // Used by the "Reset demo data" control: wipes local edits and returns to
  // the original seed catalog.
  public reset(): void {
    this.entities = seedEntities();
    this.persist();
  }
}
