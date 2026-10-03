import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.js';
import { clearApiKey } from '../services/apiKey.js';
import { axe } from './axe.js';
import type { CacheStats, CacheItemMetadata } from '../../../shared/types.js';

const stats: CacheStats = {
  hitCount: 142, missCount: 18, hitRatio: 88.8, totalRequests: 160, keyCount: 2,
  evictionCount: 2, expiredCount: 5, memoryBytes: 4096, capacity: 50, activePolicy: 'LRU',
};

const entries: CacheItemMetadata[] = [
  {
    key: 'user:101', value: { role: 'Lead Architect' }, sizeBytes: 128, hits: 14,
    createdAt: Date.now() - 30000, lastAccessedAt: Date.now() - 2000,
    expiresAt: Date.now() + 45000, frequency: 15,
  },
  {
    key: 'product:pro-mesh', value: { priceEur: 499 }, sizeBytes: 256, hits: 28,
    createdAt: Date.now() - 60000, lastAccessedAt: Date.now() - 5000,
    expiresAt: null as unknown as number, frequency: 29,
  },
];

const result = {
  key: 'product:pro-mesh', concurrentRequests: 30, originCalls: 1, cacheHits: 0,
  coalescedHits: 29, totalDurationMs: 90, averageLatencyMs: 85, savingsPercent: 96.7,
  useSingleflight: true,
};

function mockApi(health: unknown = { status: 'ok' }) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    let data: unknown = {};
    let body: unknown;
    if (url.includes('/health')) body = health;
    else {
      if (url.includes('/stampede-demo')) data = result;
      else if (url.includes('/cache/stats')) data = stats;
      else if (url.includes('/cache/entries')) data = entries;
      body = { success: true, data };
    }
    return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => body });
  }) as unknown as typeof fetch;
}

async function openApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByRole('button', { name: 'user:101' });
  return { user, container: view.container };
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearApiKey();
  mockApi();
});

describe('accessibility checks', () => {
  it('default view has no violations', async () => {
    const { container } = await openApp();
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each(['set', 'purge', 'settings', 'get'])('%s workbench tab has no violations', async (name) => {
    const { user, container } = await openApp();
    await user.click(screen.getByRole('tab', { name: new RegExp(`^${name}$`, 'i') }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('expanded cache entry has no violations', async () => {
    const { user, container } = await openApp();
    await user.click(screen.getByRole('button', { name: 'user:101' }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('stampede result has no violations', async () => {
    const { user, container } = await openApp();
    await user.click(screen.getByRole('button', { name: /send 30 requests/i }));
    await screen.findByText('Origin calls');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('API key prompt has no violations', async () => {
    mockApi({ status: 'ok', writeAccess: 'api-key' });
    const { container } = await openApp();
    await screen.findByLabelText('Key for changes');
    expect(await axe(container)).toHaveNoViolations();
  });
});
