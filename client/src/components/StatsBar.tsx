import React from 'react';
import type { CacheStats } from '../../../shared/types.js';

interface StatsBarProps {
  stats: CacheStats | null;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  if (!stats) {
    return <div className="stats-bar-skeleton">Loading telemetry...</div>;
  }

  const capacityUsage = stats.capacity > 0 ? ((stats.keyCount / stats.capacity) * 100).toFixed(0) : '0';
  const memoryKb = (stats.memoryBytes / 1024).toFixed(1);

  return (
    <div className="stats-bar-grid">
      <div className="stat-card stat-hit-ratio">
        <div className="stat-header">
          <span className="stat-label">Cache Hit Ratio</span>
          <span className="stat-icon">🎯</span>
        </div>
        <div className="stat-value-large">
          {stats.hitRatio}%
        </div>
        <div className="stat-progress-container">
          <div
            className="stat-progress-bar hit-progress"
            style={{ width: `${Math.min(100, stats.hitRatio)}%` }}
          ></div>
        </div>
        <div className="stat-subtext">
          {stats.hitCount} hits / {stats.missCount} misses
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <span className="stat-label">Total Requests</span>
          <span className="stat-icon">📊</span>
        </div>
        <div className="stat-value">{stats.totalRequests.toLocaleString()}</div>
        <div className="stat-subtext">
          Throughput processed
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <span className="stat-label">Active Keys / Capacity</span>
          <span className="stat-icon">💾</span>
        </div>
        <div className="stat-value">
          {stats.keyCount} <span className="stat-dim">/ {stats.capacity}</span>
        </div>
        <div className="stat-progress-container">
          <div
            className="stat-progress-bar capacity-progress"
            style={{ width: `${Math.min(100, Number(capacityUsage))}%` }}
          ></div>
        </div>
        <div className="stat-subtext">
          {capacityUsage}% memory capacity utilized
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <span className="stat-label">Estimated Memory</span>
          <span className="stat-icon">🧠</span>
        </div>
        <div className="stat-value">{memoryKb} <span className="stat-unit">KB</span></div>
        <div className="stat-subtext">
          Heap buffer allocation
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <span className="stat-label">Evictions & Expirations</span>
          <span className="stat-icon">🧹</span>
        </div>
        <div className="stat-value">
          {stats.evictionCount} <span className="stat-dim">evict</span> / {stats.expiredCount} <span className="stat-dim">ttl</span>
        </div>
        <div className="stat-subtext">
          Policy: <span className="policy-highlight">{stats.activePolicy}</span>
        </div>
      </div>
    </div>
  );
};
