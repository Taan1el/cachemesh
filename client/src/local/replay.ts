export type Access = { key: string; timeMs: number };
export type Settings = { sizes: number[]; ttlMs: number; targetHitRate: number };
export type Workspace = { version: 1; accesses: Access[]; settings: Settings };
export type ReplayRow = {
  policy: 'LRU' | 'LFU' | 'TTL'; capacity: number; hits: number; misses: number;
  evictions: number; expirations: number; hitRate: number;
};
export type ReplayReport = { rows: ReplayRow[]; recommendation: ReplayRow | null };

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_ACCESSES = 100_000;
const MAX_SIZES = 12;
const MAX_TIME_MS = Number.MAX_SAFE_INTEGER - 86_400_000;

export function emptyWorkspace(): Workspace {
  return { version: 1, accesses: [], settings: { sizes: [16, 64, 256, 1024], ttlMs: 60_000, targetHitRate: 0.8 } };
}

function validKey(key: string): boolean {
  return key.length >= 1 && key.length <= 512 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(key);
}

function validateAccesses(value: unknown): Access[] {
  if (!Array.isArray(value) || value.length > MAX_ACCESSES) throw new Error('Access log must contain at most 100000 rows.');
  const out: Access[] = [];
  let prior = 0;
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') throw new Error(`Invalid access at row ${i + 1}.`);
    const { key, timeMs } = item as Record<string, unknown>;
    if (typeof key !== 'string' || !validKey(key)) throw new Error(`Invalid key at row ${i + 1}; use 1 to 512 characters without control characters.`);
    if (!Number.isSafeInteger(timeMs) || (timeMs as number) < 0 || (timeMs as number) > MAX_TIME_MS) throw new Error(`Invalid timestamp at row ${i + 1}; expected milliseconds from 0 to ${MAX_TIME_MS} so TTL arithmetic remains exact.`);
    if ((timeMs as number) < prior) throw new Error(`Timestamps must be nondecreasing; row ${i + 1} goes backwards.`);
    prior = timeMs as number;
    out.push({ key, timeMs: timeMs as number });
  }
  return out;
}

export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Settings must be an object.');
  const { sizes, ttlMs, targetHitRate } = value as Record<string, unknown>;
  if (!Array.isArray(sizes) || sizes.length < 1 || sizes.length > MAX_SIZES || sizes.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 100_000)) {
    throw new Error('Sizes must contain 1 to 12 unique integer capacities from 1 to 100000.');
  }
  const sorted = [...sizes as number[]].sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length) throw new Error('Sizes must be unique.');
  if (!Number.isSafeInteger(ttlMs) || (ttlMs as number) < 1 || (ttlMs as number) > 86_400_000) throw new Error('ttlMs must be an integer from 1 to 86400000 milliseconds.');
  if (typeof targetHitRate !== 'number' || !Number.isFinite(targetHitRate) || targetHitRate < 0 || targetHitRate > 1) throw new Error('targetHitRate must be a number from 0 to 1.');
  return { sizes: sorted, ttlMs: ttlMs as number, targetHitRate };
}

export function parseWorkspace(input: string): Workspace {
  if (new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES) throw new Error('Workspace file exceeds 16 MiB.');
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error('Workspace must be valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('Workspace must be an object.');
  const object = value as Record<string, unknown>;
  if (object.version !== 1) throw new Error('Workspace version must be 1.');
  if (!object.settings || typeof object.settings !== 'object') throw new Error('Workspace settings are missing.');
  return { version: 1, accesses: validateAccesses(object.accesses), settings: validateSettings(object.settings) };
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  const pushRow = () => {
    row.push(field); rows.push(row);
    if (rows.length > MAX_ACCESSES + 1) throw new Error('Access log must contain at most 100000 rows.');
    row = []; field = '';
  };
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; afterQuote = true; }
      } else field += c;
    } else if (afterQuote) {
      if (c === ',') {
        if (row.length >= 2) throw new Error('CSV rows may contain at most two fields.');
        row.push(field); field = ''; afterQuote = false;
      }
      else if (c === '\n' || c === '\r') {
        pushRow(); afterQuote = false;
        if (c === '\r' && input[i + 1] === '\n') i += 1;
      } else throw new Error(`Unexpected character after a quoted CSV field at character ${i + 1}.`);
    } else if (c === '"') {
      if (field.length) throw new Error(`Unexpected quote in CSV field at character ${i + 1}.`);
      quoted = true;
    } else if (c === ',') {
      if (row.length >= 2) throw new Error('CSV rows may contain at most two fields.');
      row.push(field); field = '';
    }
    else if (c === '\n' || c === '\r') {
      pushRow();
      if (c === '\r' && input[i + 1] === '\n') i += 1;
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (row.length || field.length || afterQuote) pushRow();
  return rows;
}

export function parseAccessLog(input: string, format: 'csv' | 'lines'): Access[] {
  if (new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES) throw new Error('Access log exceeds 16 MiB.');
  if (format === 'lines') {
    const keys = input.replace(/^\uFEFF/u, '').split(/\r\n|\n|\r/u).map((key) => key.trim()).filter(Boolean);
    if (keys.length > MAX_ACCESSES) throw new Error('Access log must contain at most 100000 rows.');
    return validateAccesses(keys.map((key, i) => ({ key, timeMs: (i + 1) * 1000 })));
  }
  const rows = parseCsvRows(input.replace(/^\uFEFF/u, ''));
  if (!rows.length) throw new Error('CSV is empty; expected headers key and optional timestamp.');
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length) throw new Error('CSV headers must be nonempty and unique.');
  if (headers.some((h) => h !== 'key' && h !== 'timestamp') || !headers.includes('key')) throw new Error('CSV headers must be key and optional timestamp.');
  if (headers.length > 2) throw new Error('CSV headers must be key and optional timestamp.');
  const keyIndex = headers.indexOf('key');
  const timeIndex = headers.indexOf('timestamp');
  // Keep each record's number from the file so an error points at the right row after blank lines.
  const dataRows = rows.slice(1).map((fields, i) => ({ fields, number: i + 2 })).filter(({ fields }) => !(fields.length === 1 && fields[0] === ''));
  if (dataRows.length > MAX_ACCESSES) throw new Error('Access log must contain at most 100000 rows.');
  const accesses = dataRows.map(({ fields, number }, i) => {
    if (fields.length !== headers.length) throw new Error(`CSV row ${number} has ${fields.length} fields; expected ${headers.length}.`);
    const key = fields[keyIndex];
    const rawTime = timeIndex < 0 ? String((i + 1) * 1000) : fields[timeIndex].trim();
    if (rawTime === '' || !/^\d+$/u.test(rawTime) || !Number.isSafeInteger(Number(rawTime))) throw new Error(`CSV row ${number} timestamp must be a nonnegative safe integer in milliseconds.`);
    return { key, timeMs: Number(rawTime) };
  });
  return validateAccesses(accesses);
}

class ExpiryHeap {
  private items: { key: string; expiry: number; sequence: number }[] = [];
  private indexes = new Map<string, number>();
  private sequence = 0;
  get first(): { key: string; expiry: number; sequence: number } | undefined { return this.items[0]; }
  private swap(a: number, b: number) { [this.items[a], this.items[b]] = [this.items[b], this.items[a]]; this.indexes.set(this.items[a].key, a); this.indexes.set(this.items[b].key, b); }
  private less(a: number, b: number) { return this.items[a].expiry < this.items[b].expiry || (this.items[a].expiry === this.items[b].expiry && this.items[a].sequence < this.items[b].sequence); }
  add(key: string, expiry: number) { this.remove(key); const i = this.items.push({ key, expiry, sequence: this.sequence++ }) - 1; this.indexes.set(key, i); this.up(i); }
  remove(key: string) {
    const i = this.indexes.get(key); if (i === undefined) return;
    const last = this.items.pop()!; this.indexes.delete(key);
    if (i < this.items.length) { this.items[i] = last; this.indexes.set(last.key, i); this.up(i); this.down(this.indexes.get(last.key)!); }
  }
  pop() { const item = this.items[0]; if (item) this.remove(item.key); return item; }
  private up(start: number) { let i = start; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; } }
  private down(start: number) { let i = start; while (true) { const l = i * 2 + 1; const r = l + 1; let m = i; if (l < this.items.length && this.less(l, m)) m = l; if (r < this.items.length && this.less(r, m)) m = r; if (m === i) break; this.swap(i, m); i = m; } }
}

function simulate(accesses: Access[], capacity: number, policy: ReplayRow['policy'], ttlMs: number): ReplayRow {
  let hits = 0, misses = 0, evictions = 0, expirations = 0;
  const lru = new Map<string, true>();
  const frequencies = new Map<string, number>();
  const buckets = new Map<number, Set<string>>();
  let minFrequency = 0;
  const expiry = new ExpiryHeap();
  const expiredAt = new Map<string, number>();
  const evict = (key: string) => {
    if (policy === 'LRU') lru.delete(key);
    if (policy === 'LFU') {
      const frequency = frequencies.get(key)!;
      const bucket = buckets.get(frequency)!; bucket.delete(key);
      if (!bucket.size) buckets.delete(frequency);
      frequencies.delete(key);
      if (frequency === minFrequency && !buckets.has(frequency)) minFrequency += 1;
    }
    if (policy === 'TTL') { expiry.remove(key); expiredAt.delete(key); }
  };
  for (const access of accesses) {
    if (policy === 'TTL') {
      while (expiry.first && expiry.first.expiry <= access.timeMs) {
        const expired = expiry.pop()!; expiredAt.delete(expired.key); expirations += 1;
      }
    }
    const found = policy === 'LRU' ? lru.has(access.key) : policy === 'LFU' ? frequencies.has(access.key) : expiredAt.has(access.key);
    if (found) {
      hits += 1;
      if (policy === 'LRU') { lru.delete(access.key); lru.set(access.key, true); }
      if (policy === 'LFU') {
        const old = frequencies.get(access.key)!; const bucket = buckets.get(old)!; bucket.delete(access.key);
        if (!bucket.size) { buckets.delete(old); if (old === minFrequency) minFrequency += 1; }
        const next = old + 1; frequencies.set(access.key, next); if (!buckets.has(next)) buckets.set(next, new Set()); buckets.get(next)!.add(access.key);
      }
      continue;
    }
    misses += 1;
    const size = policy === 'LRU' ? lru.size : policy === 'LFU' ? frequencies.size : expiredAt.size;
    if (size === capacity) {
      const victim = policy === 'LRU' ? lru.keys().next().value as string : policy === 'LFU' ? buckets.get(minFrequency)!.values().next().value as string : expiry.first!.key;
      evict(victim); evictions += 1;
    }
    if (policy === 'LRU') lru.set(access.key, true);
    if (policy === 'LFU') { frequencies.set(access.key, 1); minFrequency = 1; if (!buckets.has(1)) buckets.set(1, new Set()); buckets.get(1)!.add(access.key); }
    if (policy === 'TTL') { const expiration = access.timeMs + ttlMs; expiredAt.set(access.key, expiration); expiry.add(access.key, expiration); }
  }
  const total = hits + misses;
  return { policy, capacity, hits, misses, evictions, expirations, hitRate: total ? hits / total : 0 };
}

export function replay(accesses: Access[], settings: Settings): ReplayReport {
  const safeAccesses = validateAccesses(accesses);
  const safeSettings = validateSettings(settings);
  const rows = safeSettings.sizes.flatMap((capacity) => (['LRU', 'LFU', 'TTL'] as const).map((policy) => simulate(safeAccesses, capacity, policy, safeSettings.ttlMs)));
  const recommendation = safeAccesses.length ? rows.filter((row) => row.hitRate >= safeSettings.targetHitRate).sort((a, b) => a.capacity - b.capacity || b.hitRate - a.hitRate)[0] ?? null : null;
  return { rows, recommendation };
}

export function resultsCsv(report: ReplayReport): string {
  const quote = (value: string) => /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
  return ['policy,capacity,hits,misses,evictions,expirations,hitRate', ...report.rows.map((r) => [r.policy, r.capacity, r.hits, r.misses, r.evictions, r.expirations, r.hitRate].map((v) => quote(String(v))).join(','))].join('\r\n');
}
