import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Treats an unset, empty or whitespace-only value as "no key configured". */
export function normalizeApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Hash both sides so the buffers always have the same length; timingSafeEqual
// throws on a length mismatch, and comparing raw lengths would leak the key length.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function extractKey(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1];
  }
  return req.header('x-api-key') ?? undefined;
}

/**
 * Requires the configured key on every request that can change state. With no
 * key configured the guard lets everything through, so local use stays frictionless.
 */
export function requireApiKeyForWrites(apiKey: string | undefined): RequestHandler {
  if (!apiKey) return (_req, _res, next) => next();
  const expected = digest(apiKey);

  return (req, res, next) => {
    if (READ_ONLY_METHODS.has(req.method)) return next();

    const provided = extractKey(req);
    if (provided !== undefined && timingSafeEqual(digest(provided), expected)) return next();

    res.setHeader('WWW-Authenticate', 'Bearer realm="cachemesh"');
    res.status(401).json({
      success: false,
      error: provided === undefined ? 'API key required for this request.' : 'Invalid API key.',
    });
  };
}
