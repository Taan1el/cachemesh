import { useEffect, useRef, useState } from 'react';
import { emptyWorkspace, parseWorkspace, validateSettings, resultsCsv, type Access, type Workspace, type ReplayReport } from './replay';
import { importLog, runReplay } from './runReplay';
import { loadWorkspaceSnapshot, saveWorkspace } from './workspace';
import { downloadFile } from './files';
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
export function LocalReplay() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [report, setReport] = useState<ReplayReport | null>(null);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [sizes, setSizes] = useState(''); const [ttl, setTtl] = useState(''); const [target, setTarget] = useState('');
  const revision = useRef(0); const active = useRef(true); const pending = useRef(false);
  const [dialog, setDialog] = useState(false); const [format, setFormat] = useState<'csv'|'lines'|'backup'>('csv');
  const [file, setFile] = useState<File | null>(null); const [importError, setImportError] = useState('');
  const [replacement, setReplacement] = useState<Workspace | null>(null);
  useEffect(() => { if (replacement && !busy) document.getElementById('confirm-replacement')?.focus(); }, [replacement, busy]);
  const [exportKind, setExportKind] = useState('backup'); const opener = useRef<HTMLElement | null>(null); const modal = useRef<HTMLDivElement>(null);
  function show(next: Workspace) { setData(next); setSizes(next.settings.sizes.join(', ')); setTtl(String(next.settings.ttlMs)); setTarget(String(next.settings.targetHitRate * 100)); }
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const saved = await loadWorkspaceSnapshot<unknown>(); const next = saved.data === null ? emptyWorkspace() : parseWorkspace(JSON.stringify(saved.data)); const result = next.accesses.length ? await runReplay(next) : null; if (!active.current) return; revision.current = saved.revision; show(next); setReport(result); setReady(true); }
    catch (caught) { if (active.current) { setError((caught as Error).message); setReady(false); } }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => { active.current = true; void reload(); return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!dialog) return;
    modal.current?.querySelector<HTMLElement>('select')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!pending.current) setDialog(false); }
      if (event.key !== 'Tab') return;
      const controls = [...(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') ?? [])];
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); modal.current?.focus(); }
      else if (document.activeElement === modal.current || !modal.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); opener.current?.focus(); };
  }, [dialog]);
  async function save(next: Workspace) {
    const clean = parseWorkspace(JSON.stringify(next));
    const result = clean.accesses.length ? await runReplay(clean) : null;
    const nextRevision = await saveWorkspace(clean, { expectedRevision: revision.current });
    if (!active.current) return;
    revision.current = nextRevision; show(clean); setReport(result); setError(''); setNotice('Saved in this browser. Export a backup before clearing browser data.');
  }
  async function apply() {
    if (pending.current) return; pending.current = true; setBusy(true); setError('');
    try { if (!sizes.trim() || !ttl.trim() || !target.trim()) throw new Error('Enter capacities, TTL, and target hit rate.'); await save({ ...data, settings: validateSettings({ sizes: sizes.split(',').map(value => Number(value.trim())), ttlMs: Number(ttl), targetHitRate: Number(target) / 100 }) }); }
    catch (caught) { setError((caught as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  async function importData() {
    if (!file) { setImportError('Choose a file first.'); return; } if (pending.current) return;
    pending.current = true; setBusy(true); setImportError('');
    try { const value = await importLog(file, format); const next = parseWorkspace(JSON.stringify(format === 'backup' ? value as Workspace : { ...data, accesses: value as Access[] })); setReplacement(next); }
    catch (caught) { setImportError((caught as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  async function confirmReplacement() {
    if (!replacement || pending.current) return;
    pending.current = true; setBusy(true); setImportError('');
    try { await save(replacement); setReplacement(null); setDialog(false); }
    catch (caught) { setImportError((caught as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  async function clear() {
    if (pending.current || !confirm('Clear saved access log and settings? Export a backup first.')) return;
    pending.current = true; setBusy(true); try { await save(emptyWorkspace()); } catch (caught) { setError((caught as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  function exportData() { if (exportKind === 'results' && report) downloadFile('cachemesh-results.csv', resultsCsv(report), 'text/csv;charset=utf-8'); else downloadFile('cachemesh-workspace.json', JSON.stringify(data, null, 2), 'application/json'); setNotice('File exported. Keep a copy outside this browser.'); }
  const enabled = ready && !busy;
  return <main className="local-main"><header className="local-heading"><div><h1>CacheMesh</h1><p>Replay an access log before choosing a cache size.</p></div><button disabled={!enabled} onClick={event => { opener.current = event.currentTarget; setFile(null); setReplacement(null); setImportError(''); setDialog(true); }}>Import file</button></header>
    <p className="local-boundary">This is an offline analyzer, not a running cache gateway. Results describe this log with an initially empty cache; capacities count keys, not bytes.</p>
    {error && <div role="alert" className="local-error">{error} <button disabled={busy} onClick={() => void reload()}>Reload saved</button></div>}
    <p role="status" className="local-status">{busy ? 'Processing locally...' : notice || 'Import CSV or one key per line to begin.'}</p>
    {notice.startsWith('Saved') && <button className="local-backup" disabled={busy} onClick={() => { downloadFile('cachemesh-workspace.json', JSON.stringify(data, null, 2), 'application/json'); setNotice('Backup exported. Keep it outside this browser.'); }}>Export a workspace backup</button>}
    <div className="local-stats"><div><span>Accesses</span><strong>{data.accesses.length.toLocaleString()}</strong></div><div><span>Distinct keys</span><strong>{new Set(data.accesses.map(item => item.key)).size.toLocaleString()}</strong></div><div><span>Tested capacities</span><strong>{data.settings.sizes.length}</strong></div></div>
    <div className="local-grid"><section className="local-controls" aria-labelledby="settings-title"><h2 id="settings-title">Replay settings</h2><label htmlFor="capacities">Capacities, in keys</label><input id="capacities" value={sizes} disabled={!enabled} onChange={event => setSizes(event.target.value)} /><p>Comma-separated integers, up to 12 sizes.</p><label htmlFor="ttl">Fixed TTL, milliseconds</label><input id="ttl" type="number" min="1" max="86400000" value={ttl} disabled={!enabled} onChange={event => setTtl(event.target.value)} /><label htmlFor="target">Target hit rate, percent</label><input id="target" type="number" min="0" max="100" step="any" value={target} disabled={!enabled} onChange={event => setTarget(event.target.value)} /><button disabled={!enabled} onClick={() => void apply()}>Save and replay</button><p>LRU evicts the least recently used key. LFU counts uses since insertion and breaks ties by recency. TTL expires at insertion time plus the chosen duration; hits do not refresh it. At capacity, TTL evicts the oldest inserted key. LRU and LFU do not expire keys.</p></section>
    <section className="local-results" aria-labelledby="results-title"><h2 id="results-title">Hit rate by capacity</h2>{report ? <><p className="local-recommendation">{report.recommendation ? `Smallest tested size meeting ${percent(data.settings.targetHitRate)}: ${report.recommendation.capacity} keys with ${report.recommendation.policy} (${percent(report.recommendation.hitRate)}).` : 'No tested size reaches the target. Try larger capacities or a different TTL.'}</p><p>Among equal sizes, prefer the highest observed hit rate. This is a log-based estimate, not a production sizing guarantee.</p><svg className="local-chart" viewBox="0 0 600 260" role="img" aria-label="Hit rate curves for LRU, LFU and TTL. Exact values follow in the table."><line x1="45" y1="220" x2="580" y2="220" stroke="currentColor"/><line x1="45" y1="20" x2="45" y2="220" stroke="currentColor"/><text x="4" y="25">100%</text><text x="16" y="224">0%</text>{(['LRU','LFU','TTL'] as const).map((policy,index) => { const rows = report.rows.filter(row => row.policy === policy); return <g key={policy}><polyline fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={index === 1 ? '8 4' : index === 2 ? '2 5' : undefined} points={rows.map((row,i) => `${45 + i / Math.max(1,rows.length-1)*535},${220-row.hitRate*200}`).join(' ')}/>{rows.map((row,i) => <circle key={row.capacity} cx={45+i/Math.max(1,rows.length-1)*535} cy={220-row.hitRate*200} r="4" fill="var(--accent)" />)}</g>; })}<text x="45" y="248">{data.settings.sizes[0]} keys</text><text x="580" y="248" textAnchor="end">{data.settings.sizes.at(-1)} keys</text></svg><p>Solid: LRU. Dashed: LFU. Dotted: TTL. Tested sizes are spaced equally.</p><div className="local-table" role="region" tabIndex={0} aria-label="Cache replay results"><table><thead><tr><th>Policy</th><th>Capacity</th><th>Hit rate</th><th>Hits</th><th>Misses</th><th>Evictions</th><th>Expirations</th></tr></thead><tbody>{report.rows.map(row => <tr key={`${row.policy}-${row.capacity}`}><th scope="row">{row.policy}</th><td>{row.capacity}</td><td>{percent(row.hitRate)}</td><td>{row.hits}</td><td>{row.misses}</td><td>{row.evictions}</td><td>{row.expirations}</td></tr>)}</tbody></table></div></> : <p>No access log saved. Import a file to compare all three policies.</p>}</section></div>
    <footer className="local-export"><div><label htmlFor="export-format">Export format</label><select id="export-format" value={exportKind} onChange={event => setExportKind(event.target.value)}><option value="backup">Workspace JSON</option><option value="results">Results CSV</option></select></div><button disabled={busy || !ready || (exportKind === 'results' && !report)} onClick={exportData}>Export</button><button disabled={!enabled} onClick={() => void clear()}>Clear workspace</button></footer>
    {dialog && <div className="local-overlay"><div className="local-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} ref={modal}><h2 id="import-title">Import access log</h2><p>Up to 16 MiB and 100000 accesses. Import replaces the log after validation; a workspace backup also replaces settings. Invalid files leave saved data intact.</p>{!replacement && <><label htmlFor="import-format">File format</label><select id="import-format" disabled={busy} value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="csv">CSV</option><option value="lines">One key per line</option><option value="backup">Workspace JSON</option></select><p>CSV needs a key column. Optional timestamp is nonnegative integer milliseconds, in nondecreasing order. Without timestamps, accesses are one second apart. TTL uses these times.</p><label htmlFor="import-file">Choose file</label><input id="import-file" type="file" disabled={busy} accept=".csv,.txt,.json,text/plain,text/csv,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></>}{replacement && <p>Replace {data.accesses.length.toLocaleString()} saved accesses with {replacement.accesses.length.toLocaleString()} imported accesses? {format === 'backup' ? `This also replaces ${data.settings.sizes.length} tested capacities and the TTL and target settings.` : 'Your replay settings stay the same.'} Export a backup first if you need the current log.</p>}{importError && <p role="alert" className="local-error">{importError}</p>}<div className="local-actions">{replacement ? <button id="confirm-replacement" disabled={busy} onClick={() => void confirmReplacement()}>Replace saved workspace</button> : <button disabled={busy} onClick={() => void importData()}>Review import</button>}<button disabled={busy} onClick={() => setDialog(false)}>Cancel</button></div></div></div>}
  </main>;
}

