import { parseAccessLog, parseWorkspace, type Access, type ReplayReport, type Workspace } from './replay';

export const MAX_FILE_BYTES = 16 * 1024 * 1024;
const WORKER_THRESHOLD_BYTES = 256 * 1024;
const WORKER_TIMEOUT_MS = 60_000;

function workerRequest<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./replay.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('Replay worker timed out after 60 seconds.'))), WORKER_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<{ report?: T; data?: T; error?: string }>) => {
      if (event.data.error) finish(() => reject(new Error(event.data.error)));
      else finish(() => resolve(('report' in event.data ? event.data.report : event.data.data) as T));
    };
    worker.onerror = () => finish(() => reject(new Error('Replay worker failed.')));
    worker.postMessage(message);
  });
}

export async function runReplay(workspace: Workspace): Promise<ReplayReport> {
  const safeWorkspace = parseWorkspace(JSON.stringify({
    version: workspace?.version,
    accesses: workspace?.accesses,
    settings: workspace?.settings ? { ...workspace.settings, sizes: workspace.settings.sizes } : workspace?.settings,
  }));
  return workerRequest<ReplayReport>({ workspace: safeWorkspace });
}

export async function importLog(file: File, format: 'csv' | 'lines' | 'backup'): Promise<Workspace | Access[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: file exceeds 16 MiB.`);
  try {
    if (file.size <= WORKER_THRESHOLD_BYTES) {
      const input = await file.text();
      if (format === 'backup') return parseWorkspace(input);
      return parseAccessLog(input, format);
    }
    return await workerRequest<Workspace | Access[]>({ file, format });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read file.';
    throw new Error(`${file.name}: ${message}`);
  }
}

