import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OriginEntity } from '../../../shared/types.js';
import type { OriginStore } from '../../../shared/origin-store.js';
import { ORIGIN_SEED_ENTITIES } from '../../../shared/origin-seed.js';

// Resolve relative to this file's own location instead of process.cwd(), so
// the database always lands at server/data/origin.db regardless of the
// directory the process was started from. Compiled location is
// dist/server/src/db/origin.js -> ../../../../data
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class OriginDatabase implements OriginStore {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.resolve(__dirname, '../../../../data', 'origin.db');
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(finalPath);
    this.initSchema();
    this.seedDefaults();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS origin_entities (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private seedDefaults(): void {
    const countStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM origin_entities');
    const result = countStmt.get() as { cnt: number };
    if (result.cnt === 0) {
      const insertStmt = this.db.prepare(
        'INSERT INTO origin_entities (id, category, name, payload, updated_at) VALUES (?, ?, ?, ?, ?)'
      );

      const now = new Date().toISOString();
      for (const item of ORIGIN_SEED_ENTITIES) {
        insertStmt.run(item.id, item.category, item.name, JSON.stringify(item.payload), now);
      }
    }
  }

  public async getEntity(id: string, simulatedDelayMs: number = 80): Promise<OriginEntity | null> {
    if (simulatedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));
    }

    const stmt = this.db.prepare('SELECT * FROM origin_entities WHERE id = ?');
    const row = stmt.get(id) as { id: string; category: string; name: string; payload: string; updated_at: string } | undefined;
    if (!row) return null;

    return {
      id: row.id,
      category: row.category,
      name: row.name,
      payload: JSON.parse(row.payload),
      updatedAt: row.updated_at,
    };
  }

  public upsertEntity(id: string, category: string, name: string, payload: Record<string, unknown>): OriginEntity {
    const now = new Date().toISOString();
    const payloadStr = JSON.stringify(payload);
    const stmt = this.db.prepare(`
      INSERT INTO origin_entities (id, category, name, payload, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        category = excluded.category,
        name = excluded.name,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    stmt.run(id, category, name, payloadStr, now);
    return { id, category, name, payload, updatedAt: now };
  }

  public getAll(): OriginEntity[] {
    const stmt = this.db.prepare('SELECT * FROM origin_entities ORDER BY id ASC');
    const rows = stmt.all() as Array<{ id: string; category: string; name: string; payload: string; updated_at: string }>;
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      name: r.name,
      payload: JSON.parse(r.payload),
      updatedAt: r.updated_at,
    }));
  }

  public close(): void {
    this.db.close();
  }
}
