import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './routes/api.routes.js';
import { CacheService } from '../../shared/cache.service.js';
import { OriginDatabase } from './db/origin.js';

// Resolve paths from this file's own location rather than process.cwd(), so
// the server finds the client build the same way whether it is started from
// the server/ workspace directory, the repo root, or a Docker WORKDIR.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(cacheService?: CacheService) {
  const app = express();
  const service = cacheService || new CacheService(new OriginDatabase());

  app.use(cors());
  app.use(express.json());

  // Mount API router
  app.use('/api', createApiRouter(service));

  // Serve static client build if present.
  // Compiled location is dist/server/src/app.js -> ../../../../client/dist
  const clientDistPath = path.resolve(__dirname, '../../../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(clientDistPath, 'index.html'));
    });
  }

  return { app, cacheService: service };
}
