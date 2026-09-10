import React, { useState, useEffect } from 'react';
import type { CacheItemMetadata } from '../../../shared/types.js';
import { deleteItem, clearAll } from '../services/api.js';

interface CacheExplorerProps {
  entries: CacheItemMetadata[];
  onMutated: () => void;
  onSelectKey: (key: string) => void;
}

export const CacheExplorer: React.FC<CacheExplorerProps> = ({ entries, onMutated, onSelectKey }) => {
  const [filter, setFilter] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  // Tick every second to update TTL countdown progress bars smoothly
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDelete = async (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    try {
      await deleteItem(key);
      onMutated();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Clear all entries from in-memory cache?')) {
      try {
        await clearAll();
        onMutated();
      } catch (err: any) {
        alert(`Clear failed: ${err.message}`);
      }
    }
  };

  const filteredEntries = entries.filter((e) =>
    e.key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="explorer-card">
      <div className="explorer-header">
        <div className="explorer-title-row">
          <h2 className="explorer-title">Active In-Memory Cache Entries ({entries.length})</h2>
          <div className="explorer-actions">
            <input
              type="text"
              placeholder="Filter keys (e.g. user:, product:)..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="search-input"
            />
            <button className="btn btn-danger btn-sm" onClick={handleClearAll} disabled={entries.length === 0}>
              Clear Cache
            </button>
          </div>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📭</span>
          <h3>No Cached Entries Found</h3>
          <p>
            {filter
              ? `No keys match filter "${filter}".`
              : 'Cache is currently cold. Run queries from the workbench or execute the stampede simulation above.'}
          </p>
        </div>
      ) : (
        <div className="entries-grid">
          {filteredEntries.map((entry) => {
            const nowTime = Date.now();
            const hasTtl = entry.expiresAt !== null;
            const remainingMs = hasTtl ? Math.max(0, entry.expiresAt! - nowTime) : null;
            const remainingSec = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
            const totalDurationSec = hasTtl ? Math.max(1, Math.round((entry.expiresAt! - entry.createdAt) / 1000)) : 60;
            const progressPercent = remainingSec !== null ? Math.min(100, Math.max(0, (remainingSec / totalDurationSec) * 100)) : 100;
            const isExpanded = expandedKey === entry.key;

            return (
              <div
                key={entry.key}
                className={`entry-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedKey(isExpanded ? null : entry.key)}
              >
                <div className="entry-card-top">
                  <div className="entry-key-section">
                    <span className="entry-key-name">{entry.key}</span>
                    <span className="badge badge-freq" title="Access Frequency">
                      ★ {entry.frequency} reqs
                    </span>
                  </div>
                  <div className="entry-btn-group">
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectKey(entry.key);
                      }}
                      title="Test GET in workbench"
                    >
                      Inspect
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={(e) => handleDelete(e, entry.key)}
                      title="Invalidate key"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {hasTtl && (
                  <div className="ttl-bar-wrapper">
                    <div className="ttl-info-row">
                      <span className="ttl-label">TTL Expiry:</span>
                      <span className={`ttl-countdown ${remainingSec! < 10 ? 'expiring-soon' : ''}`}>
                        {remainingSec}s remaining
                      </span>
                    </div>
                    <div className="ttl-track">
                      <div
                        className={`ttl-fill ${remainingSec! < 15 ? 'ttl-warn' : ''}`}
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="entry-meta-footer">
                  <span>Size: {entry.sizeBytes} B</span>
                  <span>Hits: {entry.hits}</span>
                  <span>
                    Last: {Math.max(0, Math.round((nowTime - entry.lastAccessedAt) / 1000))}s ago
                  </span>
                </div>

                {isExpanded && (
                  <div className="entry-payload-viewer" onClick={(e) => e.stopPropagation()}>
                    <div className="payload-header">Stored Value:</div>
                    <pre className="payload-code">
                      {typeof entry.value === 'object'
                        ? JSON.stringify(entry.value, null, 2)
                        : String(entry.value)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
