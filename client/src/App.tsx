import React, { useState, useEffect, useCallback } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { CacheStats, CacheItemMetadata, CacheConfig } from '../../shared/types.js';
import { fetchStats, fetchEntries } from './services/index.js';
import { Header } from './components/Header.js';
import { StatsBar } from './components/StatsBar.js';
import { StampedeSandbox } from './components/StampedeSandbox.js';
import { CacheExplorer } from './components/CacheExplorer.js';
import { OperationsPanel } from './components/OperationsPanel.js';
import { DemoBanner } from './components/DemoBanner.js';
import './App.css';

export const App: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [entries, setEntries] = useState<CacheItemMetadata[]>([]);
  const [config, setConfig] = useState<CacheConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>('user:101');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const [statsData, entriesData] = await Promise.all([
        fetchStats(),
        fetchEntries(),
      ]);
      setStats(statsData);
      setEntries(entriesData);
      setConfig({
        capacity: statsData.capacity,
        defaultTtlSeconds: 60,
        policy: statsData.activePolicy,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load cache data');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    // Poll telemetry every 3 seconds
    const interval = setInterval(() => {
      loadData(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="app-container">
      <DemoBanner onReset={() => loadData(true)} />

      <Header
        policy={stats?.activePolicy || 'LRU'}
        keyCount={stats?.keyCount || 0}
        onRefresh={() => loadData(true)}
        isLoading={isLoading}
      />

      <main className="app-main">
        {error && (
          <div className="alert alert-error">
            <span className="alert-message">
              <TriangleAlert size={16} aria-hidden="true" /> {error}
            </span>
            <button className="btn btn-secondary" onClick={() => loadData(true)}>
              Retry
            </button>
          </div>
        )}

        <StatsBar stats={stats} />

        <StampedeSandbox onSuccess={() => loadData(false)} />

        <div className="main-content-split">
          <div className="split-left">
            <CacheExplorer
              entries={entries}
              onMutated={() => loadData(false)}
              onSelectKey={(key) => setSelectedKey(key)}
            />
          </div>

          <div className="split-right">
            <OperationsPanel
              config={config}
              selectedKey={selectedKey}
              onMutated={() => loadData(false)}
            />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div>CacheMesh &bull; MIT License</div>
        <div className="footer-links">
          <a href="https://github.com/Taan1el/cachemesh" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;
