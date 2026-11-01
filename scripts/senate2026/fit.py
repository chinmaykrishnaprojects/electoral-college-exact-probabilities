"""Reverse-engineer the market's Senate model.

Beta copula (same as the 2024 app): global percentile x~U(0,1) (high = good for R).
q_i(x) = BetaCDF(x; n(1-p_i), n p_i),  n = rho/(1-rho).  rho=0 independent, rho=1 one national swing.
Gaussian copula for comparison: R_i iff sqrt(rho) Z + sqrt(1-rho) e_i < Phi^-1(p_i).
"""
import json, os, sys
import numpy as np
from scipy import stats, optimize

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from races import RACES, R_HOLDOVER

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ev = json.load(open(os.path.join(D, "senate_open.json"), encoding="utf-8"))
ST = [r[0] for r in RACES]
IDX = {s: i for i, s in enumerate(ST)}
NX = 2000
XG = (np.arange(NX) + 0.5) / NX
ZG = stats.norm.ppf(XG)  # equal-mass z grid -> same integration for both copulas


def mk(ser, et=None):
    out = {}
    for e in ev[ser]:
        if et and e["event_ticker"] != et: continue
        for m in e["markets"]:
            b, a = float(m.get("yes_bid_dollars") or 0), float(m.get("yes_ask_dollars") or 0)
            l = float(m.get("last_price_dollars") or 0)
            mid = (b + a) / 2 if a > 0 else l
            out[m["ticker"]] = dict(bid=b, ask=a, mid=mid, sub=m.get("yes_sub_title"), vol=float(m.get("volume_fp") or 0))
    return out


# ---- snapshot p(R) per race, normalized across all candidates in the event
P = np.zeros(len(ST)); LIQ = {}
for st, ser, rt, *_ in RACES:
    ms = mk(ser, rt.rsplit("-", 1)[0])
    tot = sum(v["mid"] for v in ms.values() if v["mid"] < 0.999 or len(ms) == 2)
    P[IDX[st]] = ms[rt]["mid"] / tot
    LIQ[st] = sum(v["vol"] for v in ms.values())


def cond_beta(p, rho):
    """q[i, x] = P(R wins i | x)."""
    if rho <= 1e-6: return np.repeat(p[:, None], NX, 1)
    n = rho / (1 - rho)
    return stats.beta.cdf(XG[None, :], n * (1 - p)[:, None], n * p[:, None])


def cond_gauss(p, rho):
    if rho <= 1e-6: return np.repeat(p[:, None], NX, 1)
    rho = min(rho, 0.9999)
    t = stats.norm.ppf(p)[:, None]
    # high x (=high z) good for R  ->  R iff -sqrt(rho)Z + ... < t  i.e. P = Phi((t + sqrt(rho) z)/sqrt(1-rho))
    return stats.norm.cdf((t + np.sqrt(rho) * ZG[None, :]) / np.sqrt(1 - rho))


def seat_dist(q):
    """P(R wins k of the 35) averaged over x."""
    dist = np.zeros((len(q) + 1, NX)); dist[0] = 1
    for i in range(len(q)):
        dist[1:] = dist[1:] * (1 - q[i]) + dist[:-1] * q[i]
        dist[0] = dist[0] * (1 - q[i])
    return dist.mean(1)


def joint(q, want):
    """want: {state: True if R wins}."""
    v = np.ones(NX)
    for s, r in want.items():
        v = v * (q[IDX[s]] if r else 1 - q[IDX[s]])
    return v.mean()


# ---- targets
targets = []  # (name, fn(q, dist) -> model prob, bid, ask, mid, vol)
c = mk("CONTROLS", "CONTROLS-2026")["CONTROLS-2026-R"]
targets.append(("Control: R", lambda q, d: d[50 - R_HOLDOVER:].sum(), c["bid"], c["ask"], c["mid"], c["vol"]))
for k, v in mk("KXRSENATEWON").items():
    n = int(k.split("AL")[-1])
    targets.append((f"R wins ≥{n} of 35", (lambda n: lambda q, d: d[n:].sum())(n), v["bid"], v["ask"], v["mid"], v["vol"]))


def combo(ser, states, letter_means_R):
    for k, v in mk(ser).items():
        code = k.rsplit("-", 1)[-1]
        want = {s: ((ch == "T") == letter_means_R) for s, ch in zip(states, code)}
        targets.append((f"{ser.replace('KX','').replace('SEN','')}: {v['sub']}", (lambda w: lambda q, d: joint(q, w))(want), v["bid"], v["ask"], v["mid"], v["vol"]))


combo("KXFOURSTATESEN", ["TX", "AK", "IA", "OH"], False)
combo("KXFIVESTATESEN", ["ME", "MI", "NH", "AK", "OH"], False)
combo("KXTHREESTATESEN", ["NE", "KS", "SC"], True)
v = mk("KXDEMCOREFOURSENATESWEEP")["KXDEMCOREFOURSENATESWEEP-26NOV03"]
targets.append(("D sweep GA/MI/NC/ME", lambda q, d: joint(q, {"GA": 0, "MI": 0, "NC": 0, "ME": 0}), v["bid"], v["ask"], v["mid"], v["vol"]))
v = mk("KXGOPPLAINSSENSWEEP")["KXGOPPLAINSSENSWEEP-26NOV03"]
targets.append(("R sweep IA/KS/NE", lambda q, d: joint(q, {"IA": 1, "KS": 1, "NE": 1}), v["bid"], v["ask"], v["mid"], v["vol"]))
SIX = ["AK", "IA", "KS", "MI", "OH", "TX"]


def six5(q, d):
    sub = q[[IDX[s] for s in SIX]]
    dd = seat_dist_x(sub)
    return dd[5:].sum()


def seat_dist_x(q):
    dist = np.zeros((len(q) + 1, NX)); dist[0] = 1
    for i in range(len(q)):
        dist[1:] = dist[1:] * (1 - q[i]) + dist[:-1] * q[i]; dist[0] *= (1 - q[i])
    return dist.mean(1)


v = mk("KXGOPSIXSENATE")["KXGOPSIXSENATE-26NOV03-AL5"]
targets.append(("R wins ≥5 of AK/IA/KS/MI/OH/TX", six5, v["bid"], v["ask"], v["mid"], v["vol"]))


def evaluate(cond, rho):
    q = cond(P, rho); d = seat_dist(q)
    return q, d, np.array([t[1](q, d) for t in targets])


def implied_rho(cond, i):
    """rho that makes the model hit target i's mid (None if unreachable)."""
    f = lambda r: evaluate_one(cond, r, i) - targets[i][4]
    lo, hi = f(0.0), f(0.995)
    if np.sign(lo) == np.sign(hi): return None
    return optimize.brentq(f, 0.0, 0.995, xtol=1e-3)


def evaluate_one(cond, rho, i):
    q = cond(P, rho); d = seat_dist(q)
    return targets[i][1](q, d)


def joint_fit(cond):
    mids = np.array([t[4] for t in targets]); w = np.sqrt(np.array([t[5] for t in targets]) + 1)
    def loss(r):
        _, _, m = evaluate(cond, r)
        # logit-space error, liquidity weighted
        lm, lt = np.log(np.clip(m, 1e-3, 1 - 1e-3) / (1 - np.clip(m, 1e-3, 1 - 1e-3))), np.log(np.clip(mids, 1e-3, 1 - 1e-3) / (1 - np.clip(mids, 1e-3, 1 - 1e-3)))
        return float((w * (lm - lt) ** 2).sum() / w.sum())
    res = optimize.minimize_scalar(loss, bounds=(0.0, 0.99), method="bounded", options={"xatol": 1e-3})
    return res.x, res.fun


if __name__ == "__main__":
    print("E[R wins] =", P.sum().round(2), " -> E[R seats] =", (R_HOLDOVER + P.sum()).round(2))
    out = {"p": {s: float(P[IDX[s]]) for s in ST}, "liq": LIQ}
    for name, cond in [("beta", cond_beta), ("gauss", cond_gauss)]:
        rho, L = joint_fit(cond)
        q, d, m = evaluate(cond, rho)
        print(f"\n=== {name} copula: joint-fit rho = {rho:.3f} (loss {L:.4f})  P(R control) = {d[50-R_HOLDOVER:].sum():.3f}")
        rows = []
        for i, t in enumerate(targets):
            ir = implied_rho(cond, i)
            edge = "BUY" if m[i] > t[3] + 0.005 else "SELL" if m[i] < t[2] - 0.005 else ""
            rows.append(dict(name=t[0], bid=t[2], ask=t[3], mid=t[4], vol=t[5], model=float(m[i]), implied_rho=ir, edge=edge))
            print(f"  {t[0][:46]:<46} mkt {t[2]:.3f}-{t[3]:.3f}  model {m[i]:.3f}  impl.rho {('%.2f' % ir) if ir is not None else '  - '}  vol ${t[5]:>9,.0f} {edge}")
        out[name] = dict(rho=rho, dist=d.tolist(), rows=rows, control_R=float(d[50 - R_HOLDOVER:].sum()))
    json.dump(out, open(os.path.join(D, "fit.json"), "w"), indent=1)
