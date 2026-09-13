import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { LRUCache } from '../../shared/lru.js';
import { LFUCache } from '../../shared/lfu.js';
import { Singleflight } from '../../shared/singleflight.js';
import { CacheService } from '../src/services/cache.service.js';
import { OriginDatabase } from '../src/db/origin.js';
import { createApp } from '../src/app.js';

describe('LRUCache Engine', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3); // capacity 3
  });

  it('stores and retrieves items in O(1) time', () => {
    cache.set('a', 'alpha');
    cache.set('b', 'beta');

    const resA = cache.get('a');
    expect(resA.found).toBe(true);
    expect(resA.value).toBe('alpha');
    expect(resA.metadata?.hits).toBe(1);

    const resB = cache.get('b');
    expect(resB.found).toBe(true);
    expect(resB.value).toBe('beta');

    const resC = cache.get('c');
    expect(resC.found).toBe(false);
  });

  it('evicts least recently used item when capacity is exceeded', () => {
    cache.set('k1', 'val1');
    cache.set('k2', 'val2');
    cache.set('k3', 'val3');

    // Access k1 so k2 becomes the LRU item
    cache.get('k1');

    // Insert k4, should evict k2
    const { evicted } = cache.set('k4', 'val4');
    expect(evicted?.key).toBe('k2');

    expect(cache.has('k2')).toBe(false);
    expect(cache.has('k1')).toBe(true);
    expect(cache.has('k3')).toBe(true);
    expect(cache.has('k4')).toBe(true);
    expect(cache.getEvictionCount()).toBe(1);
  });

  it('handles TTL expiration properly', async () => {
    // 1 second TTL
    cache.set('temp', 'tempVal', 1);
    expect(cache.has('temp')).toBe(true);

    // Wait 1.1s for expiration
    await new Promise((r) => setTimeout(r, 1100));

    const res = cache.get('temp');
    expect(res.found).toBe(false);
    expect(cache.has('temp')).toBe(false);
    expect(cache.getExpiredCount()).toBe(1);
  });

  it('purges keys matching wildcard glob pattern', () => {
    cache.set('user:1', 'Alice');
    cache.set('user:2', 'Bob');
    cache.set('product:99', 'Server');

    const purged = cache.purgePattern('user:*');
    expect(purged).toEqual(expect.arrayContaining(['user:1', 'user:2']));
    expect(cache.has('user:1')).toBe(false);
    expect(cache.has('user:2')).toBe(false);
    expect(cache.has('product:99')).toBe(true);
  });

  it('treats regex metacharacters in glob patterns as literal text', () => {
    cache.set('v1.2.3', 'exact');
    cache.set('v1X2Y3', 'should not match');

    // A naive `.` -> "any character" regex would purge both keys.
    const purged = cache.purgePattern('v1.2.*');
    expect(purged).toEqual(['v1.2.3']);
    expect(cache.has('v1X2Y3')).toBe(true);
  });

  it('does not throw when a pattern contains unbalanced regex syntax', () => {
    cache.set('user:(vip)', 'flagged');
    let purged: string[] = [];
    expect(() => {
      purged = cache.purgePattern('user:(*');
    }).not.toThrow();
    expect(purged).toEqual(['user:(vip)']);
  });
});

describe('LFUCache Engine', () => {
  let cache: LFUCache<string>;

  beforeEach(() => {
    cache = new LFUCache<string>(3); // capacity 3
  });

  it('evicts lowest frequency item upon capacity breach', () => {
    cache.set('a', 'alpha');
    cache.set('b', 'beta');
    cache.set('c', 'gamma');

    // Access 'a' three times (frequency 4)
    cache.get('a');
    cache.get('a');
    cache.get('a');

    // Access 'b' once (frequency 2)
    cache.get('b');

    // 'c' has frequency 1 (never accessed since set)
    // Insert 'd', 'c' should be evicted
    const { evicted } = cache.set('d', 'delta');
    expect(evicted?.key).toBe('c');

    expect(cache.has('c')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('breaks ties using least recently accessed item', () => {
    cache.set('x', 'xRay');
    cache.set('y', 'yankee');
    cache.set('z', 'zulu');

    // All have frequency 1.
    // Access 'x' then 'y'
    cache.get('x'); // freq 2
    cache.get('y'); // freq 2
    cache.get('z'); // freq 2
    // Now all have freq 2. 'x' was accessed least recently among the three.

    const { evicted } = cache.set('w', 'whiskey');
    expect(evicted?.key).toBe('x');
    expect(cache.has('x')).toBe(false);
  });
});

describe('Singleflight Stampede Protection', () => {
  let sf: Singleflight;

  beforeEach(() => {
    sf = new Singleflight();
  });

  it('coalesces multiple concurrent calls into exactly 1 underlying execution', async () => {
    let callCount = 0;
    const slowFetcher = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 60));
      return 'expensive-db-result';
    };

    // Fire 20 concurrent requests for key 'query:stats'
    const requests = Array.from({ length: 20 }, () => sf.do('query:stats', slowFetcher));
    const results = await Promise.all(requests);

    expect(callCount).toBe(1);
    expect(results.length).toBe(20);

    const nonCoalesced = results.filter((r) => !r.coalesced);
    const coalesced = results.filter((r) => r.coalesced);

    expect(nonCoalesced.length).toBe(1);
    expect(coalesced.length).toBe(19);

    for (const r of results) {
      expect(r.value).toBe('expensive-db-result');
    }
  });

  it('executes distinct keys independently', async () => {
    let callA = 0;
    let callB = 0;

    const [resA, resB] = await Promise.all([
      sf.do('key:A', async () => {
        callA++;
        return 'resA';
      }),
      sf.do('key:B', async () => {
        callB++;
        return 'resB';
      }),
    ]);

    expect(callA).toBe(1);
    expect(callB).toBe(1);
    expect(resA.value).toBe('resA');
    expect(resB.value).toBe('resB');
  });
});

describe('CacheMesh API & Gateway Integration', () => {
  let app: any;
  let service: CacheService;

  beforeEach(() => {
    const originDb = new OriginDatabase(':memory:');
    service = new CacheService(originDb, 10);
    const created = createApp(service);
    app = created.app;
  });

  it('GET /api/health returns service status and metrics', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('CacheMesh');
    expect(res.body.policy).toBe('LRU');
  });

  it('GET /api/cache/item/:key cold miss then warm hit', async () => {
    // First request: Origin fetch
    const res1 = await request(app).get('/api/cache/item/user:101?delay=20');
    expect(res1.status).toBe(200);
    expect(res1.body.source).toBe('origin');
    expect(res1.body.data.role).toBe('Lead Architect');

    // Second request: Cache hit
    const res2 = await request(app).get('/api/cache/item/user:101');
    expect(res2.status).toBe(200);
    expect(res2.body.source).toBe('cache');
    expect(res2.body.data.role).toBe('Lead Architect');
    expect(res2.body.latencyMs).toBeLessThan(15);
  });

  it('POST /api/cache/stampede-demo runs thundering herd simulation with coalescing', async () => {
    const res = await request(app)
      .post('/api/cache/stampede-demo')
      .send({
        key: 'product:pro-mesh',
        concurrentRequests: 25,
        simulatedOriginDelayMs: 30,
        useSingleflight: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.concurrentRequests).toBe(25);
    expect(res.body.data.originCalls).toBe(1);
    expect(res.body.data.coalescedHits).toBe(24);
    expect(res.body.data.savingsPercent).toBeGreaterThan(90);
  });

  it('POST /api/cache/purge invalidates keys by pattern', async () => {
    await request(app).post('/api/cache/item').send({ key: 'cache:a', value: 1 });
    await request(app).post('/api/cache/item').send({ key: 'cache:b', value: 2 });
    await request(app).post('/api/cache/item').send({ key: 'other:c', value: 3 });

    const purgeRes = await request(app).post('/api/cache/purge').send({ pattern: 'cache:*' });
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.data.purgedCount).toBe(2);

    const checkA = await request(app).get('/api/cache/item/cache:a');
    expect(checkA.status).toBe(404);
  });

  it('POST /api/cache/purge with regex-special characters matches literally instead of erroring', async () => {
    await request(app).post('/api/cache/item').send({ key: 'v1.2.3', value: 'exact' });
    await request(app).post('/api/cache/item').send({ key: 'v1X2Y3', value: 'should survive' });

    const purgeRes = await request(app).post('/api/cache/purge').send({ pattern: 'v1.2.*' });
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.data.matchedKeys).toEqual(['v1.2.3']);

    const stillThere = await request(app).get('/api/cache/item/v1X2Y3');
    expect(stillThere.status).toBe(200);
  });

  it('rejects invalid input with 400 and never leaks internal error details', async () => {
    const badTtl = await request(app).post('/api/cache/item').send({ key: 'k', value: 1, ttlSeconds: -5 });
    expect(badTtl.status).toBe(400);
    expect(badTtl.body.success).toBe(false);
    expect(badTtl.body.error).not.toMatch(/at Object|node_modules|\.ts:\d|\.js:\d/);

    const badKey = await request(app).post('/api/cache/item').send({ key: '   ', value: 1 });
    expect(badKey.status).toBe(400);

    const badPolicy = await request(app).post('/api/cache/config').send({ policy: 'MRU' });
    expect(badPolicy.status).toBe(400);

    const badCapacity = await request(app).post('/api/cache/config').send({ capacity: -10 });
    expect(badCapacity.status).toBe(400);

    const badConcurrency = await request(app)
      .post('/api/cache/stampede-demo')
      .send({ key: 'user:101', concurrentRequests: 'not-a-number' });
    expect(badConcurrency.status).toBe(400);
  });

  it('POST /api/cache/config applies a valid capacity and policy change', async () => {
    const res = await request(app).post('/api/cache/config').send({ capacity: 5, policy: 'LFU' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ capacity: 5, defaultTtlSeconds: 60, policy: 'LFU' });
  });
});
