import { parseAccessLog, parseWorkspace, replay, type LogFormat, type Workspace } from './replay';

type Request = { workspace: Workspace } | { file: File; format: LogFormat | 'backup' };
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(value: unknown): void;
};

workerScope.onmessage = async (event) => {
  try {
    const request = event.data;
    if ('workspace' in request) {
      const workspace = parseWorkspace(JSON.stringify(request.workspace));
      workerScope.postMessage({ report: replay(workspace.accesses, workspace.settings) });
    } else {
      const input = await request.file.text();
      const data = request.format === 'backup' ? parseWorkspace(input) : parseAccessLog(input, request.format);
      workerScope.postMessage({ data });
    }
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : 'Unable to process input.' });
  }
};
