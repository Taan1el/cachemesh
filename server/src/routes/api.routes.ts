import { Router } from 'express';
import { CacheController } from '../controllers/cache.controller.js';
import { CacheService } from '../../../shared/cache.service.js';

export function createApiRouter(cacheService: CacheService): Router {
  const router = Router();
  const controller = new CacheController(cacheService);

  // Health
  router.get('/health', (_req, res) => {
    const stats = cacheService.getStats();
    res.json({
      status: 'ok',
      service: 'CacheMesh',
      activeKeys: stats.keyCount,
      hitRatio: stats.hitRatio,
      policy: stats.activePolicy,
    });
  });

  // Cache Operations
  router.get('/cache/stats', controller.getStats);
  router.get('/cache/entries', controller.getEntries);
  router.get('/cache/item/:key', controller.getItem);
  router.post('/cache/item', controller.setItem);
  router.delete('/cache/item/:key', controller.deleteItem);
  router.post('/cache/clear', controller.clearAll);
  router.post('/cache/purge', controller.purgePattern);
  router.post('/cache/config', controller.updateConfig);

  // Thundering Herd Stampede Simulation
  router.post('/cache/stampede-demo', controller.stampedeDemo);

  // Origin DB
  router.get('/origin/entities', controller.getOriginEntities);
  router.post('/origin/entities', controller.upsertOriginEntity);

  return router;
}
