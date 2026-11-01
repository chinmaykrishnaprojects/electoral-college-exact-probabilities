// Live Kalshi prices for the 2026 Senate tab. Kalshi blocks browser CORS, so proxy here.
// Returns { asof, control_D, races: { ST: pR } } with pR normalized across the race's candidates.
const BASE = 'https://api.elections.kalshi.com/trade-api/v2';

const RACES = {
  AL: 'SENATEAL-26', AK: 'SENATEAK-26', AR: 'SENATEAR-26', CO: 'SENATECO-26', DE: 'SENATEDE-26',
  FL: 'SENATEFLS-26', GA: 'SENATEGA-26', ID: 'SENATEID-26', IL: 'SENATEIL-26', IA: 'SENATEIA-26',
  KS: 'SENATEKS-26', KY: 'SENATELA-26', LA: 'KXSENATELA-26NOV', ME: 'SENATEME-26', MA: 'SENATEMA-26',
  MI: 'SENATEMI-26', MN: 'SENATEMN-26', MS: 'SENATEMS-26', MT: 'SENATEMT-26', NE: 'SENATENE-26',
  NH: 'SENATENH-26', NJ: 'SENATENJ-26', NM: 'SENATENM-26', NC: 'SENATENC-26', OH: 'SENATEOHS-26',
  OK: 'SENATEOK-26', OR: 'SENATEOR-26', RI: 'SENATERI-26', SC: 'SENATESC-26', SD: 'SENATESD-26',
  TN: 'SENATETN-26', TX: 'SENATETX-26', VA: 'SENATEVA-26', WV: 'SENATEWV-26', WY: 'SENATEWY-26',
};

const num = (x) => (x === undefined || x === null || x === '' ? null : Number(x));
const mid = (m) => {
  const b = num(m.yes_bid_dollars), a = num(m.yes_ask_dollars), l = num(m.last_price_dollars);
  if (m.result === 'yes') return 1;
  if (m.result === 'no') return 0;
  return b !== null && a !== null && a > 0 && a - b < 0.2 ? (b + a) / 2 : l;
};

async function markets(event) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${BASE}/markets?event_ticker=${event}&limit=50`, { headers: { Accept: 'application/json' } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`${event}: ${r.status}`);
    return (await r.json()).markets || [];
  }
  throw new Error(`${event}: rate limited`);
}

module.exports = async (req, res) => {
  try {
    const entries = Object.entries(RACES);
    const out = {};
    const queue = [...entries, ['CONTROL', 'CONTROLS-2026']];
    const workers = Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const [st, ev] = queue.shift();
        try {
          const ms = await markets(ev);
          if (st === 'CONTROL') {
            const d = ms.find((m) => m.ticker.endsWith('-D'));
            out.CONTROL = d ? mid(d) : null;
          } else {
            const r = ms.find((m) => m.ticker === `${ev}-R`);
            const tot = ms.reduce((s, m) => s + (mid(m) || 0), 0);
            out[st] = r && tot > 0 ? mid(r) / tot : null;
          }
        } catch (e) {
          out[st] = null;
        }
      }
    });
    await Promise.all(workers);
    const { CONTROL, ...races } = out;
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ asof: new Date().toISOString(), control_D: CONTROL, races });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
