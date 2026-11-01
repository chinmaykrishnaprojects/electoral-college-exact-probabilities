import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import Chamber from './Chamber';
import DATA from './data.json';
import {
  condMatrix, controlR, impliedRho, jointProb, NX, seatDist, subsetAtLeast,
} from './model';
import {
  Card, fmtVol, lineOpts, pct,
} from './ui';

const RACES = DATA.races.map((r) => ({ key: r.st, label: r.st, state: r.st, d: r.d, r: r.r, liq: r.liq }));
const IDX = Object.fromEntries(DATA.races.map((r, i) => [r.st, i]));
const NEED = 50 - DATA.r_hold;
const ONES = new Float64Array(NX).fill(1);

function groupOf(name) {
  if (name.startsWith('Control')) return 'Control market';
  if (name.startsWith('R wins ≥') && name.includes('of 35')) return 'Seat-count ladder';
  if (name.startsWith('FOURSTATE')) return 'TX/AK/IA/OH combo';
  if (name.startsWith('FIVESTATE')) return 'ME/MI/NH/AK/OH combo';
  if (name.startsWith('THREESTATE')) return 'NE/KS/SC combo';
  return 'Sweep parlays';
}
const GROUPS = (() => {
  const g = {};
  DATA.implied.forEach((r) => { if (r.rho !== null) (g[groupOf(r.name)] = g[groupOf(r.name)] || []).push(r); });
  return Object.entries(g).map(([label, rs]) => {
    const v = rs.reduce((s, r) => s + r.vol, 0);
    return { label, rho: rs.reduce((s, r) => s + r.rho * r.vol, 0) / v, vol: v, n: rs.length };
  });
})();

function Analysis({ ps, rho }) {
  const [modelHist, setModelHist] = useState(null);
  const q = useMemo(() => condMatrix(ps, rho), [ps, rho]);
  const dist0 = useMemo(() => seatDist(q, ONES), [q]);

  useEffect(() => {
    setModelHist(null);
    const t = setTimeout(() => {
      const H = DATA.hist;
      const out = H.dates.map(() => null);
      for (let i = 0; i < H.dates.length; i += 2) out[i] = 1 - controlR(DATA.races.map((r) => H.races[r.st][i]), rho, NEED);
      const L = H.dates.length - 1;
      out[L] = 1 - controlR(DATA.races.map((r) => H.races[r.st][L]), rho, NEED);
      setModelHist(out);
    }, 300);
    return () => clearTimeout(t);
  }, [rho]);

  const fair = useMemo(() => DATA.combos.map((c) => {
    let f;
    if (c.kind === 'control') f = dist0.slice(NEED).reduce((a, b) => a + b, 0);
    else if (c.kind === 'atleast') f = dist0.slice(c.k).reduce((a, b) => a + b, 0);
    else if (c.kind === 'subset_atleast') f = subsetAtLeast(q, c.states, c.k, IDX, ONES);
    else f = jointProb(q, c.want, IDX, ONES);
    const buyYes = f - c.ask, buyNo = c.bid - f;
    return { ...c, fair: f, edge: Math.max(buyYes, buyNo), side: buyYes > buyNo ? `Yes @ ${c.ask.toFixed(2)}` : `No @ ${(1 - c.bid).toFixed(2)}` };
  }), [q, dist0]);
  const edges = fair.filter((c) => c.edge > 0.01).sort((a, b) => b.edge * Math.sqrt(b.vol) - a.edge * Math.sqrt(a.vol)).slice(0, 12);

  const H = DATA.hist;
  const timeChart = {
    labels: H.dates,
    datasets: [
      { label: 'Kalshi control market', data: H.market_D, borderColor: '#111', borderWidth: 2, pointRadius: 0 },
      { label: `Race markets, ρ=${rho.toFixed(2)}`, data: modelHist || [], borderColor: '#2563eb', borderWidth: 2, pointRadius: 0, spanGaps: true },
      { label: 'Race markets, independent', data: H.indep_D, borderColor: '#9ca3af', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0 },
    ],
  };
  const rhoChart = {
    labels: H.dates,
    datasets: [{ label: 'ρ reconciling race markets with control market', data: H.implied_rho, borderColor: '#7c3aed', borderWidth: 2, pointRadius: 0 }],
  };

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Control market vs race markets" right="P(D control)">
          <div style={{ height: 260 }}><Line data={timeChart} options={lineOpts('')} /></div>
          <div className="mt-3" style={{ height: 150 }}><Line data={rhoChart} options={lineOpts('', (v) => v.toFixed(1))} /></div>
          <p className="text-xs text-gray-500 mt-2">Gaps = no ρ works. Until mid-September the control market was more R than any correlation of the race markets allows.</p>
        </Card>
        <Card title="What correlation is priced in?" right="ρ that reproduces each market from the race prices">
          <table className="text-sm w-full mb-4">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1">Markets</th><th>ρ</th><th>Contracts</th><th className="text-right">Volume</th></tr></thead>
            <tbody>
              {GROUPS.map((g) => (
                <tr key={g.label} className="border-b border-gray-100"><td className="py-1">{g.label}</td><td className="font-bold">{g.rho.toFixed(2)}</td><td>{g.n}</td><td className="text-right">{fmtVol(g.vol)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm font-bold mb-1">Pairwise, from Kalshi combo tables</div>
          <div className="flex flex-wrap gap-5">
            {DATA.pairs.combos.map((c) => (
              <div key={c.series}>
                <div className="text-xs font-semibold mb-1">{c.states.join('/')} <span className="font-normal text-gray-500">overround {(c.overround * 100).toFixed(0)}%</span></div>
                <table className="text-xs"><tbody>
                  {c.pairs.map((p) => (
                    <tr key={p.a + p.b}><td className="pr-2">{p.a}–{p.b}</td>
                      <td><span className="inline-block px-1 rounded tabular-nums" style={{ background: `rgba(124,58,237,${Math.max(0, p.rho) * 0.8})`, color: p.rho > 0.55 ? '#fff' : '#111' }}>{p.rho.toFixed(2)}</span></td></tr>
                  ))}
                </tbody></table>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Mispricings at this ρ" right="model fair vs Kalshi bid/ask, ranked by edge × √volume">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1 pr-3">Market</th><th className="pr-3">Group</th><th className="pr-3">Bid–Ask</th><th className="pr-3">Fair</th><th className="pr-3">Trade</th><th className="pr-3">Edge</th><th className="text-right">Volume</th></tr></thead>
            <tbody>
              {edges.map((c) => (
                <tr key={c.group + c.name} className="border-b border-gray-100">
                  <td className="py-1 pr-3">{c.name}</td><td className="pr-3 text-gray-500">{c.group}</td>
                  <td className="pr-3 tabular-nums">{c.bid.toFixed(3)}–{c.ask.toFixed(3)}</td><td className="pr-3 font-bold tabular-nums">{c.fair.toFixed(3)}</td>
                  <td className="pr-3">{c.side}</td><td className="pr-3 tabular-nums">{(c.edge * 100).toFixed(1)}¢</td><td className="text-right text-gray-500">{fmtVol(c.vol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">Snapshot prices; most combo books are thin. One global ρ can't fit both the control market and the parlays.</p>
      </Card>

      {Object.keys(DATA.calibration || {}).length > 0 && (
        <Card title="How calibrated were Kalshi's Senate markets?">
          <div className="flex flex-wrap gap-10">
            {Object.entries(DATA.calibration).map(([k, c]) => (
              <div key={k}>
                <div className="font-semibold text-sm">{k} <span className="font-normal text-gray-500">n={c.n} · Brier {c.brier.toFixed(3)}</span></div>
                <table className="text-xs mt-1 tabular-nums">
                  <thead><tr className="text-left text-gray-500"><th className="pr-4">Price</th><th className="pr-4">n</th><th className="pr-4">Avg</th><th>Won</th></tr></thead>
                  <tbody>
                    {c.bins.filter((b) => b.n > 0).map((b) => (
                      <tr key={b.lo}><td className="pr-4">{Math.round(b.lo * 100)}–{Math.round(b.lo * 100) + 10}¢</td><td className="pr-4">{b.n}</td><td className="pr-4">{pct(b.p, 0)}</td><td>{pct(b.hit, 0)}</td></tr>
                    ))}
                  </tbody>
                </table>
                {c.upsets.filter((u) => u.p < 0.5).length > 0 && (
                  <div className="text-xs text-gray-600 mt-1 max-w-xs">Upsets: {c.upsets.filter((u) => u.p < 0.5).map((u) => `${u.name} (${pct(u.p, 0)})`).join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

export default function Senate2026() {
  const [market, setMarket] = useState(() => Object.fromEntries(DATA.races.map((r) => [r.st, r.p])));
  const [controlD, setControlD] = useState(() => 1 - DATA.combos.find((c) => c.kind === 'control').mid);
  const [live, setLive] = useState(`snapshot ${DATA.asof.slice(5, 16)}`);

  useEffect(() => {
    let dead = false;
    fetch('/api/senate').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (dead || !j || !j.races || Object.values(j.races).filter((v) => v !== null).length < 30) return;
      setMarket((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, j.races[k] ?? v])));
      if (j.control_D) setControlD(j.control_D);
      setLive(`live ${new Date(j.asof).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const marketPs = useMemo(() => DATA.races.map((r) => market[r.st]), [market]);
  const rhoMarket = useMemo(() => impliedRho(marketPs, 1 - controlD, NEED), [marketPs, controlD]);
  const H = DATA.hist;
  const history = {
    labels: H.dates,
    datasets: [{ label: 'Kalshi: D control', data: H.market_D, borderColor: 'rgb(36,73,153)', backgroundColor: 'rgba(36,73,153,0.08)', fill: true, borderWidth: 2, pointRadius: 0 }],
  };

  return (
    <Chamber name="the Senate" unit="seats" races={RACES} market={market} holdD={DATA.d_hold} holdR={DATA.r_hold} majorityD={51}
      controlMarket={controlD} rhoMarket={rhoMarket} rhoPresets={GROUPS.filter((g) => g.label !== 'Control market')}
      history={history} map mapHold={{}} needles={18} live={live}>
      {({ ps, rho }) => <Analysis ps={ps} rho={rho} />}
    </Chamber>
  );
}
