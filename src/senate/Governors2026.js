import React from 'react';
import Chamber from './Chamber';
import DATA from './data.json';
import { align } from './ui';

const G = DATA.gov;
const RACES = G.races.map((r) => ({ key: r.st, label: r.st, state: r.st, d: r.d, r: r.r, liq: r.liq }));
const MARKET = Object.fromEntries(G.races.map((r) => [r.st, r.p]));
const HOLD = Object.fromEntries([...G.hold.D.map((s) => [s, 'D']), ...G.hold.R.map((s) => [s, 'R'])]);
const W = Object.fromEntries(G.wins.map((m) => [m.sub, m.mid]));

export default function Governors2026() {
  const h2 = DATA.hist2;
  const history = align({
    'Kalshi: D more governorships': h2['KXGOVWINS|Democratic Party'],
    Tie: h2['KXGOVWINS|Tie'],
  }, {
    'Kalshi: D more governorships': { borderColor: 'rgb(36,73,153)' },
    Tie: { borderColor: '#9ca3af', borderDash: [4, 4], borderWidth: 1.5 },
  });
  return (
    <Chamber name="more governorships" unit="governors" races={RACES} market={MARKET} holdD={G.hold.D.length} holdR={G.hold.R.length}
      majorityD={26} tieAtD={25} controlMarket={W['Democratic Party']} rhoMarket={DATA.nat.fit_all.rho.G}
      history={history} map mapHold={HOLD} needles={16} live={`snapshot ${DATA.asof.slice(5, 16)}`} />
  );
}
