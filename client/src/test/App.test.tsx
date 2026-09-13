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
  });

  it('renders the Stampede sandbox with controls and benchmark button', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Cache Stampede & Thundering Herd Guard/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Fire 30 Concurrent Requests/i)).toBeInTheDocument();
    expect(screen.getByText(/ENABLED \(Coalescing Active\)/i)).toBeInTheDocument();
  });

  it('displays cached entries and supports filtering', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('user:101')).toBeInTheDocument();
      expect(screen.getByText('product:pro-mesh')).toBeInTheDocument();
    });

    // Filter by 'user:'
    const searchInput = screen.getByPlaceholderText(/Filter keys/i);
    await user.type(searchInput, 'user:');

    expect(screen.getByText('user:101')).toBeInTheDocument();
    expect(screen.queryByText('product:pro-mesh')).not.toBeInTheDocument();
  });

  it('switches between Operations tabs smoothly', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/🔍 GET Key/i)).toBeInTheDocument();
    });

    // Switch to SET Key tab
    await user.click(screen.getByText(/✍️ SET Key/i));
    expect(screen.getByText(/Save to Cache/i)).toBeInTheDocument();

    // Switch to Pattern Invalidation tab
    await user.click(screen.getByText(/🧹 Pattern Invalidation/i));
    expect(screen.getByText(/Purge Pattern/i)).toBeInTheDocument();

    // Switch to Gateway Settings tab
    await user.click(screen.getByText(/⚙️ Gateway Settings/i));
    expect(screen.getByText(/Max Capacity \(Items\)/i)).toBeInTheDocument();
  });

  it('exposes accessible labels for the workbench form controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/🔍 GET Key/i)).toBeInTheDocument();
    });

    // Each field must resolve by its associated <label>, not just by placeholder text.
    expect(screen.getByLabelText(/Key to Retrieve/i)).toBeInTheDocument();

    await user.click(screen.getByText(/✍️ SET Key/i));
    expect(screen.getByLabelText(/^Key$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Value \(JSON or Text\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/TTL \(seconds, 0 for indefinite\)/i)).toBeInTheDocument();

    await user.click(screen.getByText(/🧹 Pattern Invalidation/i));
    expect(screen.getByLabelText(/Wildcard Glob Pattern/i)).toBeInTheDocument();

    await user.click(screen.getByText(/⚙️ Gateway Settings/i));
    expect(screen.getByLabelText(/Max Capacity \(Items\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Default TTL \(Seconds\)/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/Filter cache keys/i)).toBeInTheDocument();
  });
});
