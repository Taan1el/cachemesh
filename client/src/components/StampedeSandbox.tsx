import React, { useState } from 'react';
import type { StampedeDemoResult } from '../../../shared/types.js';
import { runStampedeDemo } from '../services/index.js';
import { pluralize } from '../utils/pluralize.js';

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

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <section aria-labelledby="stampede-heading">
      <h2 id="stampede-heading" className="section-heading">Stampede test</h2>
      <p className="section-description">
        Send several concurrent requests for one cold key and compare origin calls with singleflight on and off.
      </p>

      <div className="stampede-section">
        <form className="stampede-form" onSubmit={handleRun}>
          <div className="field">
            <label className="field-label" htmlFor="sandbox-target-key">Target key</label>
            <select
              id="sandbox-target-key"
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              disabled={isRunning}
            >
              <option value="product:pro-mesh">product:pro-mesh</option>
              <option value="user:101">user:101</option>
              <option value="pricing:eu-vat">pricing:eu-vat</option>
              <option value="inventory:warehouse-tallinn">inventory:warehouse-tallinn</option>
            </select>
          </div>

          <div className="field">
            <div className="field-row">
              <label className="field-label" htmlFor="sandbox-concurrency">Concurrent requests</label>
              <span className="field-value">{concurrency}</span>
            </div>
            <input
              id="sandbox-concurrency"
              type="range"
              min="5"
              max="100"
              step="5"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>

          <div className="field">
            <div className="field-row">
              <label className="field-label" htmlFor="sandbox-delay">Simulated origin latency</label>
              <span className="field-value">{delayMs} ms</span>
            </div>
            <input
              id="sandbox-delay"
              type="range"
              min="20"
              max="200"
              step="10"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>

          <div className="checkbox-field">
            <input
              id="sandbox-singleflight"
              type="checkbox"
              checked={useSingleflight}
              onChange={(e) => setUseSingleflight(e.target.checked)}
              disabled={isRunning}
            />
            <label htmlFor="sandbox-singleflight">Coalesce requests (singleflight)</label>
          </div>

          <button className="btn btn-primary" type="submit" disabled={isRunning}>
            {isRunning ? (
              <>
                <span className="spinner"></span> Sending {concurrency} {pluralize(concurrency, 'request')}
              </>
            ) : (
              <>Send {concurrency} {pluralize(concurrency, 'request')}</>
            )}
          </button>

          {error && <div className="alert alert-error">{error}</div>}
        </form>

        {lastResult ? (
          <div className="result-panel">
            <div className="result-panel-header">
              <h3>Result for <code>{lastResult.key}</code></h3>
              <span className="badge">
                <span className={`status-dot ${lastResult.useSingleflight ? 'ok' : 'warn'}`}></span>
                {lastResult.useSingleflight ? 'Coalesced' : 'Not coalesced'}
              </span>
            </div>

            <dl className="result-list">
              <div>
                <dt>Requests sent</dt>
                <dd>{lastResult.concurrentRequests}</dd>
              </div>

              <div>
                <dt>Origin calls</dt>
                <dd>
                  {lastResult.originCalls}
                  <small>{lastResult.originCalls === 1 ? 'one shared query' : 'one call per request'}</small>
                </dd>
              </div>

              <div>
                <dt>Coalesced requests</dt>
                <dd>{lastResult.coalescedHits}</dd>
              </div>

              <div>
                <dt>Total duration</dt>
                <dd>
                  {lastResult.totalDurationMs} ms
                  <small>avg {lastResult.averageLatencyMs} ms</small>
                </dd>
              </div>

              <div>
                <dt>Origin load reduction</dt>
                <dd>{lastResult.savingsPercent}%</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="result-empty">Send a batch of requests to see the origin call count.</div>
        )}
      </div>
    </section>
  );
};
