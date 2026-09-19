import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeyBar } from '../components/ApiKeyBar.js';
import { clearApiKey, getApiKey, setApiKey } from '../services/apiKey.js';
import { setItem, deleteItem, fetchWriteAccess } from '../services/api.js';

function mockFetch(responses: Record<string, { status?: number; body: unknown }>) {
  const fn = vi.fn().mockImplementation((url: string) => {
    const match = Object.entries(responses).find(([fragment]) => url.includes(fragment));
    const { status = 200, body } = match?.[1] ?? { body: {} };
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 401 ? 'Unauthorized' : 'OK',
      json: async () => body,
    });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearApiKey();
});

describe('API key storage', () => {
  it('keeps the key in sessionStorage, not localStorage', () => {
    setApiKey('abc');

    expect(getApiKey()).toBe('abc');
    expect(window.sessionStorage.getItem('cachemesh.apiKey')).toBe('abc');
    expect(window.localStorage.getItem('cachemesh.apiKey')).toBeNull();

    clearApiKey();
    expect(getApiKey()).toBeNull();
  });
});

describe('API client with a key', () => {
  it('reads the write-access mode from the health endpoint', async () => {
    mockFetch({ '/health': { body: { status: 'ok', writeAccess: 'api-key' } } });
    expect(await fetchWriteAccess()).toBe('api-key');

    mockFetch({ '/health': { body: { status: 'ok' } } });
    expect(await fetchWriteAccess()).toBe('open');
  });

  it('sends no Authorization header until a key is set', async () => {
    const fetchMock = mockFetch({ '/cache/item': { body: { success: true } } });

    await setItem('k', 'v');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends the key as a bearer token on writes', async () => {
    setApiKey('s3cret');
    const fetchMock = mockFetch({ '/cache/item': { body: { success: true } } });

    await setItem('k', 'v');
    await deleteItem('k');

    for (const call of fetchMock.mock.calls) {
      expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer s3cret');
    }
  });

  it('turns a 401 into a message that says where to enter the key', async () => {
    mockFetch({
      '/cache/item': { status: 401, body: { success: false, error: 'API key required for this request.' } },
    });

    await expect(setItem('k', 'v')).rejects.toThrow(/API key required for this request\..*"API key"/);
  });
});

describe('ApiKeyBar', () => {
  it('renders nothing when the server is open', async () => {
    const fetchMock = mockFetch({ '/health': { body: { status: 'ok', writeAccess: 'open' } } });
    const { container } = render(<ApiKeyBar />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for a key when the server protects writes, then confirms and can forget it', async () => {
    const user = userEvent.setup();
    mockFetch({ '/health': { body: { status: 'ok', writeAccess: 'api-key' } } });
    render(<ApiKeyBar />);

    const input = await screen.findByLabelText('Key for changes');
    const useKey = screen.getByRole('button', { name: 'Use key' });
    expect(useKey).toBeDisabled();

    await user.type(input, 'my-key');
    await user.click(useKey);

    expect(getApiKey()).toBe('my-key');
    expect(screen.getByText(/Key set for this tab/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Key for changes')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Forget key' }));

    expect(getApiKey()).toBeNull();
    expect(await screen.findByLabelText('Key for changes')).toHaveValue('');
  });

  it('masks the key while it is typed', async () => {
    mockFetch({ '/health': { body: { status: 'ok', writeAccess: 'api-key' } } });
    render(<ApiKeyBar />);

    expect(await screen.findByLabelText('Key for changes')).toHaveAttribute('type', 'password');
  });
});
