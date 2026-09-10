import React, { useState } from 'react';
import type { CacheConfig, EvictionPolicy } from '../../../shared/types.js';
import { getItem, setItem, purgePattern, updateConfig } from '../services/api.js';

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
      setSetSuccess(`Key "${setKeyInput}" cached successfully.`);
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
      setConfigSuccess('Configuration updated successfully.');
      onMutated();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  return (
    <div className="ops-card">
      <div className="ops-tabs">
        <button
          className={`tab-btn ${activeTab === 'get' ? 'active' : ''}`}
          onClick={() => setActiveTab('get')}
        >
          🔍 GET Key
        </button>
        <button
          className={`tab-btn ${activeTab === 'set' ? 'active' : ''}`}
          onClick={() => setActiveTab('set')}
        >
          ✍️ SET Key
        </button>
        <button
          className={`tab-btn ${activeTab === 'purge' ? 'active' : ''}`}
          onClick={() => setActiveTab('purge')}
        >
          🧹 Pattern Invalidation
        </button>
        <button
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Gateway Settings
        </button>
      </div>

      <div className="ops-body">
        {activeTab === 'get' && (
          <form onSubmit={handleGet} className="ops-form">
            <div className="form-row">
              <label className="form-label">Key to Retrieve</label>
              <div className="input-group">
                <input
                  type="text"
                  value={getKey}
                  onChange={(e) => setGetKey(e.target.value)}
                  placeholder="e.g. user:101, product:pro-mesh"
                  className="input-text"
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={getLoading}>
                  {getLoading ? 'Evaluating...' : 'Fetch Key'}
                </button>
              </div>
              <span className="form-help">
                If key is not in cache, gateway automatically retrieves from SQLite origin and caches it.
              </span>
            </div>

            {getError && <div className="alert alert-error">{getError}</div>}

            {getResult && (
              <div className="result-viewer">
                <div className="result-tags">
                  <span className={`badge ${getResult.source === 'cache' ? 'badge-success' : 'badge-origin'}`}>
                    {getResult.source === 'cache' ? '⚡ CACHE HIT' : '💾 ORIGIN MISS'}
                  </span>
                  <span className="badge badge-latency">
                    Latency: {getResult.latencyMs} ms
                  </span>
                  {getResult.coalesced && (
                    <span className="badge badge-coalesced">Singleflight Coalesced</span>
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
            <div className="form-row">
              <label className="form-label">Key</label>
              <input
                type="text"
                value={setKeyInput}
                onChange={(e) => setSetKeyInput(e.target.value)}
                className="input-text"
                required
              />
            </div>
            <div className="form-row">
              <label className="form-label">Value (JSON or Text)</label>
              <textarea
                value={setValueInput}
                onChange={(e) => setSetValueInput(e.target.value)}
                className="input-textarea"
                rows={4}
                required
              />
            </div>
            <div className="form-row">
              <label className="form-label">TTL (seconds, 0 for indefinite)</label>
              <input
                type="number"
                value={setTtlInput}
                onChange={(e) => setSetTtlInput(Number(e.target.value))}
                className="input-text"
                min="0"
                max="86400"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Save to Cache
            </button>
            {setSuccess && <div className="alert alert-success">{setSuccess}</div>}
          </form>
        )}

        {activeTab === 'purge' && (
          <form onSubmit={handlePurge} className="ops-form">
            <div className="form-row">
              <label className="form-label">Wildcard Glob Pattern</label>
              <div className="input-group">
                <input
                  type="text"
                  value={purgePatternInput}
                  onChange={(e) => setPurgePatternInput(e.target.value)}
                  placeholder="e.g. user:*, product:*"
                  className="input-text"
                  required
                />
                <button type="submit" className="btn btn-warning">
                  Purge Pattern
                </button>
              </div>
              <span className="form-help">
                Instantly purges all keys matching glob regex. Ideal for tenant or entity invalidations.
              </span>
            </div>

            {purgeResult && (
              <div className="alert alert-info">
                Purged <strong>{purgeResult.purgedCount}</strong> keys matching pattern &ldquo;{purgeResult.pattern}&rdquo;.
                {purgeResult.matchedKeys.length > 0 && (
                  <div className="purged-list">
                    Keys: {purgeResult.matchedKeys.join(', ')}
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {activeTab === 'config' && (
          <form onSubmit={handleUpdateConfig} className="ops-form">
            <div className="form-grid-2">
              <div className="form-row">
                <label className="form-label">Max Capacity (Items)</label>
                <input
                  type="number"
                  value={capacityInput}
                  onChange={(e) => setCapacityInput(Number(e.target.value))}
                  className="input-text"
                  min="2"
                  max="1000"
                  required
                />
              </div>

              <div className="form-row">
                <label className="form-label">Default TTL (Seconds)</label>
                <input
                  type="number"
                  value={defaultTtlInput}
                  onChange={(e) => setDefaultTtlInput(Number(e.target.value))}
                  className="input-text"
                  min="5"
                  max="86400"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">Eviction Policy Algorithm</label>
              <div className="policy-radio-group">
                <label className={`policy-radio-card ${policyInput === 'LRU' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="policy"
                    value="LRU"
                    checked={policyInput === 'LRU'}
                    onChange={() => setPolicyInput('LRU')}
                  />
                  <div>
                    <strong>LRU (Least Recently Used)</strong>
                    <p>Evicts items that haven't been accessed for the longest time.</p>
                  </div>
                </label>

                <label className={`policy-radio-card ${policyInput === 'LFU' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="policy"
                    value="LFU"
                    checked={policyInput === 'LFU'}
                    onChange={() => setPolicyInput('LFU')}
                  />
                  <div>
                    <strong>LFU (Least Frequently Used)</strong>
                    <p>Evicts items with the lowest access frequency, ties broken by LRU.</p>
                  </div>
                </label>
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Apply Configuration
            </button>
            {configSuccess && <div className="alert alert-success">{configSuccess}</div>}
          </form>
        )}
      </div>
    </div>
  );
};
