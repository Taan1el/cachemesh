import { createApp } from './app.js';
import { normalizeApiKey } from './middleware/api-key.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4002;
const { app, cacheService } = createApp();
cacheService.startExpirySweep();

app.listen(port, () => {
  console.log(`[CacheMesh] Gateway listening on http://localhost:${port}`);
  console.log(`[CacheMesh] REST API mounted at http://localhost:${port}/api`);
  console.log(
    normalizeApiKey(process.env.CACHEMESH_API_KEY)
      ? '[CacheMesh] Write requests require the configured API key.'
      : '[CacheMesh] No API key set: write requests are open. Set CACHEMESH_API_KEY to require one.'
  );
});
