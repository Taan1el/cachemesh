import React from 'react';
import { isDemoMode, resetDemoData } from '../services/index.js';

interface DemoBannerProps {
  onReset: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onReset }) => {
  if (!isDemoMode) return null;

  const handleReset = () => {
    if (window.confirm('Reset the simulated cache and origin data back to the seed catalog?')) {
      resetDemoData();
      onReset();
    }
  };

  return (
    <div className="demo-banner" role="status">
      <span>
        Demo mode: data is simulated in your browser and never leaves your device.{' '}
        <a href="https://github.com/Taan1el/cachemesh" target="_blank" rel="noreferrer">
          View source on GitHub
        </a>
      </span>
      <button type="button" className="btn btn-secondary btn-xs" onClick={handleReset}>
        Reset demo data
      </button>
    </div>
  );
};
