import type { CacheItemMetadata } from '../../../shared/types.js';

interface LRUNode<T> {
  key: string;
  value: T;
  sizeBytes: number;
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number | null;
  frequency: number;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

export function estimateBytes(val: unknown): number {
  try {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    return str ? str.length * 2 + 64 : 64; // rough UTF-16 bytes + object overhead
  } catch {
    return 128;
  }
}

// Converts a glob pattern (`*` = any run of characters, `?` = one character)
// into a RegExp, escaping every other regex metacharacter first. Without the
// escaping step, a key like "v1.2.3" would treat "." as "match anything" and
// a pattern containing "(" or "[" would throw instead of matching literally.
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${withWildcards}$`);
}

export class LRUCache<T = unknown> {
  private capacity: number;
  private items = new Map<string, LRUNode<T>>();
  private head: LRUNode<T>; // Sentinel Head (Most Recently Used)
  private tail: LRUNode<T>; // Sentinel Tail (Least Recently Used)
  private totalMemoryBytes = 0;
  private evictionCount = 0;
  private expiredCount = 0;

  constructor(capacity: number = 100) {
    if (capacity <= 0) throw new Error('Capacity must be positive');
    this.capacity = capacity;

    // Sentinel nodes
    this.head = {
      key: '__HEAD__',
      value: null as any,
      sizeBytes: 0,
      hits: 0,
      createdAt: 0,
      lastAccessedAt: 0,
      expiresAt: null,
      frequency: 0,
      prev: null,
      next: null,
    };
    this.tail = {
      key: '__TAIL__',
      value: null as any,
      sizeBytes: 0,
      hits: 0,
      createdAt: 0,
      lastAccessedAt: 0,
      expiresAt: null,
      frequency: 0,
      prev: null,
      next: null,
    };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public setCapacity(newCapacity: number): CacheItemMetadata[] {
    if (newCapacity <= 0) throw new Error('Capacity must be positive');
    this.capacity = newCapacity;
    const evicted: CacheItemMetadata[] = [];
    while (this.items.size > this.capacity) {
      const removed = this.evictTail();
      if (removed) evicted.push(removed);
    }
    return evicted;
  }

  public get(key: string): { found: boolean; value?: T; metadata?: CacheItemMetadata } {
    const node = this.items.get(key);
    if (!node) {
      return { found: false };
    }

    const now = Date.now();
    // Check TTL expiration
    if (node.expiresAt !== null && now > node.expiresAt) {
      this.removeNode(node);
      this.items.delete(key);
      this.totalMemoryBytes -= node.sizeBytes;
      this.expiredCount++;
      return { found: false };
    }

    // Update node stats & move to MRU (head)
    node.hits++;
    node.frequency++;
    node.lastAccessedAt = now;
    this.moveToHead(node);

    return {
      found: true,
      value: node.value,
      metadata: this.toMetadata(node),
    };
  }

  public set(key: string, value: T, ttlSeconds?: number): { evicted?: CacheItemMetadata } {
    const now = Date.now();
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? now + ttlSeconds * 1000 : null;
    const sizeBytes = estimateBytes(value);

    let evictedMetadata: CacheItemMetadata | undefined;

    if (this.items.has(key)) {
      const existing = this.items.get(key)!;
      this.totalMemoryBytes -= existing.sizeBytes;
      existing.value = value;
      existing.sizeBytes = sizeBytes;
      existing.lastAccessedAt = now;
      existing.expiresAt = expiresAt;
      existing.frequency++;
      this.totalMemoryBytes += sizeBytes;
      this.moveToHead(existing);
      return {};
    }

    // If at capacity, evict LRU (tail.prev)
    if (this.items.size >= this.capacity) {
      const evicted = this.evictTail();
      if (evicted) {
        evictedMetadata = evicted;
      }
    }

    const newNode: LRUNode<T> = {
      key,
      value,
      sizeBytes,
      hits: 0,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
      frequency: 1,
      prev: null,
      next: null,
    };

    this.items.set(key, newNode);
    this.addToHead(newNode);
    this.totalMemoryBytes += sizeBytes;

    return { evicted: evictedMetadata };
  }

  public delete(key: string): boolean {
    const node = this.items.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.items.delete(key);
    this.totalMemoryBytes -= node.sizeBytes;
    return true;
  }

  public clear(): void {
    this.items.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.totalMemoryBytes = 0;
  }

  public has(key: string): boolean {
    const node = this.items.get(key);
    if (!node) return false;
    if (node.expiresAt !== null && Date.now() > node.expiresAt) {
      this.delete(key);
      this.expiredCount++;
      return false;
    }
    return true;
  }

  public size(): number {
    return this.items.size;
  }

  public getMemoryBytes(): number {
    return Math.max(0, this.totalMemoryBytes);
  }

  public getEvictionCount(): number {
    return this.evictionCount;
  }

  public getExpiredCount(): number {
    return this.expiredCount;
  }

  public getMetadata(key: string): CacheItemMetadata | undefined {
    const node = this.items.get(key);
    return node ? this.toMetadata(node) : undefined;
  }

  public getAllEntries(): CacheItemMetadata[] {
    const results: CacheItemMetadata[] = [];
    let curr = this.head.next;
    const now = Date.now();
    while (curr && curr !== this.tail) {
      if (curr.expiresAt === null || now <= curr.expiresAt) {
        results.push(this.toMetadata(curr));
      }
      curr = curr.next;
    }
    return results;
  }

  public sweepExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, node] of this.items.entries()) {
      if (node.expiresAt !== null && now > node.expiresAt) {
        this.removeNode(node);
        this.items.delete(key);
        this.totalMemoryBytes -= node.sizeBytes;
        count++;
      }
    }
    this.expiredCount += count;
    return count;
  }

  public purgePattern(pattern: string): string[] {
    const regex = globToRegExp(pattern);
    const purgedKeys: string[] = [];
    for (const [key, node] of this.items.entries()) {
      if (regex.test(key)) {
        this.removeNode(node);
        this.items.delete(key);
        this.totalMemoryBytes -= node.sizeBytes;
        purgedKeys.push(key);
      }
    }
    return purgedKeys;
  }

  // --- Linked List Operations ---

  private addToHead(node: LRUNode<T>): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictTail(): CacheItemMetadata | undefined {
    if (this.tail.prev === this.head || !this.tail.prev) {
      return undefined;
    }
    const lruNode = this.tail.prev;
    this.removeNode(lruNode);
    this.items.delete(lruNode.key);
    this.totalMemoryBytes -= lruNode.sizeBytes;
    this.evictionCount++;
    return this.toMetadata(lruNode);
  }

  private toMetadata(node: LRUNode<T>): CacheItemMetadata {
    return {
      key: node.key,
      value: node.value,
      sizeBytes: node.sizeBytes,
      hits: node.hits,
      createdAt: node.createdAt,
      lastAccessedAt: node.lastAccessedAt,
      expiresAt: node.expiresAt,
      frequency: node.frequency,
    };
  }
}
