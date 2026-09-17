import React, { useState, useEffect } from 'react';
import { Search, Eye, Trash2, Inbox } from 'lucide-react';
import type { CacheItemMetadata } from '../../../shared/types.js';
import { deleteItem, clearAll } from '../services/index.js';

interface CacheExplorerProps {
  entries: CacheItemMetadata[];
  onMutated: () => void;
  onSelectKey: (key: string) => void;
}

export const CacheExplorer: React.FC<CacheExplorerProps> = ({ entries, onMutated, onSelectKey }) => {
  const [filter, setFilter] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  // Tick every second to update TTL countdowns.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDelete = async (key: string) => {
    try {
      await deleteItem(key);
      onMutated();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Clear all entries from the cache?')) {
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
    <section aria-labelledby="explorer-heading">
      <div className="explorer-toolbar">
        <div>
          <h2 id="explorer-heading" className="section-heading">Keys in cache ({entries.length})</h2>
        </div>
        <div className="explorer-controls">
          <div className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              aria-label="Filter cache keys"
              placeholder="Filter keys"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button className="btn btn-danger" onClick={handleClearAll} disabled={entries.length === 0}>
            Clear cache
          </button>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="empty-state">
          <Inbox size={28} aria-hidden="true" />
          <h3>No keys cached</h3>
          <p>
            {filter
              ? `No keys match "${filter}".`
              : 'Run a request from the workbench or the stampede test to populate the cache.'}
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="entries-table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Hits</th>
                <th scope="col">Size</th>
                <th scope="col">TTL</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const nowTime = Date.now();
                const hasTtl = entry.expiresAt !== null;
                const remainingMs = hasTtl ? Math.max(0, entry.expiresAt! - nowTime) : null;
                const remainingSec = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
                const isExpanded = expandedKey === entry.key;

                return (
                  <React.Fragment key={entry.key}>
                    <tr>
                      <td>
                        <div className="key-cell">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedKey(isExpanded ? null : entry.key)}
                          >
                            {entry.key}
                          </button>
                        </div>
                      </td>
                      <td className="mono">{entry.hits}</td>
                      <td className="mono">{entry.sizeBytes} B</td>
                      <td className={`ttl-cell ${remainingSec !== null && remainingSec < 10 ? 'expiring-soon' : ''}`}>
                        {remainingSec !== null ? `${remainingSec}s` : 'none'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            onClick={() => onSelectKey(entry.key)}
                            title="Open in workbench"
                            aria-label={`Open ${entry.key} in workbench`}
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => handleDelete(entry.key)}
                            title="Delete key"
                            aria-label={`Delete ${entry.key}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="value-row">
                        <td colSpan={5}>
                          <pre className="value-preview">
                            {typeof entry.value === 'object'
                              ? JSON.stringify(entry.value, null, 2)
                              : String(entry.value)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
