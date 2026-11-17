import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../test/axe';
import { emptyWorkspace, replay, type Workspace } from './replay';
import { LocalReplay } from './LocalReplay';

const store = vi.hoisted(() => ({ loadWorkspaceSnapshot: vi.fn(), saveWorkspace: vi.fn() }));
const runner = vi.hoisted(() => ({ importLog: vi.fn(), runReplay: vi.fn() }));
vi.mock('./workspace', () => store);
vi.mock('./runReplay', () => runner);

function saved(accesses: string[], settings = emptyWorkspace().settings, spacing = 1000): Workspace {
  return { version: 1, accesses: accesses.map((key, i) => ({ key, timeMs: (i + 1) * spacing })), settings };
}

describe('replay results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.saveWorkspace.mockResolvedValue(1);
    runner.runReplay.mockImplementation(async (workspace: Workspace) => replay(workspace.accesses, workspace.settings));
  });

  it('shows the stored target as typed, without float noise', async () => {
    store.loadWorkspaceSnapshot.mockResolvedValue({ data: { ...emptyWorkspace(), settings: { ...emptyWorkspace().settings, targetHitRate: 0.57 } }, revision: 1 });
    render(<LocalReplay />);
    await waitFor(() => expect(screen.getByLabelText('Target hit rate, percent')).toHaveValue(57));
  });

  it('answers how big the cache should be and draws a labelled chart beside the table', async () => {
    const settings = { sizes: [1, 2, 3], ttlMs: 60_000, targetHitRate: 0.5 };
    store.loadWorkspaceSnapshot.mockResolvedValue({ data: saved(['a', 'b', 'a', 'b', 'c', 'a', 'b', 'c'], settings, 500), revision: 1 });
    const { container } = render(<LocalReplay />);
    expect(await screen.findByText(/A cache of 3 keys reaches 62\.50% hits with LRU/u)).toBeInTheDocument();
    expect(screen.getByText(/Doubling it to 6 keys adds nothing/u)).toBeInTheDocument();
    expect(screen.queryByText(/one second after the last/u)).toBeNull();
    const chart = screen.getByRole('img', { name: /Hit rate for each policy/u });
    expect(within(chart as unknown as HTMLElement).getByText('Cache size in keys, evenly spaced')).toBeInTheDocument();
    for (const size of ['1', '2', '3']) expect(within(chart as unknown as HTMLElement).getByText(size)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Chart key' })).toHaveTextContent(/LRU.*LFU.*TTL/u);
    expect(screen.getByRole('region', { name: 'Cache replay results' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('tells the person when times were assigned one second apart', async () => {
    store.loadWorkspaceSnapshot.mockResolvedValue({ data: saved(['a', 'b', 'a']), revision: 1 });
    render(<LocalReplay />);
    expect(await screen.findByText(/TTL rows measure access counts rather than real time/u)).toBeInTheDocument();
  });

  it('offers the Redis MONITOR format and explains which commands count', async () => {
    store.loadWorkspaceSnapshot.mockResolvedValue({ data: emptyWorkspace(), revision: 0 });
    render(<LocalReplay />);
    const opener = screen.getByRole('button', { name: 'Import file' });
    await waitFor(() => expect(opener).toBeEnabled());
    fireEvent.click(opener);
    fireEvent.change(screen.getByLabelText('File format'), { target: { value: 'monitor' } });
    expect(screen.getByText(/GET, MGET \(first key\), HGET, HGETALL and EXISTS/u)).toBeInTheDocument();
    runner.importLog.mockResolvedValue([{ key: 'user:1', timeMs: 1 }]);
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [new File(['x'], 'monitor.txt')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }));
    await screen.findByRole('button', { name: 'Replace saved workspace' });
    expect(runner.importLog).toHaveBeenCalledWith(expect.any(File), 'monitor');
  });

  it('lets a person import over a saved workspace that cannot be read', async () => {
    store.loadWorkspaceSnapshot.mockRejectedValue(new Error('Saved browser workspace has an unsupported format. Import a backup to recover it.'));
    runner.importLog.mockResolvedValue([{ key: 'user:1', timeMs: 1 }]);
    render(<LocalReplay />);
    expect(await screen.findByRole('alert')).toHaveTextContent('unsupported format');
    const opener = screen.getByRole('button', { name: 'Import file' });
    expect(opener).toBeEnabled();
    fireEvent.click(opener);
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [new File(['key\nuser:1'], 'log.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace saved workspace' }));
    await waitFor(() => expect(store.saveWorkspace).toHaveBeenCalledWith(expect.anything(), { expectedRevision: undefined }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('button', { name: 'Clear workspace' })).toBeEnabled();
  });
});
