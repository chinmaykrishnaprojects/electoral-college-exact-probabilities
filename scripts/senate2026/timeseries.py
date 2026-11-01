"""Daily: market control price vs model control (fixed rho / independent) + implied rho that day."""
import json, os, sys
import numpy as np
from scipy import stats, optimize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from races import RACES, R_HOLDOVER

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
H = json.load(open(os.path.join(D, "history.json")))
FIT = json.load(open(os.path.join(D, "fit.json")))
NX = 800
XG = (np.arange(NX) + 0.5) / NX
ST = [r[0] for r in RACES]


def ctrl(p, rho):
    if rho < 1e-4:
        q = np.repeat(p[:, None], NX, 1)
    else:
        n = rho / (1 - rho)
        q = stats.beta.cdf(XG[None, :], n * (1 - p)[:, None], n * p[:, None])
    dist = np.zeros((len(p) + 1, NX)); dist[0] = 1
    for i in range(len(p)):
        dist[1:] = dist[1:] * (1 - q[i]) + dist[:-1] * q[i]; dist[0] *= (1 - q[i])
    d = dist.mean(1)
    return d[50 - R_HOLDOVER:].sum(), d


dates = sorted({r[0] for s in ST for r in H[s]} | {r[0] for r in H["CONTROL_D"]})
dates = [d for d in dates if d >= "2025-10-01"]
last = {s: None for s in ST + ["CONTROL_D"]}
series = {k: {r[0]: r[1] for r in v} for k, v in H.items()}
RHO = FIT["beta"]["rows"][0]["implied_rho"]  # rho implied by today's control market
rows = []
for d in dates:
    for s in last:
        if d in series[s]: last[s] = series[s][d]
    if any(last[s] is None for s in ST) or last["CONTROL_D"] is None:
        continue
    p = np.clip(np.array([last[s] for s in ST]), 0.002, 0.998)
    cR_fixed, dist = ctrl(p, RHO)
    cR_ind, _ = ctrl(p, 0.0)
    mR = 1 - last["CONTROL_D"]
    f = lambda r: ctrl(p, r)[0] - mR
    a, b = f(0.0), f(0.98)
    ir = optimize.brentq(f, 0.0, 0.98, xtol=2e-3) if np.sign(a) != np.sign(b) else None
    rows.append(dict(date=d, market_D=1 - mR, model_D=1 - cR_fixed, indep_D=1 - cR_ind, implied_rho=ir,
                     exp_R_seats=R_HOLDOVER + float(p.sum()), races={s: round(float(last[s]), 4) for s in ST}))
    print(d, f"mkt D {1-mR:.3f}  model D {1-cR_fixed:.3f}  indep D {1-cR_ind:.3f}  rho* {ir if ir is None else round(ir,2)}  E[R] {R_HOLDOVER+p.sum():.2f}")
json.dump(dict(rho=RHO, rows=rows), open(os.path.join(D, "timeseries.json"), "w"))
