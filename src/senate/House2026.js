import React from 'react';
import { Bar } from 'react-chartjs-2';
import Chamber from './Chamber';
import DATA from './data.json';
import { align, Card, pct } from './ui';

const H = DATA.house;
const RACES = H.races.map((r) => ({ key: r.id, label: r.id, state: r.id.split('-')[0], d: r.d, r: r.r, liq: r.liq }));
const MARKET = Object.fromEntries(H.races.map((r) => [r.id, r.p]));
const CTRL_D = H.control.find((m) => m.sub.startsWith('Dem')).mid;

function bucketRange(s) {
  if (s.startsWith('Below')) return [0, +s.split(' ')[1] - 1];
  if (s.startsWith('Above')) return [+s.split(' ')[1] + 1, 435];
  return s.split('-').map(Number);
}

function Buckets(dist) {
  const tot = H.buckets.reduce((s, b) => s + b.mid, 0);
  const model = H.buckets.map((b) => {
    const [lo, hi] = bucketRange(b.sub);
    let s = 0;
    for (let d = lo; d <= hi; d++) s += dist[435 - d] || 0;
    return s;
  });
  const data = {
    labels: H.buckets.map((b) => b.sub),
    datasets: [
      { label: 'Kalshi seat-count market', data: H.buckets.map((b) => b.mid / tot), backgroundColor: 'rgba(17,24,39,0.8)', borderRadius: 2 },
      { label: 'Model from district markets', data: model, backgroundColor: 'rgba(36,73,153,0.6)', borderRadius: 2 },
    ],
  };
  const sh = H.shift;
  return (
    <Card title="Two House markets disagree" right="Democratic seats">
      <div style={{ height: 260 }}>
        <Bar data={data} options={{
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${pct(c.parsed.y)}` } } },
          scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } }, y: { ticks: { callback: (v) => `${Math.round(v * 100)}%` } } },
        }} />
      </div>
      <p className="text-sm text-gray-600 mt-2">
        The 435 district markets add up to <b>{sh.dist_sum_D.toFixed(0)}</b> D seats; the seat-count market centers near <b>{sh.mkt_mean.toFixed(0)}</b>.
        Shifting every district about {Math.round(sh.k * 100) / 100} logits toward R (≈{Math.round(25 * sh.k)} pts in a 50/50 seat) reconciles them.
      </p>
    </Card>
  );
}

export default function House2026() {
  const h2 = DATA.hist2;
  const history = align({ 'Kalshi: D control': h2['CONTROLH|Democratic Party'] },
    { 'Kalshi: D control': { borderColor: 'rgb(36,73,153)', backgroundColor: 'rgba(36,73,153,0.08)', fill: true } });
  return (
    <Chamber name="the House" unit="seats" races={RACES} market={MARKET} holdD={0} holdR={0} majorityD={218}
      controlMarket={CTRL_D} rhoMarket={DATA.nat.fit_all.rho.H} history={history} needles={0} bucketChart={Buckets}
      live={`snapshot ${DATA.asof.slice(5, 16)}`} />
  );
}
