import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Title, Tooltip,
} from 'chart.js';
import React, { useEffect, useState } from 'react';
import { probColor } from './model';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
ChartJS.defaults.color = '#4b5563';

export const BLUE = 'rgb(36,73,153)';
export const RED = 'rgb(210,37,50)';
export const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '–' : `${(x * 100).toFixed(d)}%`);
export const fmtVol = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);

export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
          {title && <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>}
          {right && <div className="text-xs text-gray-500">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ p }) {
  const v = p >= 0.5 ? p : 1 - p;
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
      style={{ background: probColor(p), color: p > 0.3 && p < 0.7 ? '#111' : '#fff' }}>
      {(v * 100).toFixed(1)}% {p >= 0.5 ? 'R' : 'D'}
    </span>
  );
}

// split bar: D share left, R share right
export function ProbBar({ pR, ghost }) {
  const d = 1 - pR;
  return (
    <div className="relative h-5 w-full rounded overflow-hidden flex text-[11px] font-bold tabular-nums">
      <div style={{ width: `${d * 100}%`, background: BLUE }} className="text-white flex items-center pl-1 overflow-hidden whitespace-nowrap">
        {d >= 0.12 ? `${Math.round(d * 100)}%` : ''}
      </div>
      <div style={{ width: `${pR * 100}%`, background: RED }} className="text-white flex items-center justify-end pr-1 overflow-hidden whitespace-nowrap">
        {pR >= 0.12 ? `${Math.round(pR * 100)}%` : ''}
      </div>
      {ghost !== undefined && Math.abs(ghost - pR) > 0.005 && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-300" style={{ left: `${(1 - ghost) * 100}%` }} title="Kalshi" />
      )}
    </div>
  );
}

// merge {label: [[date, v], ...]} into chart.js-ready {labels, datasets}
export function align(seriesMap, styles = {}) {
  const dates = [...new Set(Object.values(seriesMap).flatMap((rows) => rows.map((r) => r[0])))].sort();
  const datasets = Object.entries(seriesMap).map(([label, rows]) => {
    const m = Object.fromEntries(rows);
    return { label, data: dates.map((d) => (d in m ? m[d] : null)), pointRadius: 0, borderWidth: 2, spanGaps: true, ...(styles[label] || {}) };
  });
  return { labels: dates, datasets };
}

export const lineOpts = (yTitle, fmt = (v) => `${Math.round(v * 100)}%`, yMin = 0, yMax = 1) => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 2 } },
    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y === null ? '–' : fmt(c.parsed.y)}` } },
  },
  scales: {
    x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
    y: { min: yMin, max: yMax, title: { display: !!yTitle, text: yTitle }, ticks: { callback: fmt } },
  },
});

export function useDebounced(value, ms = 150) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
