import { useEffect, useMemo, useRef, useState } from 'react';
import { describeRecommendation, emptyWorkspace, hasAssignedTimes, parseWorkspace, validateSettings, resultsCsv, targetPercentText, type Access, type LogFormat, type Workspace, type ReplayReport } from './replay';
import { HitRateChart } from './HitRateChart';
import { importLog, runReplay } from './runReplay';
import { loadWorkspaceSnapshot, saveWorkspace } from './workspace';
import { downloadFile } from './files';
const FORMAT_HELP: Record<LogFormat | 'backup', string> = {
  csv: 'CSV needs a key column. Optional timestamp is nonnegative integer milliseconds, in nondecreasing order. Without timestamps, accesses are one second apart. TTL uses these times.',
  lines: 'One key per line. Blank lines are skipped and accesses are one second apart.',
  monitor: 'Output of the Redis MONITOR command. The key comes from GET, MGET (first key), HGET, HGETALL and EXISTS (first key) lines; other commands are ignored. Times come from the MONITOR timestamps.',
  backup: 'A workspace JSON file exported from this page. It replaces the log and the replay settings.',
};
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
export function LocalReplay() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [report, setReport] = useState<ReplayReport | null>(null);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [recover, setRecover] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [sizes, setSizes] = useState(''); const [ttl, setTtl] = useState(''); const [target, setTarget] = useState('');
  const revision = useRef(0); const active = useRef(true); const pending = useRef(false);
  const [dialog, setDialog] = useState(false); const [format, setFormat] = useState<LogFormat | 'backup'>('csv');
  const [file, setFile] = useState<File | null>(null); const [importError, setImportError] = useState('');
  const [replacement, setReplacement] = useState<Workspace | null>(null);
  useEffect(() => { if (replacement && !busy) document.getElementById('confirm-replacement')?.focus(); }, [replacement, busy]);
  const [exportKind, setExportKind] = useState('backup'); const opener = useRef<HTMLElement | null>(null); const modal = useRef<HTMLDivElement>(null);
  function show(next: Workspace) { setData(next); setSizes(next.settings.sizes.join(', ')); setTtl(String(next.settings.ttlMs)); setTarget(targetPercentText(next.settings.targetHitRate)); }
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const saved = await loadWorkspaceSnapshot<unknown>(); const next = saved.data === null ? emptyWorkspace() : parseWorkspace(JSON.stringify(saved.data)); const result = next.accesses.length ? await runReplay(next) : null; if (!active.current) return; revision.current = saved.revision; show(next); setReport(result); setReady(true); setRecover(false); }
    catch (caught) { if (active.current) { setError((caught as Error).message); setReady(false); setRecover(true); } }
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
    // An unreadable saved workspace has no revision to match; the person has already confirmed the replacement.
    const nextRevision = await saveWorkspace(clean, { expectedRevision: recover ? undefined : revision.current });
    if (!active.current) return;
    revision.current = nextRevision; show(clean); setReport(result); setError(''); setReady(true); setRecover(false); setNotice('Saved in this browser. Export a backup before clearing browser data.');
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
  const distinctKeys = useMemo(() => new Set(data.accesses.map(item => item.key)).size, [data.accesses]);
  const assigned = useMemo(() => hasAssignedTimes(data.accesses), [data.accesses]);
  const enabled = ready && !busy;
  return <main className="local-main"><header className="local-heading"><div><h1>CacheMesh</h1><p>Replay an access log before choosing a cache size.</p></div><button disabled={busy || !(ready || recover)} onClick={event => { opener.current = event.currentTarget; setFile(null); setReplacement(null); setImportError(''); setDialog(true); }}>Import file</button></header>
    <p className="local-boundary">This is an offline analyzer, not a running cache gateway. Results describe this log with an initially empty cache; capacities count keys, not bytes.</p>
    {error && <div role="alert" className="local-error">{error} <button disabled={busy} onClick={() => void reload()}>Reload saved</button></div>}
    <p role="status" className="local-status">{busy ? 'Processing locally...' : notice || 'Import CSV or one key per line to begin.'}</p>
    {notice.startsWith('Saved') && <button className="local-backup" disabled={busy} onClick={() => { downloadFile('cachemesh-workspace.json', JSON.stringify(data, null, 2), 'application/json'); setNotice('Backup exported. Keep it outside this browser.'); }}>Export a workspace backup</button>}
    <div className="local-stats"><div><span>Accesses</span><strong>{data.accesses.length.toLocaleString()}</strong></div><div><span>Distinct keys</span><strong>{distinctKeys.toLocaleString()}</strong></div><div><span>Tested capacities</span><strong>{data.settings.sizes.length}</strong></div></div>
    <div className="local-grid"><section className="local-controls" aria-labelledby="settings-title"><h2 id="settings-title">Replay settings</h2><label htmlFor="capacities">Capacities, in keys</label><input id="capacities" value={sizes} disabled={!enabled} onChange={event => setSizes(event.target.value)} /><p>Comma-separated integers, up to 12 sizes.</p><label htmlFor="ttl">Fixed TTL, milliseconds</label><input id="ttl" type="number" min="1" max="86400000" value={ttl} disabled={!enabled} onChange={event => setTtl(event.target.value)} /><label htmlFor="target">Target hit rate, percent</label><input id="target" type="number" min="0" max="100" step="any" value={target} disabled={!enabled} onChange={event => setTarget(event.target.value)} /><button disabled={!enabled} onClick={() => void apply()}>Save and replay</button><p>LRU evicts the least recently used key. LFU counts uses since insertion and breaks ties by recency. TTL expires at insertion time plus the chosen duration; hits do not refresh it. At capacity, TTL evicts the oldest inserted key. LRU and LFU do not expire keys.</p></section>
    <section className="local-results" aria-labelledby="results-title"><h2 id="results-title">Hit rate by capacity</h2>{report ? <><p className="local-recommendation">{describeRecommendation(report, data.settings.targetHitRate)}</p><p>Among equal sizes, prefer the highest observed hit rate. This is a log-based estimate, not a production sizing guarantee.</p>{assigned && <p>Every access in this log is one second after the last, so the TTL rows measure access counts rather than real time.</p>}<HitRateChart rows={report.rows} sizes={data.settings.sizes} target={data.settings.targetHitRate} /><div className="local-table" role="region" tabIndex={0} aria-label="Cache replay results"><table><thead><tr><th>Policy</th><th>Capacity</th><th>Hit rate</th><th>Hits</th><th>Misses</th><th>Evictions</th><th>Expirations</th></tr></thead><tbody>{report.rows.map(row => <tr key={`${row.policy}-${row.capacity}`}><th scope="row">{row.policy}</th><td>{row.capacity}</td><td>{percent(row.hitRate)}</td><td>{row.hits}</td><td>{row.misses}</td><td>{row.evictions}</td><td>{row.expirations}</td></tr>)}</tbody></table></div></> : <p>No access log saved. Import a file to compare all three policies.</p>}</section></div>
    <footer className="local-export"><div><label htmlFor="export-format">Export format</label><select id="export-format" value={exportKind} onChange={event => setExportKind(event.target.value)}><option value="backup">Workspace JSON</option><option value="results">Results CSV</option></select></div><button disabled={busy || !ready || (exportKind === 'results' && !report)} onClick={exportData}>Export</button><button disabled={!enabled} onClick={() => void clear()}>Clear workspace</button></footer>
    {dialog && <div className="local-overlay"><div className="local-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} ref={modal}><h2 id="import-title">Import access log</h2><p>Up to 16 MiB and 100000 accesses. Import replaces the log after validation; a workspace backup also replaces settings. Invalid files leave saved data intact.</p>{!replacement && <><label htmlFor="import-format">File format</label><select id="import-format" disabled={busy} value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="csv">CSV</option><option value="lines">One key per line</option><option value="monitor">Redis MONITOR output</option><option value="backup">Workspace JSON</option></select><p>{FORMAT_HELP[format]}</p><label htmlFor="import-file">Choose file</label><input id="import-file" type="file" disabled={busy} accept=".csv,.txt,.log,.json,text/plain,text/csv,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></>}{replacement && <p>Replace {data.accesses.length.toLocaleString()} saved accesses with {replacement.accesses.length.toLocaleString()} imported accesses? {format === 'backup' ? `This also replaces ${data.settings.sizes.length} tested capacities and the TTL and target settings.` : 'Your replay settings stay the same.'} Export a backup first if you need the current log.</p>}{importError && <p role="alert" className="local-error">{importError}</p>}<div className="local-actions">{replacement ? <button id="confirm-replacement" disabled={busy} onClick={() => void confirmReplacement()}>Replace saved workspace</button> : <button disabled={busy} onClick={() => void importData()}>Review import</button>}<button disabled={busy} onClick={() => setDialog(false)}>Cancel</button></div></div></div>}
  </main>;
}

