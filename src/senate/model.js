// Same Beta-copula as the 2024 tab: national percentile x ~ U(0,1) (high = good for R),
// P(R wins race i | x) = BetaCDF(x; n(1-p_i), n p_i), n = rho/(1-rho).
// rho = 0 -> races independent, rho = 1 -> one national swing orders every race.

export const NX = 600;
export const XG = Float64Array.from({ length: NX }, (_, i) => (i + 0.5) / NX);

function logGamma(x) {
  const p = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  let sum = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) sum += p[i] / (x + i);
  const t = x + p.length - 1.5;
  return Math.log(Math.sqrt(2 * Math.PI)) + (x - 0.5) * Math.log(t) - t + Math.log(sum);
}

function betacf(x, a, b) {
  const EPS = 1e-10, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function betaCDF(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const bt = Math.exp(lbt);
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a;
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

// q[i][j] = P(R wins race i | x_j)
export function condMatrix(ps, rho) {
  const r = Math.min(Math.max(rho, 0), 0.999);
  return ps.map((p0) => {
    const p = Math.min(Math.max(p0, 1e-4), 1 - 1e-4);
    const row = new Float64Array(NX);
    if (r < 1e-4) { row.fill(p); return row; }
    const n = r / (1 - r);
    for (let j = 0; j < NX; j++) row[j] = betaCDF(XG[j], n * (1 - p), n * p);
    return row;
  });
}

// scenario weights given locked races: {idx: true(R)/false(D)}
export function weights(q, locks) {
  const w = new Float64Array(NX).fill(1);
  for (const [i, isR] of Object.entries(locks)) {
    const row = q[i];
    for (let j = 0; j < NX; j++) w[j] *= isR ? row[j] : 1 - row[j];
  }
  return w;
}

// P(R wins exactly k of the races), weighted over scenarios
export function seatDist(q, w, locks = {}) {
  const n = q.length;
  const out = new Float64Array(n + 1);
  let wsum = 0;
  const dist = new Float64Array(n + 1);
  for (let j = 0; j < NX; j++) {
    if (w[j] === 0) continue;
    dist.fill(0); dist[0] = 1;
    for (let i = 0; i < n; i++) {
      const qi = i in locks ? (locks[i] ? 1 : 0) : q[i][j];
      for (let k = i + 1; k >= 1; k--) dist[k] = dist[k] * (1 - qi) + dist[k - 1] * qi;
      dist[0] *= 1 - qi;
    }
    for (let k = 0; k <= n; k++) out[k] += w[j] * dist[k];
    wsum += w[j];
  }
  for (let k = 0; k <= n; k++) out[k] /= wsum || 1;
  return out;
}

export function condProbs(q, w) {
  let ws = 0;
  for (let j = 0; j < NX; j++) ws += w[j];
  return q.map((row) => {
    let s = 0;
    for (let j = 0; j < NX; j++) s += w[j] * row[j];
    return ws > 0 ? s / ws : NaN;
  });
}

export function jointProb(q, want, idx, w) {
  // want: {st: true(R)}; conditioned on w (locks)
  let s = 0, ws = 0;
  for (let j = 0; j < NX; j++) {
    let v = w[j];
    for (const [st, isR] of Object.entries(want)) {
      const qi = q[idx[st]][j];
      v *= isR ? qi : 1 - qi;
    }
    s += v; ws += w[j];
  }
  return ws > 0 ? s / ws : NaN;
}

export function subsetAtLeast(q, states, k, idx, w) {
  let s = 0, ws = 0;
  const dist = new Float64Array(states.length + 1);
  for (let j = 0; j < NX; j++) {
    dist.fill(0); dist[0] = 1;
    states.forEach((st, i) => {
      const qi = q[idx[st]][j];
      for (let m = i + 1; m >= 1; m--) dist[m] = dist[m] * (1 - qi) + dist[m - 1] * qi;
      dist[0] *= 1 - qi;
    });
    let t = 0;
    for (let m = k; m <= states.length; m++) t += dist[m];
    s += w[j] * t; ws += w[j];
  }
  return s / ws;
}

export function controlR(ps, rho, need) {
  const q = condMatrix(ps, rho);
  const w = new Float64Array(NX).fill(1);
  const d = seatDist(q, w);
  let s = 0;
  for (let k = need; k < d.length; k++) s += d[k];
  return s;
}

// rho that makes model P(R control) equal target (null if no rho reaches it)
export function impliedRho(ps, target, need) {
  let lo = 0, hi = 0.99;
  const flo = controlR(ps, lo, need) - target, fhi = controlR(ps, hi, need) - target;
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2;
    const fm = controlR(ps, mid, need) - target;
    if (Math.sign(fm) === Math.sign(flo)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Whole-chamber engine. Near-certain races (p <= eps or >= 1-eps) are held fixed so the House (435) stays fast.
// locks: {raceIdx: true(R)/false(D)}. Returns dist over total R wins (length n+1) and each race's conditional P(R).
export function chamber(ps, rho, locks = {}, eps = 0.003) {
  const n = ps.length;
  let base = 0;
  const V = [], L = [];
  ps.forEach((p, i) => {
    if (i in locks) { L.push(i); if (locks[i]) base++; } else if (p <= eps) { /* D, fixed */ } else if (p >= 1 - eps) base++; else V.push(i);
  });
  const rows = [...V, ...L];
  const qm = condMatrix(rows.map((i) => ps[i]), rho);
  const qOf = {};
  rows.forEach((i, k) => { qOf[i] = qm[k]; });
  const w = new Float64Array(NX).fill(1);
  L.forEach((i) => { const row = qOf[i]; const isR = locks[i]; for (let j = 0; j < NX; j++) w[j] *= isR ? row[j] : 1 - row[j]; });
  const m = V.length;
  const out = new Float64Array(n + 1);
  const d = new Float64Array(m + 1);
  let ws = 0;
  for (let j = 0; j < NX; j++) {
    const wj = w[j];
    if (wj === 0) continue;
    d.fill(0); d[0] = 1;
    for (let k = 0; k < m; k++) {
      const qi = qOf[V[k]][j];
      for (let t = k + 1; t >= 1; t--) d[t] = d[t] * (1 - qi) + d[t - 1] * qi;
      d[0] *= 1 - qi;
    }
    for (let t = 0; t <= m; t++) out[base + t] += wj * d[t];
    ws += wj;
  }
  for (let t = 0; t <= n; t++) out[t] /= ws || 1;
  const cond = ps.map((p, i) => {
    if (i in locks) return locks[i] ? 1 : 0;
    const row = qOf[i];
    if (!row) return p;
    let s = 0;
    for (let j = 0; j < NX; j++) s += w[j] * row[j];
    return ws ? s / ws : p;
  });
  return { dist: out, cond };
}

// P(R wins >= t | x) on the scenario grid, for each threshold t (cross-chamber view)
export function perX(ps, rho, thresholds, eps = 0.003) {
  let base = 0;
  const V = [];
  ps.forEach((p, i) => { if (p >= 1 - eps) base++; else if (p > eps) V.push(i); });
  const qm = condMatrix(V.map((i) => ps[i]), rho);
  const m = V.length;
  const res = thresholds.map(() => new Float64Array(NX));
  const d = new Float64Array(m + 1);
  for (let j = 0; j < NX; j++) {
    d.fill(0); d[0] = 1;
    for (let k = 0; k < m; k++) {
      const qi = qm[k][j];
      for (let t = k + 1; t >= 1; t--) d[t] = d[t] * (1 - qi) + d[t - 1] * qi;
      d[0] *= 1 - qi;
    }
    for (let a = 0; a < thresholds.length; a++) {
      let s = 0;
      for (let t = Math.max(0, thresholds[a] - base); t <= m; t++) s += d[t];
      res[a][j] = s;
    }
  }
  return res;
}

export const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// sin^2 link from the 2024 needle: angle in [-90, 90] -> P(R)
export const angleToP = (a) => Math.pow(Math.sin(((a + 90) / 2) * Math.PI / 180), 2);
export const pToAngle = (p) => 2 * Math.asin(Math.sqrt(Math.min(Math.max(p, 0), 1))) * 180 / Math.PI - 90;

// continuous red/blue gradient by P(R) (no bucketed colors)
export function probColor(pR, alpha = 1) {
  const t = Math.min(Math.max(pR, 0), 1);
  const blue = [36, 73, 153], mid = [230, 226, 214], red = [210, 37, 50];
  const lerp = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const c = t < 0.5 ? lerp(blue, mid, t / 0.5) : lerp(mid, red, (t - 0.5) / 0.5);
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
