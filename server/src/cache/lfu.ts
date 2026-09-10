import type { CacheItemMetadata } from '../../../shared/types.js';
import { estimateBytes } from './lru.js';

interface LFUNode<T> {
  key: string;
  value: T;
  sizeBytes: number;
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number | null;
  frequency: number;
  prev: LFUNode<T> | null;
  next: LFUNode<T> | null;
}

class DoublyLinkedList<T> {
  head: LFUNode<T>;
  tail: LFUNode<T>;
  size = 0;

  constructor() {
    this.head = {
      key: '__FREQ_HEAD__',
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
      key: '__FREQ_TAIL__',
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

  addFirst(node: LFUNode<T>): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
    this.size++;
  }

  remove(node: LFUNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
    this.size--;
  }

  removeLast(): LFUNode<T> | null {
    if (this.size === 0 || this.tail.prev === this.head || !this.tail.prev) {
      return null;
    }
    const last = this.tail.prev;
    this.remove(last);
    return last;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }
}

export class LFUCache<T = unknown> {
  private capacity: number;
  private items = new Map<string, LFUNode<T>>();
  private freqBuckets = new Map<number, DoublyLinkedList<T>>();
  private minFrequency = 0;
  private totalMemoryBytes = 0;
  private evictionCount = 0;
  private expiredCount = 0;

  constructor(capacity: number = 100) {
    if (capacity <= 0) throw new Error('Capacity must be positive');
    this.capacity = capacity;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public setCapacity(newCapacity: number): CacheItemMetadata[] {
    if (newCapacity <= 0) throw new Error('Capacity must be positive');
    this.capacity = newCapacity;
    const evicted: CacheItemMetadata[] = [];
    while (this.items.size > this.capacity) {
      const removed = this.evictMinFreq();
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
    if (node.expiresAt !== null && now > node.expiresAt) {
      this.delete(key);
      this.expiredCount++;
      return { found: false };
    }

    node.hits++;
    node.lastAccessedAt = now;
    this.incrementFrequency(node);

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
      this.totalMemoryBytes += sizeBytes;
      this.incrementFrequency(existing);
      return {};
    }

    if (this.items.size >= this.capacity) {
      const evicted = this.evictMinFreq();
      if (evicted) {
        evictedMetadata = evicted;
      }
    }

    const newNode: LFUNode<T> = {
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
    this.getBucket(1).addFirst(newNode);
    this.minFrequency = 1;
    this.totalMemoryBytes += sizeBytes;

    return { evicted: evictedMetadata };
  }

  public delete(key: string): boolean {
    const node = this.items.get(key);
    if (!node) return false;

    const bucket = this.freqBuckets.get(node.frequency);
    if (bucket) {
      bucket.remove(node);
      if (bucket.isEmpty() && this.minFrequency === node.frequency) {
        this.recalculateMinFrequency();
      }
    }

    this.items.delete(key);
    this.totalMemoryBytes -= node.sizeBytes;
    return true;
  }

  public clear(): void {
    this.items.clear();
    this.freqBuckets.clear();
    this.minFrequency = 0;
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
    const now = Date.now();
    for (const node of this.items.values()) {
      if (node.expiresAt === null || now <= node.expiresAt) {
        results.push(this.toMetadata(node));
      }
    }
    // Sort descending by frequency, then ascending by lastAccessedAt
    return results.sort((a, b) => b.frequency - a.frequency || a.lastAccessedAt - b.lastAccessedAt);
  }

  public sweepExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, node] of this.items.entries()) {
      if (node.expiresAt !== null && now > node.expiresAt) {
        this.delete(key);
        count++;
      }
    }
    this.expiredCount += count;
    return count;
  }

  public purgePattern(pattern: string): string[] {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const purgedKeys: string[] = [];
    for (const key of this.items.keys()) {
      if (regex.test(key)) {
        this.delete(key);
        purgedKeys.push(key);
      }
    }
    return purgedKeys;
  }

  private incrementFrequency(node: LFUNode<T>): void {
    const oldFreq = node.frequency;
    const oldBucket = this.freqBuckets.get(oldFreq);
    if (oldBucket) {
      oldBucket.remove(node);
      if (oldBucket.isEmpty() && this.minFrequency === oldFreq) {
        this.minFrequency = oldFreq + 1;
      }
    }

    node.frequency = oldFreq + 1;
    this.getBucket(node.frequency).addFirst(node);
  }

  private evictMinFreq(): CacheItemMetadata | undefined {
    const minBucket = this.freqBuckets.get(this.minFrequency);
    if (!minBucket || minBucket.isEmpty()) {
      return undefined;
    }

    const victim = minBucket.removeLast();
    if (!victim) return undefined;

    this.items.delete(victim.key);
    this.totalMemoryBytes -= victim.sizeBytes;
    this.evictionCount++;

    if (minBucket.isEmpty()) {
      this.recalculateMinFrequency();
    }

    return this.toMetadata(victim);
  }

  private recalculateMinFrequency(): void {
    if (this.items.size === 0) {
      this.minFrequency = 0;
      return;
    }
    let min = Infinity;
    for (const [freq, bucket] of this.freqBuckets.entries()) {
      if (!bucket.isEmpty() && freq < min) {
        min = freq;
      }
    }
    this.minFrequency = min === Infinity ? 0 : min;
  }

  private getBucket(freq: number): DoublyLinkedList<T> {
    let bucket = this.freqBuckets.get(freq);
    if (!bucket) {
      bucket = new DoublyLinkedList<T>();
      this.freqBuckets.set(freq, bucket);
    }
    return bucket;
  }

  private toMetadata(node: LFUNode<T>): CacheItemMetadata {
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
