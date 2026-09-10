import React from 'react';
import type { EvictionPolicy } from '../../../shared/types.js';

interface HeaderProps {
  policy: EvictionPolicy;
  keyCount: number;
  onRefresh: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ policy, keyCount, onRefresh, isLoading }) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo">
          <span className="brand-icon">⚡</span>
          <div className="pulse-ring"></div>
        </div>
        <div className="brand-titles">
          <div className="brand-row">
            <h1 className="brand-name">CacheMesh</h1>
            <span className="badge badge-version">v1.0</span>
            <span className={`badge badge-policy ${policy.toLowerCase()}`}>
              Policy: {policy}
            </span>
          </div>
          <p className="brand-subtitle">
            High-Throughput Key-Value Cache Gateway & Singleflight Stampede Protection
          </p>
        </div>
      </div>

      <div className="header-actions">
        <div className="live-pill">
          <span className="live-dot"></span>
          <span>{keyCount} keys active</span>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={isLoading}
          title="Manual refresh"
        >
          {isLoading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>
    </header>
  );
};
