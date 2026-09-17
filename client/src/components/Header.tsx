import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { EvictionPolicy } from '../../../shared/types.js';
import { pluralize } from '../utils/pluralize.js';

interface HeaderProps {
  policy: EvictionPolicy;
  keyCount: number;
  onRefresh: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ policy, keyCount, onRefresh, isLoading }) => {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div>
          <h1 className="brand-name">CacheMesh</h1>
          <p className="brand-subtitle">
            In-memory cache gateway with LRU and LFU eviction, TTL expiry, and singleflight stampede protection.
          </p>
          <div className="header-meta">
            <span className="badge">v1.0</span>
            <span className="badge">Policy: {policy}</span>
          </div>
        </div>

        <div className="header-actions">
          <span className="key-count">
            <strong>{keyCount}</strong> {pluralize(keyCount, 'key')} cached
          </span>
          <button
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={isLoading}
            title="Manual refresh"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {isLoading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  );
};
