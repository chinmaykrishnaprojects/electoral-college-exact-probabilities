import React, { useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import DATA from './data.json';
import Hemicycle from './Hemicycle';
import { perX, XG, NX } from './model';
import {
  align, BLUE, Card, lineOpts, pct, RED,
} from './ui';

const RHO = DATA.nat.fit_all.rho;
const S_PS = DATA.races.map((r) => r.p);
const H_PS = DATA.house.races.map((r) => r.p);
const G_PS = DATA.gov.races.map((r) => r.p);
const BAL = Object.fromEntries(DATA.nat.balance.map((m) => [m.sub, m.mid]));
const BAL_T = Object.values(BAL).reduce((a, b) => a + b, 0);
const ctrlS = 1 - DATA.combos.find((c) => c.kind === 'control').mid;
const ctrlH = DATA.house.control.find((m) => m.sub.startsWith('Dem')).mid;
const GW = Object.fromEntries(DATA.gov.wins.map((m) => [m.sub, m.mid]));

// popular-vote ladder: S(m) = P(D margin >= m). Scenario x (high = good for R) <-> margin with S(m) = x.
const LAD = DATA.nat.popvote.slice().sort((a, b) => a[0] - b[0]);
// smooth it: fit D margin ~ Normal(mu, sigma) to the ladder, then margin(x) = mu + sigma * PhiInv(1 - x)
function erf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return z >= 0 ? y : -y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function PhiInv(p) {
  let lo = -8, hi = 8;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const [MU, SIG] = (() => {
  let best = [10, 3, Infinity];
  for (let mu = 4; mu <= 16; mu += 0.05) {
    for (let sg = 1; sg <= 8; sg += 0.05) {
      let e = 0;
      LAD.forEach(([k, s]) => { const d = 1 - Phi((k - mu) / sg) - s; e += d * d; });
      if (e < best[2]) best = [mu, sg, e];
    }
  }
  return best;
})();
const marginAt = (x) => MU + SIG * PhiInv(1 - x);

function seatsFor(ps, holdD, holdR) {
  return [...Array.from({ length: holdD }, () => ({ hold: 'D' })), ...ps.slice().sort((a, b) => a - b).map((p) => ({ pR: p })), ...Array.from({ length: holdR }, () => ({ hold: 'R' }))];
}

export default function Overview({ go }) {
  const [curves, setCurves] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const [sR] = perX(S_PS, RHO.S, [50 - DATA.r_hold]);           // P(R Senate | x)
      const [hR] = perX(H_PS, RHO.H, [218]);                        // P(R House | x)
      const [g17, g18] = perX(G_PS, RHO.G, [17, 18]);               // tie at 17 R wins, R more at 18+
      setCurves({ sR, hR, g17, g18 });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  let cells = null, envData = null, cond = null;
  if (curves) {
    const { sR, hR, g17 } = curves;
    const m = (f) => { let s = 0; for (let j = 0; j < NX; j++) s += f(j); return s / NX; };
    cells = {
      'Democrats sweep': m((j) => (1 - sR[j]) * (1 - hR[j])),
      'D-House, R-Senate': m((j) => sR[j] * (1 - hR[j])),
      'R-House, D-Senate': m((j) => (1 - sR[j]) * hR[j]),
      'Republicans sweep': m((j) => sR[j] * hR[j]),
    };
    const pDH = m((j) => 1 - hR[j]);
    cond = { sGivenDH: cells['Democrats sweep'] / pDH, sGivenRH: cells['R-House, D-Senate'] / (1 - pDH) };
    const pts = [];
    for (let j = 0; j < NX; j += 6) {
      const mg = marginAt(XG[j]);
      if (mg >= -2 && mg <= 18) pts.push({ mg, s: 1 - sR[j], h: 1 - hR[j], g: 1 - g17[j] });
    }
    pts.sort((a, b) => a.mg - b.mg);
    envData = {
      datasets: [
        { label: 'Senate', data: pts.map((p) => ({ x: p.mg, y: p.s })), borderColor: BLUE, borderWidth: 2.5, pointRadius: 0 },
        { label: 'House', data: pts.map((p) => ({ x: p.mg, y: p.h })), borderColor: '#0891b2', borderWidth: 2.5, pointRadius: 0 },
        { label: 'More governorships', data: pts.map((p) => ({ x: p.mg, y: p.g })), borderColor: '#7c3aed', borderWidth: 2.5, pointRadius: 0 },
      ],
    };
  }
  const mkt = {
    'Democrats sweep': BAL['Democrats sweep'] / BAL_T, 'D-House, R-Senate': BAL['D-House, R-Senate'] / BAL_T,
    'R-House, D-Senate': BAL['R-House, D-Senate'] / BAL_T, 'Republicans sweep': BAL['Republicans sweep'] / BAL_T,
  };
  const mktCond = { sGivenDH: mkt['Democrats sweep'] / (mkt['Democrats sweep'] + mkt['D-House, R-Senate']), sGivenRH: mkt['R-House, D-Senate'] / (mkt['R-House, D-Senate'] + mkt['Republicans sweep']) };

  const ladBars = (() => {
    const s = [[-99, 1], ...LAD];
    const labels = [], vals = [];
    for (let i = 0; i < s.length; i++) {
      const lo = s[i][0], hi = i + 1 < s.length ? s[i + 1][0] : null;
      const p = s[i][1] - (i + 1 < s.length ? s[i + 1][1] : 0);
      labels.push(hi === null ? `D+${lo}+` : lo === -99 ? `<D+${hi}` : `D+${lo}–${hi}`);
      vals.push(Math.max(0, p));
    }
    return { labels, datasets: [{ label: 'Kalshi', data: vals, backgroundColor: 'rgba(36,73,153,0.75)', borderRadius: 2 }] };
  })();

  const h2 = DATA.hist2;
  const overTime = align({
    Senate: DATA.hist.dates.map((d, i) => [d, DATA.hist.market_D[i]]),
    House: h2['CONTROLH|Democratic Party'],
    'More governorships': h2['KXGOVWINS|Democratic Party'],
    'Both chambers': h2['KXBALANCEPOWERCOMBO|Democrats sweep'],
  }, {
    Senate: { borderColor: BLUE }, House: { borderColor: '#0891b2' }, 'More governorships': { borderColor: '#7c3aed' },
    'Both chambers': { borderColor: '#111', borderDash: [5, 4], borderWidth: 1.5 },
  });

  const cardsTop = [
    { tab: 'senate-2026', title: 'Senate', pD: ctrlS, seats: seatsFor(S_PS, DATA.d_hold, DATA.r_hold), maj: 51, sub: '35 races · D needs 51 (Vance breaks ties)' },
    { tab: 'house-2026', title: 'House', pD: ctrlH, seats: seatsFor(H_PS, 0, 0), maj: 218, sub: '435 races · 218 for a majority' },
    { tab: 'governors-2026', title: 'Governors', pD: GW['Democratic Party'], tie: GW.Tie, seats: seatsFor(G_PS, DATA.gov.hold.D.length, DATA.gov.hold.R.length), maj: 26, sub: '36 races · more governorships' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-3">
        {cardsTop.map((c) => (
          <button key={c.tab} onClick={() => go(c.tab)} className="text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-gray-400 transition">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-extrabold">{c.title}</div>
              <div className="text-xs text-gray-500">Kalshi</div>
            </div>
            <div className="flex justify-between mt-1 font-black text-3xl tabular-nums">
              <span style={{ color: BLUE }}>{pct(c.pD, 0)} D</span>
              {c.tie !== undefined && <span className="text-gray-400 text-xl self-end">{pct(c.tie, 0)} tie</span>}
              <span style={{ color: RED }}>{pct(1 - c.pD - (c.tie || 0), 0)} R</span>
            </div>
            <Hemicycle seats={c.seats} pR={1 - c.pD - (c.tie || 0)} pTie={c.tie || 0} majorityD={c.maj} size={360} compact />
            <div className="text-xs text-gray-500 text-center">{c.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Balance of power" right="Kalshi combo ($89M) vs one shared national swing">
          <div className="grid grid-cols-2 gap-2">
            {['Democrats sweep', 'D-House, R-Senate', 'R-House, D-Senate', 'Republicans sweep'].map((k) => {
              const bg = k === 'Democrats sweep' ? BLUE : k === 'Republicans sweep' ? RED : '#6b7280';
              return (
                <div key={k} className="rounded-lg p-3 text-white" style={{ background: bg, opacity: 0.35 + 0.65 * Math.min(1, mkt[k] * 1.6 + 0.2) }}>
                  <div className="text-xs font-semibold uppercase tracking-wide">{k}</div>
                  <div className="text-3xl font-black tabular-nums">{pct(mkt[k], 0)}</div>
                  <div className="text-xs">model {cells ? pct(cells[k], 0) : '…'}</div>
                </div>
              );
            })}
          </div>
          <div className="text-sm mt-3 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
            <span className="text-gray-600">P(D Senate | D House)</span><span><b>{pct(mktCond.sGivenDH, 0)}</b> Kalshi · {cond ? pct(cond.sGivenDH, 0) : '…'} model</span>
            <span className="text-gray-600">P(D Senate | R House)</span><span><b>{pct(mktCond.sGivenRH, 0)}</b> Kalshi · {cond ? pct(cond.sGivenRH, 0) : '…'} model</span>
            <span className="text-gray-600">Senate–House correlation</span><span><b>{DATA.nat.fit_all.balance.tetra.toFixed(2)}</b> (tetrachoric, from the combo)</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Model: one national percentile shared by all 506 races; each chamber's ρ set from its own control market
            (Senate {RHO.S.toFixed(2)}, House {RHO.H.toFixed(2)}, governors {RHO.G.toFixed(2)}). The combo was not used to fit it.
          </p>
        </Card>

        <Card title="It all runs through the national vote" right="P(D wins) given the national House margin">
          <div style={{ height: 260 }}>
            {envData ? (
              <Line data={envData} options={{
                ...lineOpts(''),
                scales: {
                  x: { type: 'linear', min: -2, max: 18, title: { display: true, text: 'D margin in the national House vote (pts)' }, ticks: { callback: (v) => (v > 0 ? `D+${v}` : v < 0 ? `R+${-v}` : 'Even') } },
                  y: { min: 0, max: 1, ticks: { callback: (v) => `${Math.round(v * 100)}%` } },
                },
                plugins: { ...lineOpts('').plugins, tooltip: { callbacks: { title: (c) => `D+${c[0].parsed.x.toFixed(1)}`, label: (c) => `${c.dataset.label}: ${pct(c.parsed.y, 0)}` } } },
              }} />
            ) : <div className="h-full flex items-center justify-center text-gray-400">computing…</div>}
          </div>
          <div className="mt-3" style={{ height: 120 }}>
            <Bar data={ladBars} options={{
              responsive: true, maintainAspectRatio: false, animation: false,
              plugins: { legend: { display: false }, title: { display: true, text: 'Kalshi: national House popular-vote margin', font: { size: 11 } }, tooltip: { callbacks: { label: (c) => pct(c.parsed.y, 0) } } },
              scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: false } }, y: { display: false } },
            }} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Over time" right="Kalshi, P(D)">
          <div style={{ height: 300 }}><Line data={overTime} options={lineOpts('')} /></div>
        </Card>
        <Card title="Same-state Senate and governor races" right="tetrachoric ρ from Kalshi governor–Senate combos">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1">State</th><th>Gov D</th><th>Senate D</th><th>ρ</th></tr></thead>
            <tbody>
              {DATA.pairs.govsen.filter((g) => g.govD > 0.08 && g.govD < 0.95).sort((a, b) => b.rho - a.rho).map((g) => (
                <tr key={g.st} className="border-b border-gray-100">
                  <td className="py-1 font-bold">{g.st}</td><td>{pct(g.govD, 0)}</td><td>{pct(g.senD_single, 0)}</td>
                  <td><span className="inline-block px-1.5 rounded" style={{ background: `rgba(124,58,237,${Math.max(0, g.rho) * 0.8})`, color: g.rho > 0.55 ? '#fff' : '#111' }}>{g.rho.toFixed(2)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">Ticket-splitting is priced unevenly: Ohio and Alaska move as a unit, Iowa and Nebraska much less.</p>
        </Card>
      </div>
    </div>
  );
}
