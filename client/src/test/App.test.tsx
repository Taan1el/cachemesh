import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.js';
import type { CacheStats, CacheItemMetadata } from '../../../shared/types.js';

const mockStats: CacheStats = {
  hitCount: 142,
  missCount: 18,
  hitRatio: 88.8,
  totalRequests: 160,
  keyCount: 3,
  evictionCount: 2,
  expiredCount: 5,
  memoryBytes: 4096,
  capacity: 50,
  activePolicy: 'LRU',
};

const mockEntries: CacheItemMetadata[] = [
  {
    key: 'user:101',
    value: { role: 'Lead Architect', country: 'Estonia' },
    sizeBytes: 128,
    hits: 14,
    createdAt: Date.now() - 30000,
    lastAccessedAt: Date.now() - 2000,
    expiresAt: Date.now() + 45000,
    frequency: 15,
  },
  {
    key: 'product:pro-mesh',
    value: { priceEur: 499, nodes: 4 },
    sizeBytes: 256,
    hits: 28,
    createdAt: Date.now() - 60000,
    lastAccessedAt: Date.now() - 5000,
    expiresAt: Date.now() + 60000,
    frequency: 29,
  },
];

describe('CacheMesh Dashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cache/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: mockStats }),
        });
      }
      if (url.includes('/cache/entries')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: mockEntries }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });
    });
  });

  it('renders branding, active policy badge, and telemetry stats', async () => {
    render(<App />);

    expect(screen.getAllByText('CacheMesh').length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(screen.getByText('88.8%')).toBeInTheDocument();
      expect(screen.getByText('160')).toBeInTheDocument();
    });

    const policyBadges = screen.getAllByText(/Policy: LRU/i);
    expect(policyBadges.length).toBeGreaterThanOrEqual(1);

    // This build talks to the real API (VITE_DEMO_MODE is unset in tests),
    // so the demo mode banner must not render.
    expect(screen.queryByText(/Demo mode:/i)).not.toBeInTheDocument();
  });

  it('renders the stampede test with controls and a send button', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Stampede test/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Send 30 requests/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Coalesce requests \(singleflight\)/i)).toBeChecked();
  });

  it('displays cached entries and supports filtering', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'user:101' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'product:pro-mesh' })).toBeInTheDocument();
    });

    // Filter by 'user:'
    const searchInput = screen.getByPlaceholderText(/Filter keys/i);
    await user.type(searchInput, 'user:');

    expect(screen.getByRole('button', { name: 'user:101' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'product:pro-mesh' })).not.toBeInTheDocument();
  });

  it('switches between workbench tabs smoothly', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /get/i })).toBeInTheDocument();
    });

    // Switch to Set tab
    await user.click(screen.getByRole('tab', { name: /^set$/i }));
    expect(screen.getByText(/Set key/i)).toBeInTheDocument();

    // Switch to Purge tab
    await user.click(screen.getByRole('tab', { name: /purge/i }));
    expect(screen.getByText(/Purge pattern/i)).toBeInTheDocument();

    // Switch to Settings tab
    await user.click(screen.getByRole('tab', { name: /settings/i }));
    expect(screen.getByText(/Max capacity \(items\)/i)).toBeInTheDocument();
  });

  it('exposes accessible labels for the workbench form controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /get/i })).toBeInTheDocument();
    });

    // Each field must resolve by its associated <label>, not just by placeholder text.
    expect(screen.getByLabelText(/Key to retrieve/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^set$/i }));
    expect(screen.getByLabelText(/^Key$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Value \(JSON or text\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/TTL \(seconds, 0 for indefinite\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /purge/i }));
    expect(screen.getByLabelText(/Wildcard pattern/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /settings/i }));
    expect(screen.getByLabelText(/Max capacity \(items\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Default TTL \(seconds\)/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/Filter cache keys/i)).toBeInTheDocument();
  });

  it('uses singular nouns when a count is exactly 1', async () => {
    const singularStats: CacheStats = {
      ...mockStats,
      hitCount: 1,
      missCount: 1,
      keyCount: 1,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cache/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: singularStats }),
        });
      }
      if (url.includes('/cache/entries')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });
    });

    render(<App />);

    // The count and noun sit in separate text nodes (the count is inside a
    // <strong>), so match on the element's full text content directly.
    await waitFor(() => {
      const keyCount = document.querySelector('.key-count');
      expect(keyCount?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 key cached');
    });

    expect(screen.getByText(/^1 hit \/ 1 miss$/i)).toBeInTheDocument();
  });
});
