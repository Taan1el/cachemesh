import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { CacheService } from '../../shared/cache.service.js';
import { OriginDatabase } from '../src/db/origin.js';
import { createApp } from '../src/app.js';
import { normalizeApiKey } from '../src/middleware/api-key.js';

const KEY = 'correct-horse-battery-staple';

function buildApp(apiKey?: string): { app: Express; service: CacheService } {
  const service = new CacheService(new OriginDatabase(':memory:'), 10);
  return { app: createApp(service, { apiKey }).app, service };
}

describe('normalizeApiKey', () => {
  it('treats unset, empty and whitespace-only values as no key', () => {
    expect(normalizeApiKey(undefined)).toBeUndefined();
    expect(normalizeApiKey('')).toBeUndefined();
    expect(normalizeApiKey('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace from a real key', () => {
    expect(normalizeApiKey('  secret \n')).toBe('secret');
  });
});

describe('API key guard: no key configured', () => {
  it('leaves writes open and reports it on the health endpoint', async () => {
    const { app } = buildApp(undefined);

    const health = await request(app).get('/api/health');
    expect(health.body.writeAccess).toBe('open');

    const write = await request(app).post('/api/cache/item').send({ key: 'k', value: 'v' });
    expect(write.status).toBe(200);
  });

  it('treats a blank key as no key', async () => {
    const { app } = buildApp('   ');
    const write = await request(app).post('/api/cache/item').send({ key: 'k', value: 'v' });
    expect(write.status).toBe(200);
  });
});

describe('API key guard: key configured', () => {
  let app: Express;
  let service: CacheService;

  beforeEach(() => {
    ({ app, service } = buildApp(KEY));
  });

  it('reports the protected mode on the health endpoint without a key', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.writeAccess).toBe('api-key');
  });

  it('keeps read endpoints open', async () => {
    expect((await request(app).get('/api/cache/stats')).status).toBe(200);
    expect((await request(app).get('/api/cache/entries')).status).toBe(200);
    expect((await request(app).get('/api/origin/entities')).status).toBe(200);
  });

  it('rejects a write with no key and does not change the cache', async () => {
    const res = await request(app).post('/api/cache/item').send({ key: 'blocked', value: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'API key required for this request.' });
    expect(res.headers['www-authenticate']).toMatch(/^Bearer/);
    expect(service.getAllEntries().some((entry) => entry.key === 'blocked')).toBe(false);
  });

  it('rejects wrong keys, including ones of a different length', async () => {
    for (const wrong of ['nope', KEY.slice(0, -1), `${KEY}x`, KEY.toUpperCase()]) {
      const res = await request(app)
        .post('/api/cache/item')
        .set('Authorization', `Bearer ${wrong}`)
        .send({ key: 'blocked', value: 1 });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid API key.');
    }
  });

  it('accepts the key as a bearer token', async () => {
    const res = await request(app)
      .post('/api/cache/item')
      .set('Authorization', `Bearer ${KEY}`)
      .send({ key: 'allowed', value: 1 });

    expect(res.status).toBe(200);
    expect(service.getAllEntries().some((entry) => entry.key === 'allowed')).toBe(true);
  });

  it('accepts the key in the X-API-Key header', async () => {
    const res = await request(app)
      .post('/api/cache/item')
      .set('X-API-Key', KEY)
      .send({ key: 'allowed', value: 1 });

    expect(res.status).toBe(200);
  });

  it('does not accept the key in another authorization scheme', async () => {
    const res = await request(app)
      .post('/api/cache/item')
      .set('Authorization', `Basic ${KEY}`)
      .send({ key: 'blocked', value: 1 });

    expect(res.status).toBe(401);
  });

  it('guards every write route: delete, clear, purge, config, stampede and origin upserts', async () => {
    const attempts = [
      request(app).delete('/api/cache/item/some-key'),
      request(app).post('/api/cache/clear'),
      request(app).post('/api/cache/purge').send({ pattern: 'user:*' }),
      request(app).post('/api/cache/config').send({ capacity: 5 }),
      request(app).post('/api/cache/stampede-demo').send({ key: 'user:101', requests: 3 }),
      request(app).post('/api/origin/entities').send({ key: 'x', value: 'y' }),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(401);
    }
  });

  it('lets an authorized delete through', async () => {
    service.set('doomed', 'value');

    const res = await request(app).delete('/api/cache/item/doomed').set('Authorization', `Bearer ${KEY}`);

    expect(res.status).toBe(200);
    expect(service.getAllEntries().some((entry) => entry.key === 'doomed')).toBe(false);
  });

  it('answers a CORS preflight without a key so browsers can send the header', async () => {
    const res = await request(app)
      .options('/api/cache/item')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });
});
