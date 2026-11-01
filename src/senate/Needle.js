import React, { useEffect, useRef, useState } from 'react';
import { angleToP, pToAngle, probColor } from './model';

// Compact needle: same sin^2 angle<->probability link as the 2024 tab. Drag to override.
const R = 70;

export default function Needle({ race, p, market, onChange, locked }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const angle = pToAngle(p);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      const rect = ref.current.getBoundingClientRect();
      const dx = pt.clientX - (rect.left + rect.width / 2);
      const dy = rect.top + R + 6 - pt.clientY;
      let a = dy < 0 ? 90 * Math.sign(dx) : 90 - Math.atan2(dy, dx) * 180 / Math.PI;
      a = Math.max(-90, Math.min(90, a));
      onChange(race.st, angleToP(a));
    };
    const up = () => setDrag(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [drag, onChange, race.st]);

  // gradient arc: 36 slices from D (left) to R (right)
  const slices = [];
  for (let i = 0; i < 36; i++) {
    const a0 = Math.PI - (i * Math.PI) / 36, a1 = Math.PI - ((i + 1) * Math.PI) / 36;
    const pr = angleToP(-90 + (i + 0.5) * 5);
    const ri = R * 0.62;
    const pts = [
      [R + R * Math.cos(a0), R - R * Math.sin(a0)], [R + R * Math.cos(a1), R - R * Math.sin(a1)],
      [R + ri * Math.cos(a1), R - ri * Math.sin(a1)], [R + ri * Math.cos(a0), R - ri * Math.sin(a0)],
    ];
    slices.push(<path key={i} d={`M${pts[0]}L${pts[1]}L${pts[2]}L${pts[3]}Z`} fill={probColor(pr)} stroke={probColor(pr)} strokeWidth="0.5" />);
  }
  const mA = (pToAngle(market) * Math.PI) / 180;
  const nA = (angle * Math.PI) / 180;
  const pD = 1 - p;
  const label = p >= 0.5 ? `${(p * 100).toFixed(0)}% R` : `${(pD * 100).toFixed(0)}% D`;
  const moved = Math.abs(p - market) > 0.005;

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 2 * R + 16 }}>
      <div className="text-sm font-bold" style={{ color: probColor(p) === undefined ? '#000' : '#111' }}>
        {race.st} <span style={{ color: p >= 0.5 ? '#b91c1c' : '#1d4ed8' }}>{label}</span>
        {locked !== undefined && <span className="ml-1 text-xs text-gray-500">(locked {locked ? 'R' : 'D'})</span>}
      </div>
      <svg ref={ref} width={2 * R} height={R + 8} style={{ cursor: 'grab', touchAction: 'none', overflow: 'visible' }}
        onMouseDown={() => setDrag(true)} onTouchStart={() => setDrag(true)}>
        {slices}
        {/* market tick */}
        <line x1={R + Math.sin(mA) * R * 0.55} y1={R - Math.cos(mA) * R * 0.55} x2={R + Math.sin(mA) * (R + 5)} y2={R - Math.cos(mA) * (R + 5)}
          stroke="#111" strokeWidth="2" strokeDasharray="2 2" />
        <line x1={R} y1={R} x2={R + Math.sin(nA) * R * 0.95} y2={R - Math.cos(nA) * R * 0.95} stroke="#111" strokeWidth="2.5" />
        <circle cx={R} cy={R} r="5" fill="#111" />
      </svg>
      <div className="text-xs text-gray-600 text-center leading-tight" style={{ maxWidth: 2 * R + 16 }}>
        {race.d || race.r ? `${race.d || '?'} v ${race.r || '?'}` : ''}
      </div>
      {moved && (
        <button className="text-xs text-blue-700 underline" onClick={() => onChange(race.st, market)}>
          reset to Kalshi {Math.round((market >= 0.5 ? market : 1 - market) * 100)}% {market >= 0.5 ? 'R' : 'D'}
        </button>
      )}
    </div>
  );
}
