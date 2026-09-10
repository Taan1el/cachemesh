import type { Request, Response } from 'express';
import { CacheService } from '../services/cache.service.js';

export class CacheController {
  constructor(private cacheService: CacheService) {}

  public getStats = async (_req: Request, res: Response) => {
    try {
      const stats = this.cacheService.getStats();
      res.json({ success: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getEntries = async (_req: Request, res: Response) => {
    try {
      const entries = this.cacheService.getAllEntries();
      res.json({ success: true, data: entries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getItem = async (req: Request, res: Response) => {
    try {
      const rawKey = req.params.key;
      const key = Array.isArray(rawKey) ? rawKey[0] : String(rawKey);
      const delay = req.query.delay ? parseInt(req.query.delay as string, 10) : undefined;
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
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public setItem = async (req: Request, res: Response) => {
    try {
      const { key, value, ttlSeconds } = req.body;
      if (!key) {
        res.status(400).json({ success: false, error: 'Field "key" is required' });
        return;
      }

      const result = this.cacheService.set(key, value, ttlSeconds);
      res.json({ success: true, data: { key, evicted: result.evicted } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public deleteItem = async (req: Request, res: Response) => {
    try {
      const rawKey = req.params.key;
      const key = Array.isArray(rawKey) ? rawKey[0] : String(rawKey);
      const deleted = this.cacheService.delete(key);
      res.json({ success: true, data: { key, deleted } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public clearAll = async (_req: Request, res: Response) => {
    try {
      this.cacheService.clear();
      res.json({ success: true, message: 'Cache successfully cleared' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public purgePattern = async (req: Request, res: Response) => {
    try {
      const { pattern } = req.body;
      if (!pattern) {
        res.status(400).json({ success: false, error: 'Field "pattern" is required' });
        return;
      }
      const result = this.cacheService.purgePattern(pattern);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public stampedeDemo = async (req: Request, res: Response) => {
    try {
      const { key, concurrentRequests, simulatedOriginDelayMs, useSingleflight } = req.body;
      if (!key || !concurrentRequests) {
        res.status(400).json({ success: false, error: 'Fields "key" and "concurrentRequests" are required' });
        return;
      }

      const count = Math.min(Math.max(1, parseInt(concurrentRequests, 10)), 200);
      const result = await this.cacheService.runStampedeDemo({
        key,
        concurrentRequests: count,
        simulatedOriginDelayMs: simulatedOriginDelayMs !== undefined ? parseInt(simulatedOriginDelayMs, 10) : 90,
        useSingleflight: useSingleflight !== false,
      });

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public updateConfig = async (req: Request, res: Response) => {
    try {
      const updated = this.cacheService.updateConfig(req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getOriginEntities = async (_req: Request, res: Response) => {
    try {
      const entities = this.cacheService.getOriginEntities();
      res.json({ success: true, data: entities });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public upsertOriginEntity = async (req: Request, res: Response) => {
    try {
      const { id, category, name, payload } = req.body;
      if (!id || !category || !name) {
        res.status(400).json({ success: false, error: 'id, category, and name are required' });
        return;
      }
      const created = this.cacheService.upsertOriginEntity(id, category, name, payload || {});
      res.json({ success: true, data: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
