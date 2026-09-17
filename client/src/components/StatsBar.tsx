import React from 'react';
import type { CacheStats } from '../../../shared/types.js';
import { pluralize } from '../utils/pluralize.js';

interface StatsBarProps {
  stats: CacheStats | null;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  if (!stats) {
    return <div className="stats-strip-loading">Loading telemetry.</div>;
  }

  const capacityPercent = stats.capacity > 0 ? Math.min(100, (stats.keyCount / stats.capacity) * 100) : 0;
  const memoryKb = (stats.memoryBytes / 1024).toFixed(1);

  return (
    <div className="stats-strip">
      <div className="stat-cell">
        <span className="stat-label">Hit rate</span>
        <span className="stat-value">{stats.hitRatio}%</span>
        <span className="stat-note">
          {stats.hitCount} {pluralize(stats.hitCount, 'hit')} / {stats.missCount} {pluralize(stats.missCount, 'miss', 'misses')}
        </span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Requests</span>
        <span className="stat-value">{stats.totalRequests.toLocaleString()}</span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Keys cached</span>
        <span className="stat-value">
          {stats.keyCount} <span className="stat-dim">/ {stats.capacity}</span>
        </span>
        <div className="stat-meter" role="meter" aria-valuenow={stats.keyCount} aria-valuemin={0} aria-valuemax={stats.capacity} aria-label="Capacity used">
          <div className="stat-meter-fill" style={{ width: `${capacityPercent}%` }}></div>
        </div>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Memory</span>
        <span className="stat-value">{memoryKb} <span className="stat-dim">KB</span></span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Evictions</span>
        <span className="stat-value">
          {stats.evictionCount} <span className="stat-dim">/ {stats.expiredCount} ttl</span>
        </span>
      </div>
    </div>
  );
};
