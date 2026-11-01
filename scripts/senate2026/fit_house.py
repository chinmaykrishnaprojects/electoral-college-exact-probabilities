"""House: district markets sum to more D seats than the seat-count market. Fit a longshot correction
p' = sigmoid(k * logit(p)) (k>1 pushes thin long-shot prices toward 0/1) jointly with rho to the seat buckets + control."""
import json, os, re, sys
import numpy as np
from scipy import stats
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
HG = json.load(open(os.path.join(D, "house_gov.json"), encoding="utf-8"))
NX = 400
XG = (np.arange(NX) + 0.5) / NX
P0 = np.clip(np.array([v["p"] for v in HG["house"].values()]), 1e-4, 1 - 1e-4)
nat = {k.split("-")[0]: v for k, v in HG["nat"].items()}
buckets = []
for m in nat["KXDHOUSESEATS"]["markets"]:
    s = m["sub"]
    lo, hi = ((0, int(s.split()[1]) - 1) if s.startswith("Below") else (int(s.split()[1]) + 1, 435) if s.startswith("Above") else tuple(map(int, s.split("-"))))
    buckets.append((s, lo, hi, m["mid"]))
tot = sum(b[3] for b in buckets)
buckets = [(s, lo, hi, v / tot) for s, lo, hi, v in buckets]
ctl_R = [m["mid"] for m in nat["CONTROLH"]["markets"] if m["sub"].startswith("Rep")][0]
mids = {"Below 210": 206, "Above 249": 254}
mkt_mean = sum(v * mids.get(s, (lo + hi) / 2) for s, lo, hi, v in buckets)
print(f"district-sum E[D] = {435 - P0.sum():.1f}   seat-market E[D] ~ {mkt_mean:.1f}   control R {ctl_R:.3f}")


def adj(p, k):
    # k = uniform logit shift toward R (k>0 -> every district a bit more R)
    l = np.log(p / (1 - p))
    return 1 / (1 + np.exp(-(l + k)))


def dseats(p, rho):
    n = rho / (1 - rho)
    q = stats.beta.cdf(XG[None, :], n * (1 - p)[:, None], n * p[:, None]) if rho > 1e-4 else np.repeat(p[:, None], NX, 1)
    var = (p > 0.002) & (p < 0.998)
    base = int(round(p[~var].sum()))  # near-certain R seats
    qv = q[var]
    dist = np.zeros((len(qv) + 1, NX)); dist[0] = 1
    for i in range(len(qv)):
        dist[1:] = dist[1:] * (1 - qv[i]) + dist[:-1] * qv[i]; dist[0] *= (1 - qv[i])
    r = np.zeros(436); r[base:base + len(qv) + 1] = dist.mean(1)
    return r[::-1]  # index = D seats


best = None
for k in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8]:
    p = adj(P0, k)
    for rho in [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]:
        d = dseats(p, rho)
        err = sum((d[lo:hi + 1].sum() - v) ** 2 for s, lo, hi, v in buckets) + 4 * (d[:218].sum() - ctl_R) ** 2
        if best is None or err < best[0]: best = (err, k, rho, d)
    print(f"k={k}: E[D]={435 - p.sum():.1f}")
err, k, rho, d = best
print(f"\nbest k={k} rho={rho} sse={err:.4f}  E[D]={(d * np.arange(436)).sum():.1f}  P(R ctl)={d[:218].sum():.3f}")
for s, lo, hi, v in buckets: print(f"  {s:<10} market {v:.3f}  fit {d[lo:hi+1].sum():.3f}")
pa = adj(P0, k); keys = list(HG["house"].keys())
shift = sorted(zip(keys, P0, pa), key=lambda t: -abs(t[1] - t[2]))[:12]
print("largest corrections:", [(a, round(1 - b, 3), round(1 - c, 3)) for a, b, c in shift])
json.dump(dict(k=k, rho=rho, mkt_mean=mkt_mean, dist_sum_D=float(435 - P0.sum()), adj_sum_D=float(435 - pa.sum())),
          open(os.path.join(D, "fit_house.json"), "w"), indent=1)
