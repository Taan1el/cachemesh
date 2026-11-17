import { useSyncExternalStore } from 'react';
import type { ReplayRow } from './replay';

const POLICIES = ['LRU', 'LFU', 'TTL'] as const;
const STYLE = {
  LRU: { color: 'var(--accent)', dash: undefined, marker: 'circle' },
  LFU: { color: 'var(--ink)', dash: '9 5', marker: 'square' },
  TTL: { color: 'var(--warn)', dash: '2 5', marker: 'diamond' },
} as const;
const NARROW = '(max-width: 480px)';
const RIGHT = 20, TOP = 20, BOTTOM = 56;

// A narrower drawing on phones keeps the labels near their normal size instead of shrinking the whole chart.
function useNarrow(): boolean {
  const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null);
  return useSyncExternalStore(
    (notify) => { const list = query(); list?.addEventListener('change', notify); return () => list?.removeEventListener('change', notify); },
    () => query()?.matches ?? false,
    () => false,
  );
}

function Marker({ kind, x, y, color }: { kind: string; x: number; y: number; color: string }) {
  if (kind === 'square') return <rect x={x - 5} y={y - 5} width="10" height="10" fill={color} />;
  if (kind === 'diamond') return <polygon points={`${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`} fill={color} />;
  return <circle cx={x} cy={y} r="5" fill={color} />;
}

/** Hit rate against capacity for each policy. Sizes are evenly spaced; the table below holds the exact numbers. */
export function HitRateChart({ rows, sizes, target }: { rows: ReplayRow[]; sizes: number[]; target: number }) {
  const narrow = useNarrow();
  const W = narrow ? 360 : 640, H = narrow ? 320 : 300, LEFT = narrow ? 46 : 60;
  const PLOT_W = W - LEFT - RIGHT, PLOT_H = H - TOP - BOTTOM;
  const x = (i: number) => LEFT + (sizes.length === 1 ? PLOT_W / 2 : (i / (sizes.length - 1)) * PLOT_W);
  const y = (rate: number) => TOP + (1 - rate) * PLOT_H;
  const labelStep = Math.ceil(sizes.length / (narrow ? 4 : 7));
  return (
    <figure className="local-figure">
      <ul className="local-legend" aria-label="Chart key">
        {POLICIES.map((policy) => (
          <li key={policy}>
            <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
              <line x1="0" y1="8" x2="36" y2="8" stroke={STYLE[policy].color} strokeWidth="3" strokeDasharray={STYLE[policy].dash} />
              <Marker kind={STYLE[policy].marker} x={18} y={8} color={STYLE[policy].color} />
            </svg>
            {policy}
          </li>
        ))}
      </ul>
      <svg className="local-chart" data-narrow={narrow || undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hit rate for each policy at each tested cache size. The table below lists the exact values.">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} className="local-grid-line" />
            <text x={LEFT - 8} y={y(tick) + 5} textAnchor="end">{tick * 100}%</text>
          </g>
        ))}
        <line x1={LEFT} x2={W - RIGHT} y1={y(target)} y2={y(target)} className="local-target-line" />
        {POLICIES.map((policy) => {
          const series = rows.filter((row) => row.policy === policy);
          const style = STYLE[policy];
          return (
            <g key={policy}>
              <polyline fill="none" stroke={style.color} strokeWidth="3" strokeDasharray={style.dash} points={series.map((row, i) => `${x(i)},${y(row.hitRate)}`).join(' ')} />
              {series.map((row, i) => <Marker key={row.capacity} kind={style.marker} x={x(i)} y={y(row.hitRate)} color={style.color} />)}
            </g>
          );
        })}
        {sizes.map((size, i) => (sizes.length - 1 - i) % labelStep === 0 && <text key={size} x={x(i)} y={H - 30} textAnchor="middle">{size}</text>)}
        <text x={LEFT + PLOT_W / 2} y={H - 6} textAnchor="middle">{narrow ? 'Cache size in keys' : 'Cache size in keys, evenly spaced'}</text>
      </svg>
      <figcaption>Sizes are evenly spaced. The thin line marks your target hit rate.</figcaption>
    </figure>
  );
}
