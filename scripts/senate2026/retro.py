"""2026 retrospective: where did the actual result land in each day's market-implied distribution?

Model (same as the app): national percentile x ~ U(0,1), high = good for R.
P(R wins race i | x) = BetaCDF(x; n(1-p_i), n p_i), n = rho/(1-rho). Races independent given x.

Outputs (src/senate/retro.json):
  daily[ch]  : per day, posterior quantiles of x given every settled result (under that day's prices),
               seat mid-P percentile of the actual seat count, model + market P(D control)
  night      : race list with final pre-election price, result, Kalshi settlement time (replayed in the browser)
  evidence   : log P(all results | family, rho) for beta / Gaussian / logistic / Student-t factor models
  surprises  : leave-one-out P(result | every other result) at the final prices
"""
import calendar, json, os, sys, time
import numpy as np
from scipy import special, stats, optimize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from races import RACES, R_HOLDOVER

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, "retro.json")
RES = json.load(open(os.path.join(D, "results.json")))
HG = json.load(open(os.path.join(D, "house_gov.json"), encoding="utf-8"))
PEND = json.load(open(os.path.join(D, "pending.json")))
H2 = json.load(open(os.path.join(D, "history2.json")))
HS = json.load(open(os.path.join(D, "history.json")))

NX = 600
XG = (np.arange(NX) + 0.5) / NX
RHO = dict(senate=0.58, house=0.48, gov=0.45)
# R wins needed for R control / D wins needed for D control (out of the races up this cycle)
CTRL = dict(senate=dict(n=35, d_need=51 - (100 - R_HOLDOVER - 35)),   # D needs 51 seats total; D holdover 34
            house=dict(n=435, d_need=218),
            gov=dict(n=36, d_need=26 - 6))                              # D holds 6 not up; 26 = majority
EPS = 0.003
CUT = calendar.timegm((2026, 11, 3, 6, 0, 0))   # last pre-election daily candle closes midnight ET Nov 3


def et_day(ts):
    return time.strftime("%Y-%m-%d", time.gmtime(ts - 6 * 3600))


SEN_NAMES = {r[0]: (r[4], r[5]) for r in RACES}
races = {"senate": [], "house": [], "gov": []}
for r in RES["races"]:
    ch, k = r["ch"], r["key"]
    src = HG["house"].get(k) if ch == "house" else HG["gov"].get(k) if ch == "gov" else None
    if ch == "senate":
        rn, dn = SEN_NAMES[k]
    else:
        rn, dn = src.get("r"), src.get("d")
    hist = [(et_day(t), p) for t, p in r["hist"] if t <= CUT]
    p_final = hist[-1][1] if hist else (src["p"] if src else None)
    pend = PEND.get(f"{ch}|{k}")
    won = r["won_r"]
    if won is None and src and src.get("assumed"):
        won, pend = False, None          # dropped-map CA seats with no market: safe D, no information
    races[ch].append(dict(key=k, r=rn, d=dn, p=round(p_final, 4), won=None if won is None else int(won), pend=pend,
                          call=r["call"], hist=hist, nomkt=bool(src and src.get("assumed")), winner=r["winner"]))


def q_beta(ps, rho):
    ps = np.clip(np.asarray(ps, float), 1e-4, 1 - 1e-4)
    if rho < 1e-4:
        return np.repeat(ps[:, None], NX, 1)
    n = rho / (1 - rho)
    return special.betainc(n * (1 - ps)[:, None], n * ps[:, None], XG[None, :])


def loglik_rows(q, won, pend):
    """per-race log-likelihood over the x grid: called races exact, uncalled races weighted by today's price."""
    q = np.clip(q, 1e-12, 1 - 1e-12)
    out = np.zeros_like(q)
    for i, (w, pe) in enumerate(zip(won, pend)):
        if w is not None:
            out[i] = np.log(q[i]) if w else np.log1p(-q[i])
        elif pe is not None:
            out[i] = np.log(pe * q[i] + (1 - pe) * (1 - q[i]))
    return out


def post_stats(ll):
    w = np.exp(ll - ll.max()); w /= w.sum()
    c = np.cumsum(w)
    qs = [float(np.interp(a, c, XG)) for a in (0.05, 0.25, 0.5, 0.75, 0.95)]
    return dict(mean=float((w * XG).sum()), q=qs), w


def seat_dist_given_w(q, w):
    """distribution of R wins (n races), mixing over x with weights w."""
    n = q.shape[0]
    d = np.zeros((NX, n + 1)); d[:, 0] = 1
    for i in range(n):
        qi = q[i][:, None]
        d[:, 1:] = d[:, 1:] * (1 - qi) + d[:, :-1] * qi
        d[:, 0] *= 1 - q[i]
    return (w[:, None] * d).sum(0)


def chamber_day(ch, ps, rho):
    rs = races[ch]
    q = q_beta(ps, rho)
    won = [None if r["nomkt"] else r["won"] for r in rs]
    pend = [r["pend"] for r in rs]
    ll = loglik_rows(q, won, pend).sum(0)
    st, w = post_stats(ll)
    # seat distribution (prior, uniform x). Near-certain races fixed to keep the House fast.
    var = [i for i, p in enumerate(ps) if EPS < p < 1 - EPS]
    base = sum(1 for p in ps if p >= 1 - EPS)
    dist = np.zeros(len(ps) + 1)
    dv = seat_dist_given_w(q[var], np.full(NX, 1 / NX))
    dist[base:base + len(dv)] = dv
    actual_r = sum(1 for r in rs if (r["won"] if r["won"] is not None else (r["pend"] or 0) >= 0.5))
    below = dist[:actual_r].sum()
    pit = float(below + 0.5 * dist[actual_r])
    n = len(ps)
    d_need = CTRL[ch]["d_need"]
    p_d = float(dist[: n - d_need + 1].sum())   # R wins <= n - d_need  <=> D wins >= d_need
    mean_r = float((np.arange(n + 1) * dist).sum())
    return st, pit, p_d, mean_r, actual_r, ll


def series(ch):
    rs = races[ch]
    days = sorted({d for r in rs for d, _ in r["hist"]})
    first = {}
    for r in rs:
        if r["hist"]:
            first[r["key"]] = r["hist"][0][0]
    # start once 90% of priced races have a market
    priced = [r for r in rs if r["hist"]]
    start = None
    for d in days:
        if sum(1 for r in priced if first[r["key"]] <= d) >= 0.9 * len(priced):
            start = d; break
    start = max(start, "2025-11-01")
    out, snaps = [], {}
    cur = {r["key"]: (r["hist"][0][1] if r["hist"] else r["p"]) for r in rs}
    idx = {r["key"]: 0 for r in rs}
    for d in [d for d in days if d >= start]:
        for r in rs:
            h = r["hist"]
            while idx[r["key"]] < len(h) and h[idx[r["key"]]][0] <= d:
                cur[r["key"]] = h[idx[r["key"]]][1]; idx[r["key"]] += 1
        ps = np.array([cur[r["key"]] for r in rs])
        if is_snap(d):
            snaps[d] = [round(float(v), 4) for v in ps]
        st, pit, p_d, mean_r, actual_r, _ = chamber_day(ch, ps, RHO[ch])
        out.append(dict(d=d, x=[round(v, 4) for v in st["q"]], xm=round(st["mean"], 4), pit=round(pit, 4),
                        pd=round(p_d, 4), er=round(mean_r, 2)))
    return out, actual_r, snaps


def is_snap(d):
    gap = (calendar.timegm(time.strptime("2026-11-02", "%Y-%m-%d")) - calendar.timegm(time.strptime(d, "%Y-%m-%d"))) // 86400
    return gap >= 0 and (gap <= 7 or gap % 7 == 0)


def market_ctrl(ch):
    if ch == "senate":
        return {d: p for d, p, *_ in HS["CONTROL_D"]}
    if ch == "house":
        return {d: p for d, p in H2["CONTROLH|Democratic Party"]}
    return {d: p for d, p in H2["KXGOVWINS|Democratic Party"]}


daily, actual, snaps = {}, {}, {}
for ch in races:
    t0 = time.time()
    s, a, snaps[ch] = series(ch)
    mk = market_ctrl(ch)
    for row in s:
        # history files label candles by UTC end date; shift one day to the ET trading day
        nd = time.strftime("%Y-%m-%d", time.gmtime(calendar.timegm(time.strptime(row["d"], "%Y-%m-%d")) + 86400))
        row["mk"] = mk.get(nd, mk.get(row["d"]))
    daily[ch], actual[ch] = s, a
    print(ch, len(s), "days", s[0]["d"], "->", s[-1]["d"], "final x", s[-1]["x"], "pit", s[-1]["pit"], "actual R", a,
          f"{time.time() - t0:.1f}s", flush=True)

# combined (shared x across chambers) on the final pre-election prices
ll_all = np.zeros(NX)
fin = {}
for ch in races:
    ps = np.array([r["p"] for r in races[ch]])
    st, pit, p_d, mean_r, a, ll = chamber_day(ch, ps, RHO[ch])
    fin[ch] = dict(x=st["q"], xm=st["mean"], pit=pit, pd=p_d, er=mean_r, actual_r=a)
    ll_all += ll
st_all, w_all = post_stats(ll_all)
fin["all"] = dict(x=st_all["q"], xm=st_all["mean"])
print("combined final x", st_all["q"])

# ---------- which dependence structure gave the actual result the most probability?
ZN = 800
UG = (np.arange(ZN) + 0.5) / ZN
CG = np.linspace(-40, 40, 4001)
FAM = {
    "Gaussian": stats.norm, "Logistic": stats.logistic,
    "Student-t 3": stats.t(3), "Student-t 5": stats.t(5), "Student-t 10": stats.t(10),
}


def q_factor(ps, rho, dist):
    """one-factor latent model: Y_i = a Z + b e_i, R wins if Y_i > c_i; Z, e_i iid from `dist`.
    Thresholds solved so each race keeps its market probability. Returns P(R | x) on the x grid (x = F_Z(Z))."""
    ps = np.clip(np.asarray(ps, float), 1e-4, 1 - 1e-4)
    if rho < 1e-4:
        return np.repeat(ps[:, None], NX, 1)
    a, b = np.sqrt(rho), np.sqrt(1 - rho)
    key = (id(dist), rho)
    if key not in _MARG:   # marginal survival of Y on a threshold grid, then invert by interpolation
        z = dist.ppf(UG)
        sf = np.empty(len(CG))
        for s in range(0, len(CG), 500):
            sf[s:s + 500] = dist.sf((CG[s:s + 500, None] - a * z[None, :]) / b).mean(1)
        _MARG[key] = sf
    sf = _MARG[key]
    c = np.interp(-ps, -sf, CG)          # sf decreasing in c
    zx = dist.ppf(XG)
    return dist.sf((c[:, None] - a * zx[None, :]) / b)


_MARG = {}


def log_evidence(q_by_ch):
    ll = sum(loglik_rows(q, [None if r["nomkt"] else r["won"] for r in races[ch]], [r["pend"] for r in races[ch]]).sum(0)
             for ch, q in q_by_ch.items())
    m = ll.max()
    return float(m + np.log(np.exp(ll - m).mean()))


RG = [round(v, 2) for v in np.arange(0, 0.96, 0.05)]
PSF = {ch: np.array([r["p"] for r in races[ch]]) for ch in races}
LLC = {}   # per chamber, family, rho: log-likelihood over x grid
for ch in races:
    won = [None if r["nomkt"] else r["won"] for r in races[ch]]
    pend = [r["pend"] for r in races[ch]]
    LLC[(ch, "Beta (app)")] = [loglik_rows(q_beta(PSF[ch], rho), won, pend).sum(0) for rho in RG]
    for name, dist in FAM.items():
        LLC[(ch, name)] = [loglik_rows(q_factor(PSF[ch], rho, dist), won, pend).sum(0) for rho in RG]
    print("evidence grid done", ch, flush=True)


def lme(ll):
    m = ll.max()
    return float(m + np.log(np.exp(ll - m).mean()))


evidence = {}
for scope in ["senate", "house", "gov", "all"]:
    chs = list(races) if scope == "all" else [scope]
    nobs = sum(sum(1 for r in races[ch] if not r["nomkt"] and (r["won"] is not None or r["pend"] is not None)) for ch in chs)
    fam = {name: [lme(sum(LLC[(ch, name)][k] for ch in chs)) for k in range(len(RG))] for name in ["Beta (app)", *FAM]}
    evidence[scope] = dict(n=nobs, rho=RG, ll={k: [round(v, 3) for v in vs] for k, vs in fam.items()})
    best = {k: (RG[int(np.argmax(v))], round(max(v), 2)) for k, v in fam.items()}
    print("evidence", scope, nobs, "indep", round(fam["Beta (app)"][0], 2), best)

# ---------- surprises net of the national swing: P(result | all other results), final prices, shared x
qs = {ch: q_beta(np.array([r["p"] for r in races[ch]]), RHO[ch]) for ch in races}
lls = {ch: loglik_rows(qs[ch], [None if r["nomkt"] else r["won"] for r in races[ch]], [r["pend"] for r in races[ch]]) for ch in races}
tot = sum(l.sum(0) for l in lls.values())
surprises = []
for ch in races:
    for i, r in enumerate(races[ch]):
        if r["won"] is None or r["nomkt"]:
            continue
        lo = tot - lls[ch][i]
        w = np.exp(lo - lo.max()); w /= w.sum()
        pr = float((w * qs[ch][i]).sum())        # P(R | everything else)
        p_res = pr if r["won"] else 1 - pr
        surprises.append(dict(ch=ch, key=r["key"], p=r["p"], won=r["won"], cond=round(pr, 4), pres=round(p_res, 4),
                              r=r["r"], d=r["d"]))
surprises.sort(key=lambda s: s["pres"])
print("top surprises", [(s["ch"], s["key"], s["won"], s["p"], s["cond"]) for s in surprises[:12]])

night = {}
for ch in races:
    night[ch] = [dict(k=r["key"], r=r["r"], d=r["d"], p=r["p"], won=r["won"], call=r["call"], pend=r["pend"],
                      nomkt=r["nomkt"]) for r in races[ch]]
ctl_night = {k: [[t, p] for t, p in v] for k, v in RES["night"].items()}

json.dump(dict(rho=RHO, ctrl=CTRL, daily=daily, final=fin, actual=actual, night=night, snaps=snaps, ctl_night=ctl_night,
               evidence=evidence, surprises=[s for s in surprises if s["pres"] < 0.5],
               pulled=RES["pulled"]), open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT))
