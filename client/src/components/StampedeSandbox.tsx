import React, { useState } from 'react';
import type { StampedeDemoResult } from '../../../shared/types.js';
import { runStampedeDemo } from '../services/api.js';

interface StampedeSandboxProps {
  onSuccess: () => void;
}

export const StampedeSandbox: React.FC<StampedeSandboxProps> = ({ onSuccess }) => {
  const [concurrency, setConcurrency] = useState<number>(30);
  const [delayMs, setDelayMs] = useState<number>(80);
  const [useSingleflight, setUseSingleflight] = useState<boolean>(true);
  const [targetKey, setTargetKey] = useState<string>('product:pro-mesh');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<StampedeDemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runStampedeDemo({
        key: targetKey,
        concurrentRequests: concurrency,
        simulatedOriginDelayMs: delayMs,
        useSingleflight,
      });
      setLastResult(result);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Simulation failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="sandbox-panel">
      <div className="sandbox-header">
        <div className="sandbox-title-area">
          <span className="sandbox-badge">Live System Benchmark</span>
          <h2 className="sandbox-title">Cache Stampede & Thundering Herd Guard</h2>
          <p className="sandbox-description">
            Simulate <strong>N simultaneous requests</strong> hitting an uncached key. With <strong>Singleflight Promise Coalescing</strong>, 
            concurrent requests share a single in-flight origin database query, eliminating database connection spikes.
          </p>
        </div>
      </div>

      <div className="sandbox-controls-grid">
        <div className="control-group">
          <label className="control-label">Target Entity Key</label>
          <select
            className="input-select"
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
            disabled={isRunning}
          >
            <option value="product:pro-mesh">product:pro-mesh (Heavy catalog)</option>
            <option value="user:101">user:101 (User profile)</option>
            <option value="pricing:eu-vat">pricing:eu-vat (Tax matrix)</option>
            <option value="inventory:warehouse-tallinn">inventory:warehouse-tallinn (Stock)</option>
          </select>
        </div>

        <div className="control-group">
          <div className="slider-label-row">
            <label className="control-label">Concurrent Requests</label>
            <span className="slider-value-badge">{concurrency} reqs</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="slider-range"
            disabled={isRunning}
          />
        </div>

        <div className="control-group">
          <div className="slider-label-row">
            <label className="control-label">Simulated Origin Latency</label>
            <span className="slider-value-badge">{delayMs} ms</span>
          </div>
          <input
            type="range"
            min="20"
            max="200"
            step="10"
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="slider-range"
            disabled={isRunning}
          />
        </div>

        <div className="control-group switch-group">
          <label className="control-label">Singleflight Protection</label>
          <div className="toggle-switch-container">
            <button
              type="button"
              className={`toggle-btn ${useSingleflight ? 'active' : ''}`}
              onClick={() => setUseSingleflight(!useSingleflight)}
              disabled={isRunning}
            >
              {useSingleflight ? 'ENABLED (Coalescing Active)' : 'DISABLED (Direct Flood)'}
            </button>
          </div>
        </div>
      </div>

      <div className="sandbox-action-row">
        <button
          className={`btn btn-primary btn-lg ${isRunning ? 'loading' : ''}`}
          onClick={handleRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <span className="spinner"></span> Dispatching {concurrency} Concurrent Reqs...
            </>
          ) : (
            <>🚀 Fire {concurrency} Concurrent Requests</>
          )}
        </button>

        {error && <div className="alert alert-error">{error}</div>}
      </div>

      {lastResult && (
        <div className="sandbox-results-card">
          <div className="results-header">
            <h3>Simulation Results for: <code>{lastResult.key}</code></h3>
            <span className={`status-badge ${lastResult.useSingleflight ? 'badge-success' : 'badge-warning'}`}>
              {lastResult.useSingleflight ? '✓ Protected by Singleflight' : '⚠️ Unprotected Raw Flood'}
            </span>
          </div>

          <div className="results-metrics-grid">
            <div className="metric-box">
              <span className="metric-title">Incoming Requests</span>
              <span className="metric-val">{lastResult.concurrentRequests}</span>
              <span className="metric-detail">Dispatched simultaneously</span>
            </div>

            <div className="metric-box highlight">
              <span className="metric-title">Origin DB Invocations</span>
              <span className={`metric-val ${lastResult.originCalls === 1 ? 'text-emerald' : 'text-amber'}`}>
                {lastResult.originCalls}
              </span>
              <span className="metric-detail">
                {lastResult.originCalls === 1 ? 'Single shared query executed' : 'Uncoalesced direct DB queries'}
              </span>
            </div>

            <div className="metric-box">
              <span className="metric-title">Coalesced Requests</span>
              <span className="metric-val text-cyan">{lastResult.coalescedHits}</span>
              <span className="metric-detail">Reused in-flight promise</span>
            </div>

            <div className="metric-box">
              <span className="metric-title">Total Duration</span>
              <span className="metric-val">{lastResult.totalDurationMs} ms</span>
              <span className="metric-detail">Avg: {lastResult.averageLatencyMs} ms</span>
            </div>

            <div className="metric-box highlight-emerald">
              <span className="metric-title">Origin Load Reduction</span>
              <span className="metric-val text-emerald">{lastResult.savingsPercent}%</span>
              <span className="metric-detail">Database query reduction</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
