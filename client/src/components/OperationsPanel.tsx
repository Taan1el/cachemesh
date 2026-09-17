import React, { useState } from 'react';
import { Search, PenLine, Eraser, Settings } from 'lucide-react';
import type { CacheConfig, EvictionPolicy } from '../../../shared/types.js';
import { getItem, setItem, purgePattern, updateConfig } from '../services/index.js';
import { pluralize } from '../utils/pluralize.js';

interface OperationsPanelProps {
  config: CacheConfig | null;
  selectedKey: string;
  onMutated: () => void;
}

export const OperationsPanel: React.FC<OperationsPanelProps> = ({ config, selectedKey, onMutated }) => {
  const [activeTab, setActiveTab] = useState<'get' | 'set' | 'purge' | 'config'>('get');

  // GET state
  const [getKey, setGetKey] = useState(selectedKey || 'user:101');
  const [getResult, setGetResult] = useState<any>(null);
  const [getLoading, setGetLoading] = useState(false);
  const [getError, setGetError] = useState<string | null>(null);

  // SET state
  const [setKeyInput, setSetKeyInput] = useState('config:custom-token');
  const [setValueInput, setSetValueInput] = useState('{"rateLimit": 500, "region": "eu-central"}');
  const [setTtlInput, setSetTtlInput] = useState<number>(45);
  const [setSuccess, setSetSuccess] = useState<string | null>(null);

  // PURGE state
  const [purgePatternInput, setPurgePatternInput] = useState('user:*');
  const [purgeResult, setPurgeResult] = useState<any>(null);

  // CONFIG state
  const [capacityInput, setCapacityInput] = useState<number>(config?.capacity || 50);
  const [defaultTtlInput, setDefaultTtlInput] = useState<number>(config?.defaultTtlSeconds || 60);
  const [policyInput, setPolicyInput] = useState<EvictionPolicy>(config?.policy || 'LRU');
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

  // Synchronize when parent passes selectedKey
  React.useEffect(() => {
    if (selectedKey) {
      setGetKey(selectedKey);
      setActiveTab('get');
    }
  }, [selectedKey]);

  // Synchronize config changes
  React.useEffect(() => {
    if (config) {
      setCapacityInput(config.capacity);
      setDefaultTtlInput(config.defaultTtlSeconds);
      setPolicyInput(config.policy);
    }
  }, [config]);

  const handleGet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!getKey) return;
    setGetLoading(true);
    setGetError(null);
    setGetResult(null);

    try {
      const res = await getItem(getKey);
      setGetResult(res);
      onMutated();
    } catch (err: any) {
      setGetError(err.message || 'Key not found');
    } finally {
      setGetLoading(false);
    }
  };

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetSuccess(null);
    try {
      let parsedValue: any = setValueInput;
      try {
        parsedValue = JSON.parse(setValueInput);
      } catch {
        // use string if not json
      }
      await setItem(setKeyInput, parsedValue, setTtlInput);
      setSetSuccess(`Key "${setKeyInput}" saved.`);
      onMutated();
    } catch (err: any) {
      alert(`Set failed: ${err.message}`);
    }
  };

  const handlePurge = async (e: React.FormEvent) => {
    e.preventDefault();
    setPurgeResult(null);
    try {
      const res = await purgePattern(purgePatternInput);
      setPurgeResult(res);
      onMutated();
    } catch (err: any) {
      alert(`Purge failed: ${err.message}`);
    }
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSuccess(null);
    try {
      await updateConfig({
        capacity: capacityInput,
        defaultTtlSeconds: defaultTtlInput,
        policy: policyInput,
      });
      setConfigSuccess('Settings saved.');
      onMutated();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  return (
    <div className="workbench">
      <div className="workbench-tabs" role="tablist" aria-label="Workbench">
        <button
          role="tab"
          aria-selected={activeTab === 'get'}
          className={`tab-btn ${activeTab === 'get' ? 'active' : ''}`}
          onClick={() => setActiveTab('get')}
        >
          <Search size={16} aria-hidden="true" />
          Get
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'set'}
          className={`tab-btn ${activeTab === 'set' ? 'active' : ''}`}
          onClick={() => setActiveTab('set')}
        >
          <PenLine size={16} aria-hidden="true" />
          Set
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'purge'}
          className={`tab-btn ${activeTab === 'purge' ? 'active' : ''}`}
          onClick={() => setActiveTab('purge')}
        >
          <Eraser size={16} aria-hidden="true" />
          Purge
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'config'}
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Settings size={16} aria-hidden="true" />
          Settings
        </button>
      </div>

      <div className="workbench-body">
        {activeTab === 'get' && (
          <form onSubmit={handleGet} className="ops-form">
            <div className="field">
              <label className="field-label" htmlFor="get-key-input">Key to retrieve</label>
              <div className="input-group">
                <input
                  id="get-key-input"
                  type="text"
                  value={getKey}
                  onChange={(e) => setGetKey(e.target.value)}
                  placeholder="e.g. user:101"
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={getLoading}>
                  {getLoading ? 'Fetching' : 'Get key'}
                </button>
              </div>
              <span className="field-help">
                If the key is not cached, it is read from the origin store and cached.
              </span>
            </div>

            {getError && <div className="alert alert-error">{getError}</div>}

            {getResult && (
              <div className="result-viewer">
                <div className="result-tags">
                  <span className="badge">
                    <span className={`status-dot ${getResult.source === 'cache' ? 'ok' : 'warn'}`}></span>
                    {getResult.source === 'cache' ? 'Cache hit' : 'Origin miss'}
                  </span>
                  <span className="badge">{getResult.latencyMs} ms</span>
                  {getResult.coalesced && (
                    <span className="badge">Coalesced</span>
                  )}
                </div>
                <pre className="result-json">
                  {JSON.stringify(getResult.data, null, 2)}
                </pre>
              </div>
            )}
          </form>
        )}

        {activeTab === 'set' && (
          <form onSubmit={handleSet} className="ops-form">
            <div className="field">
              <label className="field-label" htmlFor="set-key-input">Key</label>
              <input
                id="set-key-input"
                type="text"
                value={setKeyInput}
                onChange={(e) => setSetKeyInput(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="set-value-input">Value (JSON or text)</label>
              <textarea
                id="set-value-input"
                value={setValueInput}
                onChange={(e) => setSetValueInput(e.target.value)}
                rows={4}
                required
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="set-ttl-input">TTL (seconds, 0 for indefinite)</label>
              <input
                id="set-ttl-input"
                type="number"
                value={setTtlInput}
                onChange={(e) => setSetTtlInput(Number(e.target.value))}
                min="0"
                max="86400"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Set key
            </button>
            {setSuccess && <div className="alert alert-success">{setSuccess}</div>}
          </form>
        )}

        {activeTab === 'purge' && (
          <form onSubmit={handlePurge} className="ops-form">
            <div className="field">
              <label className="field-label" htmlFor="purge-pattern-input">Wildcard pattern</label>
              <div className="input-group">
                <input
                  id="purge-pattern-input"
                  type="text"
                  value={purgePatternInput}
                  onChange={(e) => setPurgePatternInput(e.target.value)}
                  placeholder="e.g. user:*"
                  required
                />
                <button type="submit" className="btn btn-primary">
                  Purge pattern
                </button>
              </div>
              <span className="field-help">
                Removes every key matching the pattern. Use for bulk invalidation, such as all keys for one tenant.
              </span>
            </div>

            {purgeResult && (
              <div className="alert alert-info">
                Purged <strong>{purgeResult.purgedCount}</strong> {pluralize(purgeResult.purgedCount, 'key')} matching &ldquo;{purgeResult.pattern}&rdquo;.
                {purgeResult.matchedKeys.length > 0 && (
                  <div className="purged-list">
                    {purgeResult.matchedKeys.join(', ')}
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {activeTab === 'config' && (
          <form onSubmit={handleUpdateConfig} className="ops-form">
            <div className="form-grid-2">
              <div className="field">
                <label className="field-label" htmlFor="config-capacity-input">Max capacity (items)</label>
                <input
                  id="config-capacity-input"
                  type="number"
                  value={capacityInput}
                  onChange={(e) => setCapacityInput(Number(e.target.value))}
                  min="2"
                  max="1000"
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="config-ttl-input">Default TTL (seconds)</label>
                <input
                  id="config-ttl-input"
                  type="number"
                  value={defaultTtlInput}
                  onChange={(e) => setDefaultTtlInput(Number(e.target.value))}
                  min="5"
                  max="86400"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Eviction policy</label>
              <div className="policy-options">
                <label className={`policy-option ${policyInput === 'LRU' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="policy"
                    value="LRU"
                    checked={policyInput === 'LRU'}
                    onChange={() => setPolicyInput('LRU')}
                  />
                  <div>
                    <strong>LRU (least recently used)</strong>
                    <p>Evicts the key that has gone longest without a read.</p>
                  </div>
                </label>

                <label className={`policy-option ${policyInput === 'LFU' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="policy"
                    value="LFU"
                    checked={policyInput === 'LFU'}
                    onChange={() => setPolicyInput('LFU')}
                  />
                  <div>
                    <strong>LFU (least frequently used)</strong>
                    <p>Evicts the key with the fewest reads, ties broken by LRU.</p>
                  </div>
                </label>
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Save settings
            </button>
            {configSuccess && <div className="alert alert-success">{configSuccess}</div>}
          </form>
        )}
      </div>
    </div>
  );
};
