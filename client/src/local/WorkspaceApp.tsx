import { useEffect, useState } from 'react';
import App from '../App';
import { isDemoMode } from '../services';
import { loadMode, saveMode, type WorkspaceMode } from './workspace';
import { UpdateNotice } from './UpdateNotice';
import { LocalReplay } from './LocalReplay';
import './local.css';
export function WorkspaceApp() {
  const [mode, setMode] = useState<WorkspaceMode>('sample');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [install, setInstall] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  useEffect(() => {
    if (!isDemoMode) return;
    let active = true;
    void loadMode().then(value => { if (active) setMode(value); }).catch(() => { if (active) setError('Browser storage is unavailable. Export a backup.'); }).finally(() => { if (active) setReady(true); });
    const offered = (event: Event) => { event.preventDefault(); setInstall(event as Event & { prompt(): Promise<void> }); };
    window.addEventListener('beforeinstallprompt', offered);
    return () => { active = false; window.removeEventListener('beforeinstallprompt', offered); };
  }, []);
  if (!isDemoMode) return <App />;
  return <><UpdateNotice /><section className="local-source" aria-label="Browser data source"><div><label htmlFor="data-source">Data source</label><select id="data-source" value={mode} disabled={!ready} onChange={event => { const next = event.target.value as WorkspaceMode; void saveMode(next).then(() => { setMode(next); setError(''); }).catch(() => setError('Data source could not be saved.')); }}><option value="sample">Sample data</option><option value="workspace">Your workspace</option></select></div><p>Your data stays in this browser. No requests to other hosts.</p>{install && <button onClick={() => void install.prompt().then(() => setInstall(null))}>Install CacheMesh</button>}{error && <p role="alert">{error}</p>}</section>{ready && (mode === 'workspace' ? <LocalReplay /> : <App />)}</>;
}

