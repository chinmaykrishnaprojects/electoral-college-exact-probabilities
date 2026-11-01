import {
  BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Title, Tooltip,
} from 'chart.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import DATA from './data.json';
import Needle from './Needle';
import {
  condMatrix, condProbs, controlR, impliedRho, jointProb, NX, probColor, seatDist, subsetAtLeast, weights,
} from './model';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const RACES = DATA.races;
const IDX = Object.fromEntries(RACES.map((r, i) => [r.st, i]));
const NEED = 50 - DATA.r_hold; // R needs 50 seats (VP tiebreak) -> wins NEED of the 35 races
const ONES = new Float64Array(NX).fill(1);
const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '–' : `${(x * 100).toFixed(d)}%`);
const fmtVol = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);

function Pill({ p }) {
  const lean = p >= 0.5 ? 'R' : 'D';
  const v = p >= 0.5 ? p : 1 - p;
  return (
    <span className="inline-block rounded px-2 py-0.5 text-sm font-medium whitespace-nowrap"
      style={{ background: probColor(p), color: p > 0.3 && p < 0.7 ? '#111' : '#fff' }}>
      {(v * 100).toFixed(1)}% {lean}
    </span>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xl font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function Senate2026() {
  const [market, setMarket] = useState(() => Object.fromEntries(RACES.map((r) => [r.st, r.p])));
  const [controlD, setControlD] = useState(() => 1 - DATA.combos.find((c) => c.kind === 'control').mid);
  const [asof, setAsof] = useState(`Kalshi snapshot ${DATA.asof}`);
  const [user, setUser] = useState({});
  const [locks, setLocks] = useState({});
  const [rho, setRho] = useState(null);
  const [histSel, setHistSel] = useState(['TX', 'ME', 'AK', 'OH', 'IA', 'KS', 'MI', 'NE']);
  const [modelHist, setModelHist] = useState(null);

  // live prices (Vercel function); silently keep the snapshot if unavailable
  useEffect(() => {
    let dead = false;
    fetch('/api/senate').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (dead || !j || !j.races) return;
      const ok = Object.values(j.races).filter((v) => v !== null).length;
      if (ok < 30) return;
      setMarket((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, j.races[k] ?? v])));
      if (j.control_D) setControlD(j.control_D);
      setAsof(`Kalshi live ${new Date(j.asof).toLocaleString()}`);
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const marketPs = useMemo(() => RACES.map((r) => market[r.st]), [market]);
  const rhoMarket = useMemo(() => impliedRho(marketPs, 1 - controlD, NEED), [marketPs, controlD]);
  const rhoUse = rho ?? rhoMarket ?? 0.58;
  const ps = useMemo(() => RACES.map((r) => user[r.st] ?? market[r.st]), [user, market]);

  const q = useMemo(() => condMatrix(ps, rhoUse), [ps, rhoUse]);
  const w = useMemo(() => weights(q, locks), [q, locks]);
  const dist = useMemo(() => seatDist(q, w, locks), [q, w, locks]);
  const dist0 = useMemo(() => (Object.keys(locks).length ? seatDist(q, ONES) : dist), [q, dist, locks]);
  const cond = useMemo(() => condProbs(q, w), [q, w]);

  const pR = dist.slice(NEED).reduce((a, b) => a + b, 0);
  const expR = DATA.r_hold + dist.reduce((s, v, k) => s + v * k, 0);
  const expD = 100 - expR;
  const pInd = useMemo(() => controlR(ps, 0, NEED), [ps]);

  const setP = useCallback((st, p) => setUser((u) => ({ ...u, [st]: p })), []);
  const toggleLock = (st, isR) => setLocks((l) => {
    const i = IDX[st];
    const n = { ...l };
    if (n[i] === isR) delete n[i]; else n[i] = isR;
    return n;
  });

  // model control over time at the current rho (computed after the slider settles)
  useEffect(() => {
    setModelHist(null);
    const t = setTimeout(() => {
      const H = DATA.hist;
      const step = 2;
      const out = H.dates.map(() => null);
      for (let i = 0; i < H.dates.length; i += step) {
        const p = RACES.map((r) => H.races[r.st][i]);
        out[i] = 1 - controlR(p, rhoUse, NEED);
      }
      out[H.dates.length - 1] = 1 - controlR(RACES.map((r) => H.races[r.st][H.dates.length - 1]), rhoUse, NEED);
      setModelHist(out);
    }, 350);
    return () => clearTimeout(t);
  }, [rhoUse]);

  // fair value of every combo / ladder market under the current model (unconditioned, user p's)
  const fair = useMemo(() => DATA.combos.map((c) => {
    let f;
    if (c.kind === 'control') f = dist0.slice(NEED).reduce((a, b) => a + b, 0);
    else if (c.kind === 'atleast') f = dist0.slice(c.k).reduce((a, b) => a + b, 0);
    else if (c.kind === 'subset_atleast') f = subsetAtLeast(q, c.states, c.k, IDX, ONES);
    else f = jointProb(q, c.want, IDX, ONES);
    const buyYes = f - c.ask, buyNo = c.bid - f;
    const edge = Math.max(buyYes, buyNo);
    return { ...c, fair: f, edge, side: buyYes > buyNo ? `Yes @ ${c.ask.toFixed(2)}` : `No @ ${(1 - c.bid).toFixed(2)}` };
  }), [q, dist0]);

  const competitive = RACES.filter((r) => market[r.st] > 0.03 && market[r.st] < 0.97)
    .sort((a, b) => market[a.st] - market[b.st]);
  const tableRaces = [...RACES].sort((a, b) => Math.abs(market[a.st] - 0.5) - Math.abs(market[b.st] - 0.5));

  const seatLabels = [];
  for (let s = 42; s <= 60; s++) seatLabels.push(s);
  const seatChart = {
    labels: seatLabels,
    datasets: [{
      label: 'P(R seats)',
      data: seatLabels.map((s) => dist[s - DATA.r_hold] || 0),
      backgroundColor: seatLabels.map((s) => (s >= 50 ? 'rgba(210,37,50,0.75)' : 'rgba(36,73,153,0.75)')),
    }],
  };

  const H = DATA.hist;
  const timeChart = {
    labels: H.dates,
    datasets: [
      { label: 'Kalshi control market', data: H.market_D, borderColor: '#111', borderWidth: 2, pointRadius: 0 },
      { label: `Race markets, ρ=${rhoUse.toFixed(2)}`, data: modelHist || [], borderColor: '#2563eb', borderWidth: 2, pointRadius: 0, spanGaps: true },
      { label: 'Race markets, independent', data: H.indep_D, borderColor: '#9ca3af', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0 },
    ],
  };
  const rhoChart = {
    labels: H.dates,
    datasets: [{ label: 'ρ that reconciles races with control market', data: H.implied_rho, borderColor: '#7c3aed', borderWidth: 2, pointRadius: 0, spanGaps: false }],
  };
  const HIST_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#4b5563', '#65a30d', '#9333ea'];
  const raceChart = {
    labels: H.dates,
    datasets: histSel.map((st, i) => ({
      label: st, data: H.races[st].map((v) => 1 - v), borderColor: HIST_COLORS[i % HIST_COLORS.length], borderWidth: 1.8, pointRadius: 0,
    })),
  };
  const lineOpts = (yTitle, fmt = (v) => `${Math.round(v * 100)}%`, yMin = 0, yMax = 1) => ({
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y === null ? '–' : fmt(c.parsed.y)}` } } },
    scales: {
      x: { ticks: { maxTicksLimit: 10 } },
      y: { min: yMin, max: yMax, title: { display: true, text: yTitle }, ticks: { callback: fmt } },
    },
  });

  const edges = fair.filter((c) => c.edge > 0.01).sort((a, b) => b.edge * Math.sqrt(b.vol) - a.edge * Math.sqrt(a.vol)).slice(0, 15);
  const groups = {};
  DATA.implied.forEach((r) => {
    const g = r.name.startsWith('Control') ? 'Control market' : r.name.startsWith('R wins ≥') && r.name.includes('of 35') ? 'Seat-count ladder'
      : r.name.startsWith('FOURSTATE') ? 'TX/AK/IA/OH combo' : r.name.startsWith('FIVESTATE') ? 'ME/MI/NH/AK/OH combo'
        : r.name.startsWith('THREESTATE') ? 'NE/KS/SC combo' : 'Sweep parlays';
    if (r.rho === null) return;
    (groups[g] = groups[g] || []).push(r);
  });
  const groupRows = Object.entries(groups).map(([g, rs]) => {
    const v = rs.reduce((s, r) => s + r.vol, 0);
    return { g, rho: rs.reduce((s, r) => s + r.rho * r.vol, 0) / v, vol: v, n: rs.length };
  });

  const nLocks = Object.keys(locks).length;

  return (
    <div className="w-full flex flex-col items-center px-3 sm:px-6 pb-12" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="text-center my-6">
        <div className="text-sm text-gray-500 mb-1">{asof}</div>
        <h1 className="text-3xl sm:text-4xl font-bold">
          Senate control: <span className="text-blue-600">{pct(1 - pR)} D</span>
          <span className="text-gray-400"> – </span>
          <span className="text-red-600">{pct(pR)} R</span>
        </h1>
        <div className="text-lg mt-2">
          Avg seats <span className="text-blue-600 font-semibold">{expD.toFixed(1)} D/I</span> – <span className="text-red-600 font-semibold">{expR.toFixed(1)} R</span>
          <span className="text-gray-500"> · Kalshi control {pct(controlD)} D · independent races {pct(1 - pInd)} D</span>
        </div>
        {nLocks > 0 && (
          <div className="mt-2 text-sm">
            Conditional on {nLocks} locked race{nLocks > 1 ? 's' : ''}.{' '}
            <button className="text-blue-700 underline" onClick={() => setLocks({})}>clear</button>
          </div>
        )}
      </div>

      <Section title="Correlation" right={<span className="text-sm text-gray-500">0 = races independent · 1 = one national swing</span>}>
        <input type="range" min="0" max="0.99" step="0.01" value={rhoUse} onChange={(e) => setRho(parseFloat(e.target.value))} className="w-full" />
        <div className="flex flex-wrap gap-2 mt-2 items-center text-sm">
          <span className="font-semibold mr-2">ρ = {rhoUse.toFixed(2)}</span>
          {rhoMarket !== null && (
            <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setRho(null)}>Match Kalshi control ({rhoMarket.toFixed(2)})</button>
          )}
          {groupRows.filter((g) => g.g !== 'Control market').map((g) => (
            <button key={g.g} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setRho(+g.rho.toFixed(2))}>{g.g} ({g.rho.toFixed(2)})</button>
          ))}
          <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setRho(0)}>Independent</button>
          {Object.keys(user).length > 0 && (
            <button className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => setUser({})}>Reset all races to Kalshi</button>
          )}
        </div>
      </Section>

      <Section title="Competitive races" right={<span className="text-sm text-gray-500">drag to override · dashed tick = Kalshi</span>}>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-5">
          {competitive.map((r) => (
            <Needle key={r.st} race={r} p={ps[IDX[r.st]]} market={market[r.st]} onChange={setP} locked={locks[IDX[r.st]]} />
          ))}
        </div>
      </Section>

      <Section title="Republican seats after the election">
        <div style={{ height: 300 }}>
          <Bar data={seatChart} options={{
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => pct(c.parsed.y) } } },
            scales: { x: { title: { display: true, text: 'R seats (50+ = R control with VP)' } }, y: { ticks: { callback: (v) => `${Math.round(v * 100)}%` } } },
          }} />
        </div>
      </Section>

      <Section title="Over time" right={<span className="text-sm text-gray-500">P(D control)</span>}>
        <div style={{ height: 320 }}><Line data={timeChart} options={lineOpts('P(D control)')} /></div>
        <div className="mt-4" style={{ height: 200 }}><Line data={rhoChart} options={lineOpts('implied ρ', (v) => v.toFixed(1))} /></div>
        <p className="text-sm text-gray-600 mt-2">
          Gaps = no ρ works: until mid-September the control market sat below what any correlation of the race markets allows.
        </p>
      </Section>

      <Section title="Race odds over time" right={<span className="text-sm text-gray-500">P(not R)</span>}>
        <div className="flex flex-wrap gap-1 mb-3">
          {competitive.map((r) => (
            <button key={r.st} onClick={() => setHistSel((s) => (s.includes(r.st) ? s.filter((x) => x !== r.st) : [...s, r.st]))}
              className={`px-2 py-0.5 rounded text-sm ${histSel.includes(r.st) ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}>{r.st}</button>
          ))}
        </div>
        <div style={{ height: 320 }}><Line data={raceChart} options={lineOpts('P(not R)')} /></div>
      </Section>

      <Section title="Races" right={<span className="text-sm text-gray-500">lock a race to see everyone else update</span>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 pr-3">State</th><th className="pr-3">D / I</th><th className="pr-3">R</th>
                <th className="pr-3">Kalshi</th><th className="pr-3">Yours</th><th className="pr-3">Conditional</th>
                <th className="pr-3">Lock</th><th className="pr-3 text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {tableRaces.map((r) => {
                const i = IDX[r.st];
                const lk = locks[i];
                return (
                  <tr key={r.st} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-semibold">{r.st}{r.held === 'D' ? <span className="text-xs text-gray-400"> (D held)</span> : null}</td>
                    <td className="pr-3">{r.d}</td><td className="pr-3">{r.r}</td>
                    <td className="pr-3"><Pill p={market[r.st]} /></td>
                    <td className="pr-3">{user[r.st] !== undefined ? <Pill p={user[r.st]} /> : <span className="text-gray-400">–</span>}</td>
                    <td className="pr-3">{lk !== undefined ? <Pill p={lk ? 1 : 0} /> : <Pill p={cond[i]} />}</td>
                    <td className="pr-3 whitespace-nowrap">
                      <button className={`px-2 py-0.5 rounded mr-1 ${lk === false ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => toggleLock(r.st, false)}>D</button>
                      <button className={`px-2 py-0.5 rounded ${lk === true ? 'bg-red-600 text-white' : 'bg-gray-100'}`} onClick={() => toggleLock(r.st, true)}>R</button>
                    </td>
                    <td className="pr-3 text-right text-gray-500">{fmtVol(r.liq)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What correlation is the market pricing?">
        <div className="overflow-x-auto">
        <table className="text-sm mb-2">
          <thead><tr className="text-left border-b border-gray-300"><th className="pr-4 py-1">Markets</th><th className="pr-4">Implied ρ</th><th className="pr-4">Contracts</th><th>Volume</th></tr></thead>
          <tbody>
            {groupRows.map((g) => (
              <tr key={g.g} className="border-b border-gray-100"><td className="pr-4 py-1">{g.g}</td><td className="pr-4 font-semibold">{g.rho.toFixed(2)}</td><td className="pr-4">{g.n}</td><td>{fmtVol(g.vol)}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="text-sm text-gray-600">Volume-weighted ρ that reproduces each market's price from the single-race markets, at the snapshot. Parlays price more correlation than the control market.</p>

        <h3 className="font-bold mt-5 mb-2">Pairwise, from Kalshi's own combo tables</h3>
        <div className="flex flex-wrap gap-6">
          {DATA.pairs.combos.map((c) => (
            <div key={c.series}>
              <div className="text-sm font-semibold mb-1">{c.states.join(' / ')} <span className="font-normal text-gray-500">(overround {(c.overround * 100).toFixed(0)}%)</span></div>
              <table className="text-sm">
                <tbody>
                  {c.pairs.map((p) => (
                    <tr key={p.a + p.b}><td className="pr-3">{p.a}–{p.b}</td>
                      <td><span className="inline-block px-1.5 rounded" style={{ background: `rgba(124,58,237,${Math.max(0, p.rho) * 0.8})`, color: p.rho > 0.55 ? '#fff' : '#111' }}>{p.rho.toFixed(2)}</span></td></tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-gray-500 mt-1">
                {Object.entries(c.marg).filter(([, m]) => Math.abs(m.combo - m.single) > 0.03).map(([st, m]) => `${st} D: combo ${pct(m.combo, 0)} vs race ${pct(m.single, 0)}`).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Mispricings at this ρ" right={<span className="text-sm text-gray-500">model fair vs Kalshi bid/ask, ranked by edge × √volume</span>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left border-b border-gray-300"><th className="py-1 pr-3">Market</th><th className="pr-3">Group</th><th className="pr-3">Bid–Ask</th><th className="pr-3">Fair</th><th className="pr-3">Trade</th><th className="pr-3">Edge</th><th className="text-right">Volume</th></tr></thead>
            <tbody>
              {edges.map((c) => (
                <tr key={c.group + c.name} className="border-b border-gray-100">
                  <td className="py-1 pr-3">{c.name}</td><td className="pr-3 text-gray-500">{c.group}</td>
                  <td className="pr-3">{c.bid.toFixed(3)}–{c.ask.toFixed(3)}</td><td className="pr-3 font-semibold">{c.fair.toFixed(3)}</td>
                  <td className="pr-3">{c.side}</td><td className="pr-3">{(c.edge * 100).toFixed(1)}¢</td><td className="text-right text-gray-500">{fmtVol(c.vol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-600 mt-2">Prices from the snapshot; most combo books are thin. A single global ρ can't fit both the control market and the parlays, so the edge depends on the ρ you pick.</p>
      </Section>

      {Object.keys(DATA.calibration || {}).length > 0 && (
        <Section title="Calibration of settled Kalshi Senate markets">
          <div className="flex flex-wrap gap-8 overflow-x-auto">
            {Object.entries(DATA.calibration).map(([k, c]) => (
              <div key={k}>
                <div className="font-semibold">{k} <span className="font-normal text-gray-500">n={c.n} · Brier {c.brier.toFixed(3)}</span></div>
                <table className="text-sm mt-1">
                  <thead><tr className="text-left"><th className="pr-4">Price</th><th className="pr-4">n</th><th className="pr-4">Avg price</th><th>Hit rate</th></tr></thead>
                  <tbody>
                    {c.bins.filter((b) => b.n > 0).map((b) => (
                      <tr key={b.lo}><td className="pr-4">{Math.round(b.lo * 100)}–{Math.round(b.lo * 100) + 10}¢</td><td className="pr-4">{b.n}</td><td className="pr-4">{pct(b.p, 0)}</td><td>{pct(b.hit, 0)}</td></tr>
                    ))}
                  </tbody>
                </table>
                {c.upsets.filter((u) => u.p < 0.5).length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">Upsets: {c.upsets.filter((u) => u.p < 0.5).map((u) => `${u.name} (${pct(u.p, 0)})`).join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-gray-500 text-center max-w-3xl">
        Same Beta-copula as the 2024 tab: a national percentile x, each race's P(R | x) = BetaCDF(x; n(1−p), np), n = ρ/(1−ρ).
        Seat distribution is exact (convolution per scenario, {NX} scenarios). R holds {DATA.r_hold} seats not up, D/I {DATA.d_hold}; Vance breaks ties.
        Independents (Osborn, Bodnar, Achilles, Bengs) count as not-R. Race probabilities are Kalshi mids normalized across candidates.
      </p>
    </div>
  );
}
