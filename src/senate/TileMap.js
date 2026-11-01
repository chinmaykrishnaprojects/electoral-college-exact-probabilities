import React from 'react';
import { probColor } from './model';

const GRID = {
  AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
};

// values: {ST: P(R)} for races on the ballot; hold: {ST: 'D'|'R'} for seats not up
export default function TileMap({ values, hold = {}, onPick, selected }) {
  const S = 46, G = 4;
  return (
    <svg viewBox={`0 0 ${12 * (S + G)} ${8 * (S + G)}`} style={{ width: '100%', maxWidth: 640, height: 'auto', display: 'block', margin: '0 auto' }}>
      {Object.entries(GRID).map(([st, [c, r]]) => {
        const p = values[st];
        const x = c * (S + G), y = r * (S + G);
        const up = p !== undefined && p !== null;
        const fill = up ? probColor(p) : hold[st] === 'D' ? 'rgba(36,73,153,0.18)' : hold[st] === 'R' ? 'rgba(210,37,50,0.18)' : '#eceae4';
        const dark = up && (p < 0.3 || p > 0.7);
        const lead = up ? (p >= 0.5 ? `${Math.round(p * 100)}R` : `${Math.round((1 - p) * 100)}D`) : '';
        return (
          <g key={st} onClick={() => up && onPick && onPick(st)} style={{ cursor: up && onPick ? 'pointer' : 'default' }}>
            <rect x={x} y={y} width={S} height={S} rx="5" fill={fill} stroke={selected === st ? '#111' : 'none'} strokeWidth="2.5" />
            <text x={x + S / 2} y={y + (up ? 19 : 28)} textAnchor="middle" fontSize="13" fontWeight="700" fill={dark ? '#fff' : '#333'}>{st}</text>
            {up && <text x={x + S / 2} y={y + 36} textAnchor="middle" fontSize="11" fill={dark ? '#fff' : '#333'}>{lead}</text>}
            <title>{st}{up ? ` · ${p >= 0.5 ? `${(p * 100).toFixed(1)}% R` : `${((1 - p) * 100).toFixed(1)}% D`}` : hold[st] ? ` · not up (${hold[st]})` : ''}</title>
          </g>
        );
      })}
    </svg>
  );
}
