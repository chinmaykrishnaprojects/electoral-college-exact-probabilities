import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import Hemicycle from './Hemicycle';
import { condMatrix, logW, mixChamber, normW, NX, probColor, wQuantiles } from './model';
import RETRO from './retro.json';
import { BLUE, Card, ProbBar, RED, pct } from './ui';

// 2026 results: where the outcome landed in the market's distribution, and the Bayesian replay of election night.
const CH = {
  senate: { name: 'Senate', unit: 'seats', holdD: 34, holdR: 31, majorityD: 51, tieAtD: null, label: (r) => `${r.k} Sen` },
  house: { name: 'House', unit: 'seats', holdD: 0, holdR: 0, majorityD: 218, tieAtD: null, label: (r) => r.k },
  gov: { name: 'Governors', unit: 'governors', holdD: 6, holdR: 8, majorityD: 26, tieAtD: 25, label: (r) => `${r.k} Gov` },
};
const KEYS = ['senate', 'house', 'gov'];
const NIGHT = RETRO.night;
const SNAP_DATES = Object.keys(RETRO.snaps.senate).sort().reverse();
const FINAL = SNAP_DATES[0];
const KALSHI_NIGHT = { senate: RETRO.ctl_night.senate, house: RETRO.ctl_night.house, gov: RETRO.ctl_night['gov|Democratic Party'] };

const bestRho = (scope) => {
  const ev = RETRO.evidence[scope];
  const ll = ev.ll['Beta (app)'];
  return ev.rho[ll.indexOf(Math.max(...ll))];
};
const RHO_SETS = {
  kalshi: { label: 'Kalshi-fit', rho: RETRO.rho },
  best: { label: 'Best fit to results', rho: { senate: bestRho('senate'), house: bestRho('house'), gov: bestRho('gov') } },
  high: { label: '0.85 (2024 experts)', rho: { senate: 0.85, house: 0.85, gov: 0.85 } },
  indep: { label: 'Independent', rho: { senate: 0, house: 0, gov: 0 } },
};

// every settled race, in Kalshi settlement order
const EVENTS = KEYS.flatMap((ch) => NIGHT[ch].map((r, i) => ({ ch, i, r })).filter((e) => e.r.won !== null && e.r.call && !e.r.nomkt))
  .sort((a, b) => a.r.call - b.r.call);

const fmtT = (ts) => {
  const d = new Date((ts - 5 * 3600) * 1000);
  let h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${day} ${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ap} ET`;
};
const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pctl = (x) => `${Math.round(x * 100)}`;
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function controlProbs(ch, dist) {
  const c = CH[ch];
  const N = NIGHT[ch].length;
  let pD = 0, pTie = 0, eD = 0;
  for (let k = 0; k <= N; k++) {
    const dT = c.holdD + N - k;
    eD += dT * dist[k];
    if (dT >= c.majorityD) pD += dist[k];
    else if (c.tieAtD !== null && dT === c.tieAtD) pTie += dist[k];
  }
  return { pD, pTie, pR: 1 - pD - pTie, eD };
}
const actualD = (ch) => CH[ch].holdD + NIGHT[ch].length - RETRO.actual[ch];

// ---------- percentile needle: linear 0..100 national percentile (0 = best case D, 100 = best case R)
function PercentileGauge({ w, size = 300 }) {
  const R = size / 2, cx = R, cy = R + 2;
  const q = wQuantiles(w);
  const xy = (r, x) => { const th = Math.PI * (1 - x); return [cx + Math.cos(th) * r, cy - Math.sin(th) * r]; };
  const arc = (r0, r1, a, b, fill, key, op = 1) => {
    const p = [xy(r1, a), xy(r1, b), xy(r0, b), xy(r0, a)];
    return <path key={key} opacity={op} fill={fill}
      d={`M${p[0]}A${r1},${r1} 0 0 1 ${p[1]}L${p[2]}A${r0},${r0} 0 0 0 ${p[3]}Z`} />;
  };
  const slices = [];
  for (let i = 0; i < 50; i++) slices.push(arc(R * 0.72, R * 0.95, i / 50, (i + 1) / 50, probColor((i + 0.5) / 50), i));
  const tip = xy(R * 0.92, q[2]);
  return (
    <svg viewBox={`0 0 ${size} ${R + 14}`} style={{ width: '100%', maxWidth: size, display: 'block', margin: '0 auto' }}>
      {slices}
      {arc(R * 0.6, R * 0.69, q[0], q[4], '#111', 'b90', 0.25)}
      {arc(R * 0.6, R * 0.69, q[1], q[3], '#111', 'b50', 0.6)}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const [x1, y1] = xy(R * 0.95, t), [x2, y2] = xy(R * 1.0, t);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" />;
      })}
      <line x1={cx} y1={cy} x2={tip[0]} y2={tip[1]} stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="7" fill="#111" />
      <text x={6} y={cy + 12} fontSize="11" fill={BLUE} fontWeight="700">0 · best D</text>
      <text x={size - 6} y={cy + 12} fontSize="11" fill={RED} fontWeight="700" textAnchor="end">best R · 100</text>
    </svg>
  );
}

function PosteriorDensity({ w, height = 150 }) {
  const B = 100, step = NX / B;
  const bins = Array.from({ length: B }, (_, b) => {
    let s = 0;
    for (let j = b * step; j < (b + 1) * step; j++) s += w[j];
    return s * B;
  });
  return (
    <div style={{ height }}>
      <Bar data={{
        labels: bins.map((_, b) => b),
        datasets: [{ data: bins, backgroundColor: bins.map((_, b) => probColor((b + 0.5) / B)), barPercentage: 1, categoryPercentage: 1 }],
      }} options={{
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => `${ordinal(+c[0].label)} percentile`, label: (c) => `density ${c.parsed.y.toFixed(2)}` } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (v) => (v % 25 === 0 ? v : null) } }, y: { display: false } },
      }} />
    </div>
  );
}

function SeatHist({ ch, dist, height = 170 }) {
  const c = CH[ch];
  const N = NIGHT[ch].length;
  const act = actualD(ch);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k <= N; k++) if (dist[k] > 0.002) { const t = c.holdD + N - k; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  lo = Math.min(lo, act - 1); hi = Math.max(hi, act + 1);
  const labels = [];
  for (let t = lo; t <= hi; t++) labels.push(t);
  return (
    <div style={{ height }}>
      <Bar data={{
        labels,
        datasets: [{
          data: labels.map((t) => dist[c.holdD + N - t] || 0),
          backgroundColor: labels.map((t) => (t === act ? '#111' : t >= c.majorityD ? 'rgba(36,73,153,0.85)' : c.tieAtD === t ? 'rgba(120,120,120,0.7)' : 'rgba(210,37,50,0.85)')),
          borderRadius: 1, barPercentage: 0.95, categoryPercentage: 1,
        }],
      }} options={{
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (x) => `${x[0].label} D ${c.unit}${+x[0].label === act ? ' (actual)' : ''}`, label: (x) => pct(x.parsed.y) } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { ticks: { maxTicksLimit: 4, callback: (v) => `${Math.round(v * 100)}%` } } },
      }} />
    </div>
  );
}

// ---------- day-by-day percentile of the actual outcome
function DailyChart({ ch }) {
  const rows = RETRO.daily[ch];
  const labels = rows.map((r) => r.d);
  const band = (i, j, color, label) => [
    { label: `${label} lo`, data: rows.map((r) => r.x[i] * 100), borderWidth: 0, pointRadius: 0, fill: false },
    { label, data: rows.map((r) => r.x[j] * 100), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: color },
  ];
  return (
    <div style={{ height: 230 }}>
      <Line data={{
        labels,
        datasets: [
          ...band(0, 4, 'rgba(17,24,39,0.10)', '90%'),
          ...band(1, 3, 'rgba(17,24,39,0.18)', '50%'),
          { label: 'National percentile (median)', data: rows.map((r) => r.x[2] * 100), borderColor: '#111', borderWidth: 2, pointRadius: 0 },
          { label: 'Seat-count percentile', data: rows.map((r) => r.pit * 100), borderColor: 'rgb(217,119,6)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0 },
        ],
      }} options={{
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 2, filter: (l) => !l.text.endsWith(' lo') && !l.text.includes('%') } },
          tooltip: { filter: (i) => !i.dataset.label.endsWith(' lo'), callbacks: { title: (c) => fmtDate(c[0].label), label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(0)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0, callback: function (v) { return fmtDate(this.getLabelForValue(v)); } } },
          y: { min: 0, max: 100, ticks: { stepSize: 25 }, title: { display: true, text: '← D · percentile · R →' } },
        },
      }} />
    </div>
  );
}

// ---------- evidence for the correlation structure
const FAM_COLORS = { 'Beta (app)': '#111', Gaussian: 'rgb(37,99,235)', Logistic: 'rgb(5,150,105)', 'Student-t 3': 'rgb(217,119,6)', 'Student-t 5': 'rgb(220,38,38)', 'Student-t 10': 'rgb(147,51,234)' };
function EvidenceCard() {
  const [scope, setScope] = useState('all');
  const ev = RETRO.evidence[scope];
  const base = ev.ll['Beta (app)'][0];
  const fams = Object.keys(ev.ll);
  const rows = fams.map((f) => {
    const ll = ev.ll[f];
    const k = ll.indexOf(Math.max(...ll));
    return { f, rho: ev.rho[k], ll: ll[k], bf: ll[k] - base };
  }).sort((a, b) => b.ll - a.ll);
  const fitRho = scope === 'all' ? null : RETRO.rho[scope];
  return (
    <Card title="Which correlation did the results back?" right={`${ev.n} results · log P(every result | model)`}>
      <div className="flex gap-1.5 text-xs mb-3 flex-wrap">
        {['all', ...KEYS].map((s) => (
          <button key={s} className={`px-2 py-1 rounded ${scope === s ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'}`} onClick={() => setScope(s)}>
            {s === 'all' ? 'All 506 races' : CH[s].name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3" style={{ height: 260 }}>
          <Line data={{
            labels: ev.rho.map((r) => r.toFixed(2)),
            datasets: fams.map((f) => ({ label: f, data: ev.ll[f].map((v) => v - base), borderColor: FAM_COLORS[f], borderWidth: f === 'Beta (app)' ? 2.5 : 1.5, pointRadius: 0 })),
          }} options={{
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 2 } }, tooltip: { callbacks: { title: (c) => `ρ = ${c[0].label}`, label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}` } } },
            scales: { x: { title: { display: true, text: 'ρ (each family\'s own latent correlation)' }, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { title: { display: true, text: 'log-likelihood vs independent' } } },
          }} />
        </div>
        <div className="lg:col-span-2 text-sm">
          <table className="w-full tabular-nums">
            <thead><tr className="text-xs text-gray-500 text-left"><th className="py-1">Model</th><th>Best ρ</th><th className="text-right">vs indep.</th><th className="text-right">per race</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.f} className="border-t border-gray-100">
                  <td className="py-1 font-semibold" style={{ color: FAM_COLORS[r.f] }}>{r.f}</td>
                  <td>{r.rho.toFixed(2)}</td>
                  <td className="text-right">+{r.bf.toFixed(1)}</td>
                  <td className="text-right">{(-r.ll / ev.n).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">
            Each model keeps every race at its Nov 2 Kalshi price; only the dependence differs. "vs indep." is the log Bayes factor against independent races;
            "per race" is −log P(all results)/n (lower is better).{fitRho !== null && <> Kalshi's own control market implied ρ = {fitRho.toFixed(2)} (beta).</>} One election: treat as evidence, not a verdict.
          </p>
        </div>
      </div>
    </Card>
  );
}

function SurpriseCard() {
  const [n, setN] = useState(15);
  const rows = RETRO.surprises.slice(0, n);
  return (
    <Card title="Surprises after the wave" right="P(result | every other result) · Kalshi-fit ρ, shared x">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="text-xs text-gray-500 text-left"><th className="py-1">Race</th><th>Winner</th><th className="text-right">Nov 2 price</th><th className="text-right">Given the rest</th></tr></thead>
          <tbody>
            {rows.map((s) => {
              const name = s.won ? s.r : s.d;
              return (
                <tr key={`${s.ch}${s.key}`} className="border-t border-gray-100">
                  <td className="py-1 font-semibold whitespace-nowrap">{s.ch === 'gov' ? `${s.key} Gov` : s.ch === 'senate' ? `${s.key} Sen` : s.key}</td>
                  <td className="whitespace-nowrap" style={{ color: s.won ? RED : BLUE }}>{name || (s.won ? 'R' : 'D')}</td>
                  <td className="text-right">{pct(s.won ? s.p : 1 - s.p, 0)}</td>
                  <td className="text-right font-bold">{pct(s.pres, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {n < RETRO.surprises.length && <button className="text-xs text-blue-700 underline mt-2" onClick={() => setN(n + 20)}>more</button>}
      <p className="text-xs text-gray-500 mt-2">Low = the winner beat even the wave-adjusted odds (candidate or local effect, not the national swing).</p>
    </Card>
  );
}

// ---------- replay engine
function useReplay(snap, rhoKey) {
  const rho = RHO_SETS[rhoKey].rho;
  const ps = useMemo(() => Object.fromEntries(KEYS.map((ch) => [ch, RETRO.snaps[ch][snap]])), [snap]);
  const q = useMemo(() => Object.fromEntries(KEYS.map((ch) => [ch, condMatrix(ps[ch], rho[ch])])), [ps, rho]);
  // cumulative log-likelihood per chamber after each call
  const cum = useMemo(() => {
    const cur = Object.fromEntries(KEYS.map((ch) => [ch, new Float64Array(NX)]));
    const out = [Object.fromEntries(KEYS.map((ch) => [ch, cur[ch].slice()]))];
    EVENTS.forEach((e) => {
      const add = logW([[q[e.ch][e.i], !!e.r.won]]);
      for (let j = 0; j < NX; j++) cur[e.ch][j] += add[j];
      out.push(Object.fromEntries(KEYS.map((ch) => [ch, cur[ch]])));
      // keep references cheap: copy only the chamber that changed
      out[out.length - 1][e.ch] = cur[e.ch].slice();
      KEYS.forEach((ch) => { if (ch !== e.ch) out[out.length - 1][ch] = out[out.length - 2][ch]; });
    });
    return out;
  }, [q]);
  return useMemo(() => ({ ps, q, cum, rho }), [ps, q, cum, rho]);
}

function stateAt(rep, step, mode, stride = 1) {
  const L = rep.cum[step];
  const all = new Float64Array(NX);
  KEYS.forEach((ch) => { for (let j = 0; j < NX; j++) all[j] += L[ch][j]; });
  const wAll = normW(all);
  const locks = Object.fromEntries(KEYS.map((ch) => [ch, {}]));
  for (let s = 0; s < step; s++) locks[EVENTS[s].ch][EVENTS[s].i] = !!EVENTS[s].r.won;
  const res = {};
  KEYS.forEach((ch) => {
    const w = mode === 'own' ? normW(L[ch]) : wAll;
    res[ch] = { ...mixChamber(rep.ps[ch], rep.q[ch], locks[ch], w, 0.003, stride), w };
    Object.assign(res[ch], controlProbs(ch, res[ch].dist));
  });
  return { res, wAll, locks };
}

// P(D control) through the night, computed in the background in chunks
function useNightPath(rep, mode) {
  const [path, setPath] = useState(null);
  const [prog, setProg] = useState(0);
  useEffect(() => {
    let alive = true;
    const steps = [];
    const stride = Math.max(1, Math.round(EVENTS.length / 120));
    for (let s = 0; s <= EVENTS.length; s += stride) steps.push(s);
    if (steps[steps.length - 1] !== EVENTS.length) steps.push(EVENTS.length);
    const acc = [];
    let k = 0;
    setPath(null);
    const run = () => {
      if (!alive) return;
      const t0 = performance.now();
      while (k < steps.length && performance.now() - t0 < 25) {
        const s = steps[k++];
        const st = stateAt(rep, s, mode, 4);
        acc.push({ s, t: s === 0 ? EVENTS[0].r.call - 1800 : EVENTS[s - 1].r.call, x: wQuantiles(st.wAll), ...Object.fromEntries(KEYS.map((ch) => [ch, st.res[ch].pD])) });
      }
      if (Math.floor((k / steps.length) * 5) !== Math.floor(((k - 1) / steps.length) * 5)) setProg(k / steps.length);
      if (k < steps.length) setTimeout(run, 0); else setPath(acc.slice());
    };
    setTimeout(run, 30);
    return () => { alive = false; };
  }, [rep, mode]);
  return { path, prog };
}

function NightChart({ path, prog, step }) {
  if (!path) return <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">computing the night… {Math.round(prog * 100)}%</div>;
  const t0 = path[0].t;
  const hr = (t) => (t - t0) / 3600;
  const cols = { senate: BLUE, house: 'rgb(13,148,136)', gov: 'rgb(124,58,237)' };
  const curT = step === 0 ? path[0].t : EVENTS[step - 1].r.call;
  const ds = [
    ...KEYS.map((ch) => ({ label: `${CH[ch].name} · model`, data: path.map((p) => ({ x: hr(p.t), y: p[ch] })), borderColor: cols[ch], borderWidth: 2, pointRadius: 0, stepped: true })),
    ...KEYS.map((ch) => ({ label: `${CH[ch].name} · Kalshi`, data: (KALSHI_NIGHT[ch] || []).filter(([t]) => t >= t0 - 3600).map(([t, p]) => ({ x: hr(t), y: p })), borderColor: cols[ch], borderWidth: 1.5, borderDash: [4, 3], pointRadius: 2, pointBackgroundColor: cols[ch] })),
    { label: 'now', data: [{ x: hr(curT), y: 0 }, { x: hr(curT), y: 1 }], borderColor: '#9ca3af', borderWidth: 1, pointRadius: 0 },
  ];
  return (
    <div style={{ height: 260 }}>
      <Line data={{ datasets: ds }} options={{
        responsive: true, maintainAspectRatio: false, animation: false, parsing: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 2, filter: (l) => l.text !== 'now' } },
          tooltip: { filter: (i) => i.dataset.label !== 'now', callbacks: { title: (c) => fmtT(t0 + c[0].parsed.x * 3600), label: (c) => `${c.dataset.label}: ${pct(c.parsed.y, 1)} D` } },
        },
        scales: {
          x: { type: 'linear', min: -0.5, max: Math.min(hr(path[path.length - 1].t), 14), ticks: { stepSize: 2, callback: (v) => fmtT(t0 + v * 3600).replace(/^\w+ /, '').replace(':00', '').replace(' ET', '') }, grid: { display: false } },
          y: { min: 0, max: 1, ticks: { callback: (v) => `${Math.round(v * 100)}%` }, title: { display: true, text: 'P(D control)' } },
        },
      }} />
    </div>
  );
}

function Replay() {
  const [snap, setSnap] = useState(FINAL);
  const [rhoKey, setRhoKey] = useState('kalshi');
  const [mode, setMode] = useState('all');
  const [step, setStep] = useState(EVENTS.length);
  const [play, setPlay] = useState(false);
  const rep = useReplay(snap, rhoKey);
  const st = useMemo(() => stateAt(rep, step, mode), [rep, step, mode]);
  const { path, prog } = useNightPath(rep, mode);
  const timer = useRef(null);

  useEffect(() => {
    if (!play) return undefined;
    timer.current = setInterval(() => setStep((s) => {
      if (s >= EVENTS.length) { setPlay(false); return s; }
      return Math.min(EVENTS.length, s + Math.max(1, Math.round(EVENTS.length / 240)));
    }), 60);
    return () => clearInterval(timer.current);
  }, [play]);

  const now = step === 0 ? null : EVENTS[step - 1];
  const recent = EVENTS.slice(Math.max(0, step - 6), step).reverse();
  const q = wQuantiles(st.wAll);

  // closest uncalled races across all chambers
  const uncalled = KEYS.flatMap((ch) => NIGHT[ch].map((r, i) => ({ ch, i, r, c: st.res[ch].cond[i], p0: rep.ps[ch][i] })))
    .filter((u) => !(u.i in st.locks[u.ch]) && !u.r.nomkt)
    .sort((a, b) => Math.abs(a.c - 0.5) - Math.abs(b.c - 0.5)).slice(0, 12);

  const seatsFor = (ch) => {
    const c = CH[ch];
    const rs = NIGHT[ch].map((r, i) => ({ pR: st.res[ch].cond[i], label: c.label(r) })).sort((a, b) => a.pR - b.pR);
    return [...Array.from({ length: c.holdD }, () => ({ hold: 'D', label: 'not up' })), ...rs, ...Array.from({ length: c.holdR }, () => ({ hold: 'R', label: 'not up' }))];
  };

  return (
    <Card title="Election night, call by call" right="each Kalshi settlement updates the national percentile, then every other race">
      <div className="flex flex-wrap gap-x-5 gap-y-2 items-center text-sm mb-3">
        <label className="flex items-center gap-1.5">Forecast as of
          <select className="border rounded px-1.5 py-1" value={snap} onChange={(e) => setSnap(e.target.value)}>
            {SNAP_DATES.map((d) => <option key={d} value={d}>{fmtDate(d)}{d === FINAL ? ' (eve)' : ''}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">ρ
          <select className="border rounded px-1.5 py-1" value={rhoKey} onChange={(e) => setRhoKey(e.target.value)}>
            {Object.entries(RHO_SETS).map(([k, v]) => <option key={k} value={k}>{v.label} ({KEYS.map((ch) => v.rho[ch].toFixed(2)).join(' / ')})</option>)}
          </select>
        </label>
        <div className="flex gap-1 text-xs">
          {[['all', 'Calls in every chamber count'], ['own', 'Own chamber only']].map(([k, l]) => (
            <button key={k} className={`px-2 py-1 rounded ${mode === k ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'}`} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm font-bold w-20"
          onClick={() => { if (step >= EVENTS.length) setStep(0); setPlay(!play); }}>{play ? 'Pause' : step >= EVENTS.length ? 'Replay' : 'Play'}</button>
        <input type="range" min="0" max={EVENTS.length} value={step} className="flex-1" onChange={(e) => { setPlay(false); setStep(+e.target.value); }} />
      </div>
      <div className="text-sm mt-1 flex flex-wrap justify-between gap-2">
        <span className="font-semibold">{now ? fmtT(now.r.call) : 'Before polls close'} · {step} of {EVENTS.length} settled</span>
        {now && <span className="text-gray-600">Latest: {CH[now.ch].label(now.r)} → <b style={{ color: now.r.won ? RED : BLUE }}>{now.r.won ? now.r.r || 'R' : now.r.d || 'D'}</b> (was {pct(now.r.won ? rep.ps[now.ch][now.i] : 1 - rep.ps[now.ch][now.i], 0)})</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3 mt-4">
        {KEYS.map((ch) => {
          const r = st.res[ch];
          return (
            <div key={ch} className="rounded-lg border border-gray-100 p-3">
              <div className="flex justify-between items-baseline">
                <div className="font-extrabold">{CH[ch].name}</div>
                <div className="text-sm tabular-nums"><b style={{ color: BLUE }}>{pct(r.pD, 0)} D</b>{CH[ch].tieAtD !== null && <span className="text-gray-500"> · {pct(r.pTie, 0)} tie</span>}</div>
              </div>
              <Hemicycle seats={seatsFor(ch)} pR={r.pR} pTie={r.pTie} majorityD={CH[ch].majorityD} size={340} compact={ch === 'house'} />
              <div className="text-xs text-gray-500 text-center mb-1">avg {r.eD.toFixed(1)} D {CH[ch].unit} · actual <b>{actualD(ch)}</b> (black bar)</div>
              <SeatHist ch={ch} dist={r.dist} />
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-5 mt-5">
        <div className="lg:col-span-2">
          <div className="text-sm font-bold mb-1">National percentile so far</div>
          <PercentileGauge w={st.wAll} />
          <div className="text-center text-sm mt-1"><b className="text-lg">{ordinal(Math.round(q[2] * 100))}</b> percentile · 50% {pctl(q[1])}–{pctl(q[3])} · 90% {pctl(q[0])}–{pctl(q[4])}</div>
          <PosteriorDensity w={st.wAll} height={110} />
          <div className="text-xs text-gray-500 text-center">Starts flat (any percentile equally likely), sharpens with each result.</div>
        </div>
        <div className="lg:col-span-3">
          <div className="text-sm font-bold mb-1">Chance of control through the night: model from calls vs Kalshi</div>
          <NightChart path={path} prog={prog} step={step} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mt-5">
        <div>
          <div className="text-sm font-bold mb-1">Closest uncalled races (forecast → now)</div>
          {uncalled.length === 0 && <div className="text-sm text-gray-500">Everything settled.</div>}
          <div className="flex flex-col gap-1">
            {uncalled.map((u) => (
              <div key={`${u.ch}${u.i}`} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: '64px 1fr 104px' }}>
                <span className="font-semibold">{CH[u.ch].label(u.r)}</span>
                <ProbBar pR={u.c} ghost={u.p0} />
                <span className="text-gray-500 text-right truncate">{u.r.won === null && u.r.pend !== null ? `unsettled · Kalshi ${pct(u.r.pend, 0)} R` : `forecast ${pct(u.p0, 0)} R`}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-1">Yellow tick = forecast price. Unsettled races stay open even when Kalshi is at 97%.</div>
        </div>
        <div>
          <div className="text-sm font-bold mb-1">Last settled</div>
          <div className="flex flex-col gap-1 text-xs">
            {recent.map((e) => {
              const p0 = rep.ps[e.ch][e.i];
              const pw = e.r.won ? p0 : 1 - p0;
              return (
                <div key={`${e.ch}${e.i}`} className="flex justify-between border-b border-gray-50 py-0.5">
                  <span><b>{CH[e.ch].label(e.r)}</b> <span style={{ color: e.r.won ? RED : BLUE }}>{e.r.won ? e.r.r || 'R' : e.r.d || 'D'}</span></span>
                  <span className="tabular-nums text-gray-500">{fmtT(e.r.call).replace(' ET', '')} · <span style={{ color: pw < 0.5 ? '#b45309' : undefined, fontWeight: pw < 0.5 ? 700 : 400 }}>{pct(pw, 0)} pre</span></span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Retro2026() {
  const F = RETRO.final;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="text-center">
          <div className="text-[13px] uppercase tracking-wider text-gray-500 font-semibold">2026 results vs the Nov 2 Kalshi forecast</div>
          <div className="text-3xl sm:text-4xl font-black mt-1">The night landed at the <span style={{ color: BLUE }}>{ordinal(Math.round(F.all.x[2] * 100))} percentile</span></div>
          <div className="text-sm text-gray-600 mt-1">0 = best case for Democrats, 100 = best case for Republicans. 90% range {pctl(F.all.x[0])}–{pctl(F.all.x[4])}, from all {EVENTS.length} settled races.</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          {KEYS.map((ch) => {
            const f = F[ch];
            const aD = actualD(ch), tot = CH[ch].holdD + CH[ch].holdR + NIGHT[ch].length;
            return (
              <div key={ch} className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="font-extrabold">{CH[ch].name}</div>
                <div className="text-2xl font-black tabular-nums"><span style={{ color: BLUE }}>{aD}</span>–<span style={{ color: RED }}>{tot - aD}</span></div>
                <div className="text-xs text-gray-600">forecast avg {(CH[ch].holdD + NIGHT[ch].length - (f.er)).toFixed(1)} D · Kalshi gave D control {pct(RETRO.daily[ch][RETRO.daily[ch].length - 1].mk ?? f.pd, 0)}</div>
                <div className="text-sm mt-1">seat count: <b>{ordinal(Math.round(f.pit * 100))}</b> pctl · national: <b>{ordinal(Math.round(f.x[2] * 100))}</b></div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Seat-count percentile = share of the forecast's seat distribution more Republican than the actual total (ties split).
          National percentile = posterior median of x, the shared swing in the needle model, given every result. Races Kalshi hasn't settled
          (AK and MS Senate, KS and AK governor, ~20 House seats) count with their current price, not as calls.
        </p>
      </Card>

      <Replay />

      <Card title="Where the result sat in each day's forecast" right="actual outcome scored against that day's Kalshi prices">
        <div className="grid gap-5 lg:grid-cols-3">
          {KEYS.map((ch) => (
            <div key={ch}>
              <div className="font-bold text-sm mb-1">{CH[ch].name}</div>
              <DailyChart ch={ch} />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Black line and bands: national percentile of what happened, given that day's prices. Dashed: percentile of the actual seat count.
          A line drifting toward 50 means the market was converging on the result; staying low means it never priced the wave.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3"><EvidenceCard /></div>
        <div className="lg:col-span-2"><SurpriseCard /></div>
      </div>
    </div>
  );
}
