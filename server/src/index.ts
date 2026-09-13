import { createApp } from './app.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4002;
const { app, cacheService } = createApp();
cacheService.startExpirySweep();

app.listen(port, () => {
  console.log(`[CacheMesh] Gateway listening on http://localhost:${port}`);
  console.log(`[CacheMesh] REST API mounted at http://localhost:${port}/api`);
});
