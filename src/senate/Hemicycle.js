import React, { useMemo } from 'react';
import { angleToP, pToAngle, probColor } from './model';

// Parliament-style seat arc with the needle in the middle.
// seats: [{pR, hold: 'D'|'R'|null, label}] ordered D (left) -> R (right). pR = P(R control of the chamber).
const D_SOLID = 'rgb(36,73,153)';
const R_SOLID = 'rgb(210,37,50)';

function layout(N, rows, r0) {
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((1 - r0) * (i + 0.5)) / rows);
  const tot = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((N * r) / tot));
  let left = N - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows, left--) counts[i]++;
  const pos = [];
  radii.forEach((r, i) => {
    const c = counts[i];
    for (let j = 0; j < c; j++) {
      const th = Math.PI - (Math.PI * (j + 0.5)) / c;
      pos.push({ r, th });
    }
  });
  pos.sort((a, b) => b.th - a.th || a.r - b.r);
  return { pos, rows };
}

export default function Hemicycle({ seats, pR, pTie = 0, majorityD, size = 340, rows, compact = false }) {
  const N = seats.length;
  const nRows = rows || (N > 300 ? 13 : N > 80 ? 7 : 4);
  const r0 = 0.46;
  const { pos } = useMemo(() => layout(N, nRows, r0), [N, nRows]);
  const R = size / 2;
  const dot = ((1 - r0) / nRows) * R * (N > 300 ? 0.36 : 0.4);
  const cx = R, cy = R + 4;
  const xy = (r, th) => [cx + Math.cos(th) * r * R, cy - Math.sin(th) * r * R];

  // majority marker between seat majorityD-1 and majorityD (0-based from the left)
  let marker = null;
  if (majorityD && majorityD < N) {
    const th = (pos[majorityD - 1].th + pos[majorityD].th) / 2;
    const [x1, y1] = xy(r0 - 0.02, th), [x2, y2] = xy(1.03, th);
    marker = <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111" strokeWidth="1.2" strokeDasharray="3 3" />;
  }

  // inner gauge: same sin^2 angle link as the needles
  const g1 = r0 * 0.86, g0 = r0 * 0.6;
  const slices = [];
  for (let i = 0; i < 36; i++) {
    const a0 = Math.PI - (i * Math.PI) / 36, a1 = Math.PI - ((i + 1) * Math.PI) / 36;
    const c = probColor(angleToP(-90 + (i + 0.5) * 5));
    const p = [xy(g1, a0), xy(g1, a1), xy(g0, a1), xy(g0, a0)];
    slices.push(<path key={i} d={`M${p[0]}L${p[1]}L${p[2]}L${p[3]}Z`} fill={c} stroke={c} strokeWidth="0.6" />);
  }
  const ang = (pToAngle(pR + pTie / 2) * Math.PI) / 180;
  const tip = [cx + Math.sin(ang) * g1 * R * 1.02, cy - Math.cos(ang) * g1 * R * 1.02];
  const lead = pR > 0.5 ? 'R' : 'D';
  const pct = Math.round((pR > 0.5 ? pR : 1 - pR - pTie) * 100);

  return (
    <svg viewBox={`0 0 ${size} ${R + 12}`} style={{ width: '100%', maxWidth: size, height: 'auto', display: 'block', margin: '0 auto' }}>
      {pos.map((p, i) => {
        const s = seats[i];
        if (!s) return null;
        const [x, y] = xy(p.r, p.th);
        const fill = s.hold === 'D' ? D_SOLID : s.hold === 'R' ? R_SOLID : probColor(s.pR);
        return (
          <circle key={i} cx={x} cy={y} r={dot} fill={fill} opacity={s.hold ? 0.35 : 1}>
            {!compact && <title>{s.label}{s.hold ? ' (not up)' : ` · ${Math.round((s.pR >= 0.5 ? s.pR : 1 - s.pR) * 100)}% ${s.pR >= 0.5 ? 'R' : 'D'}`}</title>}
          </circle>
        );
      })}
      {marker}
      {slices}
      <line x1={cx} y1={cy} x2={tip[0]} y2={tip[1]} stroke="#111" strokeWidth={compact ? 2.5 : 3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={compact ? 4 : 6} fill="#111" />
      <title>{pct}% {lead}</title>
    </svg>
  );
}
