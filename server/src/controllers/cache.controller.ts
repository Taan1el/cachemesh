import type { Request, Response } from 'express';
import { CacheService } from '../../../shared/cache.service.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Logs the real error for operators and returns a generic message to the
// client. Internal error text (stack traces, file paths, SQL) must never
// reach the caller.
function sendServerError(res: Response, context: string, err: unknown): void {
  console.error(`[CacheMesh] ${context} failed:`, err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

export class CacheController {
  constructor(private cacheService: CacheService) {}

  public getStats = async (_req: Request, res: Response) => {
    try {
      const stats = this.cacheService.getStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      sendServerError(res, 'getStats', err);
    }
  };

  public getEntries = async (_req: Request, res: Response) => {
    try {
      const entries = this.cacheService.getAllEntries();
      res.json({ success: true, data: entries });
    } catch (err) {
      sendServerError(res, 'getEntries', err);
    }
  };

  public getItem = async (req: Request, res: Response) => {
    try {
      const rawKey = req.params.key;
      const key = Array.isArray(rawKey) ? rawKey[0] : String(rawKey);
      if (!isNonEmptyString(key)) {
        res.status(400).json({ success: false, error: 'Key must not be empty' });
        return;
      }

      let delay: number | undefined;
      if (req.query.delay !== undefined) {
        const parsed = Number(req.query.delay);
        if (!Number.isFinite(parsed) || parsed < 0) {
          res.status(400).json({ success: false, error: 'Query param "delay" must be a non-negative number' });
          return;
        }
        delay = Math.min(parsed, 5000);
      }
      const singleflight = req.query.singleflight !== 'false';

      const result = await this.cacheService.get(key, {
        simulatedOriginDelayMs: delay,
        useSingleflight: singleflight,
      });

      if (result.value === null || result.value === undefined) {
        res.status(404).json({ success: false, error: `Key '${key}' not found in cache or origin` });
        return;
      }

      res.json({
        success: true,
        data: result.value,
        source: result.source,
        coalesced: result.coalesced,
        latencyMs: result.latencyMs,
        metadata: result.metadata,
      });
    } catch (err) {
      sendServerError(res, 'getItem', err);
    }
  };

  public setItem = async (req: Request, res: Response) => {
    try {
      const { key, value, ttlSeconds } = req.body ?? {};
      if (!isNonEmptyString(key)) {
        res.status(400).json({ success: false, error: 'Field "key" must be a non-empty string' });
        return;
      }
      if (ttlSeconds !== undefined && (!isFiniteNumber(ttlSeconds) || ttlSeconds < 0)) {
        res.status(400).json({ success: false, error: 'Field "ttlSeconds" must be a non-negative number' });
        return;
      }

      const result = this.cacheService.set(key, value, ttlSeconds);
      res.json({ success: true, data: { key, evicted: result.evicted } });
    } catch (err) {
      sendServerError(res, 'setItem', err);
    }
  };

  public deleteItem = async (req: Request, res: Response) => {
    try {
      const rawKey = req.params.key;
      const key = Array.isArray(rawKey) ? rawKey[0] : String(rawKey);
      if (!isNonEmptyString(key)) {
        res.status(400).json({ success: false, error: 'Key must not be empty' });
        return;
      }
      const deleted = this.cacheService.delete(key);
      res.json({ success: true, data: { key, deleted } });
    } catch (err) {
      sendServerError(res, 'deleteItem', err);
    }
  };

  public clearAll = async (_req: Request, res: Response) => {
    try {
      this.cacheService.clear();
      res.json({ success: true, message: 'Cache successfully cleared' });
    } catch (err) {
      sendServerError(res, 'clearAll', err);
    }
  };

  public purgePattern = async (req: Request, res: Response) => {
    try {
      const { pattern } = req.body ?? {};
      if (!isNonEmptyString(pattern)) {
        res.status(400).json({ success: false, error: 'Field "pattern" must be a non-empty string' });
        return;
      }
      const result = this.cacheService.purgePattern(pattern);
      res.json({ success: true, data: result });
    } catch (err) {
      sendServerError(res, 'purgePattern', err);
    }
  };

  public stampedeDemo = async (req: Request, res: Response) => {
    try {
      const { key, concurrentRequests, simulatedOriginDelayMs, useSingleflight } = req.body ?? {};
      if (!isNonEmptyString(key)) {
        res.status(400).json({ success: false, error: 'Field "key" must be a non-empty string' });
        return;
      }

      const requestedCount = Number(concurrentRequests);
      if (!Number.isFinite(requestedCount) || requestedCount < 1) {
        res.status(400).json({ success: false, error: 'Field "concurrentRequests" must be a positive number' });
        return;
      }
      const count = Math.min(Math.max(1, Math.round(requestedCount)), 200);

      let delay = 90;
      if (simulatedOriginDelayMs !== undefined) {
        const parsedDelay = Number(simulatedOriginDelayMs);
        if (!Number.isFinite(parsedDelay) || parsedDelay < 0) {
          res.status(400).json({ success: false, error: 'Field "simulatedOriginDelayMs" must be a non-negative number' });
          return;
        }
        delay = Math.min(parsedDelay, 5000);
      }

      const result = await this.cacheService.runStampedeDemo({
        key,
        concurrentRequests: count,
        simulatedOriginDelayMs: delay,
        useSingleflight: useSingleflight !== false,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      sendServerError(res, 'stampedeDemo', err);
    }
  };

  public updateConfig = async (req: Request, res: Response) => {
    try {
      const { capacity, defaultTtlSeconds, policy } = req.body ?? {};

      if (capacity !== undefined && (!isFiniteNumber(capacity) || capacity < 1 || !Number.isInteger(capacity))) {
        res.status(400).json({ success: false, error: 'Field "capacity" must be a positive integer' });
        return;
      }
      if (defaultTtlSeconds !== undefined && (!isFiniteNumber(defaultTtlSeconds) || defaultTtlSeconds < 0)) {
        res.status(400).json({ success: false, error: 'Field "defaultTtlSeconds" must be a non-negative number' });
        return;
      }
      if (policy !== undefined && policy !== 'LRU' && policy !== 'LFU') {
        res.status(400).json({ success: false, error: 'Field "policy" must be "LRU" or "LFU"' });
        return;
      }

      const updated = this.cacheService.updateConfig({ capacity, defaultTtlSeconds, policy });
      res.json({ success: true, data: updated });
    } catch (err) {
      sendServerError(res, 'updateConfig', err);
    }
  };

  public getOriginEntities = async (_req: Request, res: Response) => {
    try {
      const entities = this.cacheService.getOriginEntities();
      res.json({ success: true, data: entities });
    } catch (err) {
      sendServerError(res, 'getOriginEntities', err);
    }
  };

  public upsertOriginEntity = async (req: Request, res: Response) => {
    try {
      const { id, category, name, payload } = req.body ?? {};
      if (!isNonEmptyString(id) || !isNonEmptyString(category) || !isNonEmptyString(name)) {
        res.status(400).json({ success: false, error: 'Fields "id", "category" and "name" must be non-empty strings' });
        return;
      }
      if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
        res.status(400).json({ success: false, error: 'Field "payload" must be an object' });
        return;
      }
      const created = this.cacheService.upsertOriginEntity(id, category, name, payload || {});
      res.json({ success: true, data: created });
    } catch (err) {
      sendServerError(res, 'upsertOriginEntity', err);
    }
  };
}
