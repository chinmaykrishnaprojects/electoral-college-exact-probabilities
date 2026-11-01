import React, { useCallback, useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import Hemicycle from './Hemicycle';
import { chamber } from './model';
import Needle from './Needle';
import TileMap from './TileMap';
import {
  BLUE, Card, fmtVol, lineOpts, pct, Pill, ProbBar, RED, useDebounced,
} from './ui';

/*
  Generic chamber page.
  races: [{key, label, state, d, r, p (Kalshi P(R)), liq}]
  holdD/holdR: seats not up. majorityD: seats D needs for control (or "more governorships").
  tieAtD: D total that means a tie (governors), else null.
  rhoMarket: rho that reproduces the Kalshi control price (precomputed or live).
*/
export default function Chamber({
  name, unit, races, market, holdD, holdR, majorityD, tieAtD = null, controlMarket, rhoMarket, rhoPresets = [],
  history, map, mapHold, needles = 16, bucketChart, live, children,
}) {
  const N = races.length;
  const total = holdD + holdR + N;
  const [user, setUser] = useState({});
  const [locks, setLocks] = useState({});
  const [rhoDraft, setRhoDraft] = useState(null);
  const [filter, setFilter] = useState('competitive');
  const [query, setQuery] = useState('');
  const rhoUse = useDebounced(rhoDraft ?? rhoMarket ?? 0.5, 120);

  const ps = useMemo(() => races.map((r) => user[r.key] ?? market[r.key]), [races, user, market]);
  const { dist, cond } = useMemo(() => chamber(ps, rhoUse, locks), [ps, rhoUse, locks]);

  // dist index = R wins among the N races. D total = holdD + (N - k)
  const dTotal = (k) => holdD + N - k;
  let pD = 0, pTie = 0, expD = 0;
  for (let k = 0; k <= N; k++) {
    const t = dTotal(k);
    if (t >= majorityD) pD += dist[k];
    else if (tieAtD !== null && t === tieAtD) pTie += dist[k];
    expD += dist[k] * t;
  }
  const pR = 1 - pD - pTie;

  const setP = useCallback((key, p) => setUser((u) => ({ ...u, [key]: p })), []);
  const idx = useMemo(() => Object.fromEntries(races.map((r, i) => [r.key, i])), [races]);
  const toggleLock = (key, isR) => setLocks((l) => {
    const i = idx[key];
    const n = { ...l };
    if (n[i] === isR) delete n[i]; else n[i] = isR;
    return n;
  });
  const nLocks = Object.keys(locks).length;

  // hemicycle seats: D holdovers, races by conditional P(R), R holdovers
  const seats = useMemo(() => {
    const rs = races.map((r, i) => ({ pR: cond[i], label: `${r.label}${r.d || r.r ? ` · ${r.d || '?'} v ${r.r || '?'}` : ''}` }))
      .sort((a, b) => a.pR - b.pR);
    return [
      ...Array.from({ length: holdD }, () => ({ hold: 'D', label: 'D/I seat' })),
      ...rs,
      ...Array.from({ length: holdR }, () => ({ hold: 'R', label: 'R seat' })),
    ];
  }, [races, cond, holdD, holdR]);

  // seat histogram (D totals) over the range carrying the mass
  let lo = total, hi = 0;
  for (let k = 0; k <= N; k++) if (dist[k] > 0.0015) { lo = Math.min(lo, dTotal(k)); hi = Math.max(hi, dTotal(k)); }
  const labels = [];
  for (let t = lo; t <= hi; t++) labels.push(t);
  const histData = {
    labels,
    datasets: [{
      label: `P(D ${unit})`,
      data: labels.map((t) => dist[holdD + N - t] || 0),
      backgroundColor: labels.map((t) => (t >= majorityD ? 'rgba(36,73,153,0.85)' : tieAtD !== null && t === tieAtD ? 'rgba(120,120,120,0.7)' : 'rgba(210,37,50,0.85)')),
      borderRadius: 2,
    }],
  };

  const order = useMemo(() => races.map((r, i) => i).sort((a, b) => Math.abs(market[races[a].key] - 0.5) - Math.abs(market[races[b].key] - 0.5)),
    [races, market]);
  const shown = order.filter((i) => {
    const r = races[i];
    if (query && !`${r.label} ${r.d || ''} ${r.r || ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'competitive') return market[r.key] > 0.05 && market[r.key] < 0.95;
    return true;
  });
  const needleRaces = order.slice(0, needles).map((i) => races[i]).filter((r) => market[r.key] > 0.03 && market[r.key] < 0.97)
    .sort((a, b) => market[a.key] - market[b.key]);
  const mapVals = map ? Object.fromEntries(races.map((r, i) => [r.state, cond[i]])) : null;

  const headline = (
    <div className="text-center">
      <div className="text-[13px] uppercase tracking-wider text-gray-500 font-semibold">Chance of winning {name}</div>
      <div className="flex justify-center items-end gap-6 sm:gap-10 mt-1">
        <div>
          <div className="text-4xl sm:text-5xl font-black tabular-nums" style={{ color: BLUE }}>{pct(pD, 0)}</div>
          <div className="text-sm font-semibold" style={{ color: BLUE }}>Democrats</div>
        </div>
        {tieAtD !== null && (
          <div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-gray-500">{pct(pTie, 0)}</div>
            <div className="text-sm font-semibold text-gray-500">Tie</div>
          </div>
        )}
        <div>
          <div className="text-4xl sm:text-5xl font-black tabular-nums" style={{ color: RED }}>{pct(pR, 0)}</div>
          <div className="text-sm font-semibold" style={{ color: RED }}>Republicans</div>
        </div>
      </div>
      <div className="text-sm text-gray-600 mt-2">
        Avg <b style={{ color: BLUE }}>{expD.toFixed(1)}</b> – <b style={{ color: RED }}>{(total - expD).toFixed(1)}</b> {unit}
        <span className="text-gray-400"> · </span>Kalshi {pct(controlMarket, 0)} D
        {live && <span className="text-gray-400"> · {live}</span>}
      </div>
      {nLocks > 0 && (
        <div className="mt-1 text-sm">
          Given {nLocks} locked race{nLocks > 1 ? 's' : ''} · <button className="text-blue-700 underline" onClick={() => setLocks({})}>clear</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          {headline}
          <div className="mt-3"><Hemicycle seats={seats} pR={pR} pTie={pTie} majorityD={majorityD} size={520} /></div>
          <div className="text-center text-xs text-gray-500 -mt-1">Seats sorted D → R, colored by chance · faded = not up · dashed = majority</div>
        </Card>
        <Card title={`${unit[0].toUpperCase()}${unit.slice(1)} distribution`} right={`D ${unit} · blue = D majority`}>
          <div style={{ height: 300 }}>
            <Bar data={histData} options={{
              responsive: true, maintainAspectRatio: false, animation: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => `${c[0].label} D ${unit}`, label: (c) => pct(c.parsed.y) } } },
              scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 14, maxRotation: 0 } }, y: { ticks: { callback: (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` } } },
            }} />
          </div>
          <div className="mt-4">
            <div className="flex justify-between items-baseline text-sm">
              <span className="font-semibold">Correlation ρ = {(rhoDraft ?? rhoUse).toFixed(2)}</span>
              <span className="text-xs text-gray-500">0 independent · 1 one national swing</span>
            </div>
            <input type="range" min="0" max="0.99" step="0.01" value={rhoDraft ?? rhoUse} className="w-full"
              onChange={(e) => setRhoDraft(parseFloat(e.target.value))} />
            <div className="flex flex-wrap gap-1.5 text-xs mt-1">
              {rhoMarket !== null && rhoMarket !== undefined && (
                <button className={`px-2 py-1 rounded ${rhoDraft === null ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'}`} onClick={() => setRhoDraft(null)}>
                  Match Kalshi control ({rhoMarket.toFixed(2)})
                </button>
              )}
              {rhoPresets.map((g) => (
                <button key={g.label} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setRhoDraft(+g.rho.toFixed(2))}>{g.label} ({g.rho.toFixed(2)})</button>
              ))}
              <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setRhoDraft(0)}>Independent</button>
              {Object.keys(user).length > 0 && (
                <button className="px-2 py-1 rounded bg-blue-50 text-blue-700" onClick={() => setUser({})}>Reset races to Kalshi</button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {bucketChart && bucketChart(dist)}

      {(map || needleRaces.length > 0) && (
        <div className={`grid gap-5 ${map ? 'lg:grid-cols-2' : ''}`}>
          {map && (
            <Card title="Map" right="click a state to lock it">
              <TileMap values={mapVals} hold={mapHold}
                onPick={(st) => { const r = races.find((x) => x.state === st); if (r) toggleLock(r.key, cond[idx[r.key]] < 0.5); }} />
            </Card>
          )}
          {needleRaces.length > 0 && (
            <Card title="Closest races" right="drag a needle to set your own odds · dashed tick = Kalshi">
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-4">
                {needleRaces.map((r) => (
                  <Needle key={r.key} race={{ st: r.key, label: r.label, d: r.d, r: r.r }} p={ps[idx[r.key]]} market={market[r.key]} onChange={setP} locked={locks[idx[r.key]]} />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {history && (
        <Card title="Over time" right="Kalshi, daily">
          <div style={{ height: 300 }}><Line data={history} options={lineOpts('')} /></div>
        </Card>
      )}

      <Card title="Races" right="lock a race D or R and every other race updates">
        <div className="flex flex-wrap gap-2 mb-3 items-center text-sm">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="border border-gray-300 rounded px-2 py-1 w-40" />
          {['competitive', 'all'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-2 py-1 rounded ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>
              {f === 'competitive' ? 'Competitive (5–95%)' : `All ${N}`}
            </button>
          ))}
          <span className="text-xs text-gray-500">{shown.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-1.5 pr-2">Race</th><th className="pr-2 text-right">Democrat</th><th className="pr-2" style={{ minWidth: 160 }}>Chance</th>
                <th className="pr-2">Republican</th><th className="pr-2">Kalshi</th><th className="pr-2">Lock</th><th className="text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((i) => {
                const r = races[i];
                const lk = locks[i];
                return (
                  <tr key={r.key} className="border-b border-gray-100">
                    <td className="py-1 pr-2 font-bold whitespace-nowrap">{r.label}</td>
                    <td className="pr-2 text-right whitespace-nowrap" style={{ color: BLUE }}>{r.d || '–'}</td>
                    <td className="pr-2"><ProbBar pR={cond[i]} ghost={market[r.key]} /></td>
                    <td className="pr-2 whitespace-nowrap" style={{ color: RED }}>{r.r || '–'}</td>
                    <td className="pr-2"><Pill p={market[r.key]} /></td>
                    <td className="pr-2 whitespace-nowrap">
                      <button className={`px-1.5 py-0.5 rounded mr-1 text-xs font-bold ${lk === false ? 'text-white' : 'bg-gray-100'}`} style={lk === false ? { background: BLUE } : {}} onClick={() => toggleLock(r.key, false)}>D</button>
                      <button className={`px-1.5 py-0.5 rounded text-xs font-bold ${lk === true ? 'text-white' : 'bg-gray-100'}`} style={lk === true ? { background: RED } : {}} onClick={() => toggleLock(r.key, true)}>R</button>
                    </td>
                    <td className="text-right text-gray-500 tabular-nums">{fmtVol(r.liq)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-500 mt-2">Bar = model given locks; yellow tick = Kalshi price.</div>
      </Card>

      {typeof children === 'function' ? children({ ps, rho: rhoUse }) : children}
    </div>
  );
}
