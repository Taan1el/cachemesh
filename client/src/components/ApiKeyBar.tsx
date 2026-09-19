import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { fetchWriteAccess, getApiKey, setApiKey, clearApiKey } from '../services/index.js';

// Shown only when the server was started with CACHEMESH_API_KEY. Reads work
// without a key, so the dashboard loads either way; the key is needed for
// anything that changes state (SET, DELETE, purge, clear, config, stampede).
export const ApiKeyBar: React.FC = () => {
  const [required, setRequired] = useState(false);
  const [hasKey, setHasKey] = useState(() => Boolean(getApiKey()));
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchWriteAccess()
      .then((access) => {
        if (!cancelled) setRequired(access === 'api-key');
      })
      .catch(() => {
        // An unreachable server is reported by the main data load; hide the bar.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!required) return null;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const key = draft.trim();
    if (!key) return;
    setApiKey(key);
    setHasKey(true);
    setDraft('');
  };

  const forget = () => {
    clearApiKey();
    setHasKey(false);
  };

  return (
    <section className="key-bar" aria-labelledby="api-key-heading">
      <h2 id="api-key-heading" className="key-bar-heading">
        <KeyRound size={16} aria-hidden="true" /> API key
      </h2>
      {hasKey ? (
        <div className="key-bar-row">
          <output className="key-bar-status">Key set for this tab. Changes are sent with it.</output>
          <button type="button" className="btn btn-secondary" onClick={forget}>
            Forget key
          </button>
        </div>
      ) : (
        <form className="key-bar-row" onSubmit={save}>
          <div className="field key-bar-field">
            <label className="field-label" htmlFor="api-key-input">
              Key for changes
            </label>
            <input
              id="api-key-input"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <span className="field-help">
              This server needs a key to set, delete, purge or reconfigure. Kept for this tab only.
            </span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
            Use key
          </button>
        </form>
      )}
    </section>
  );
};
