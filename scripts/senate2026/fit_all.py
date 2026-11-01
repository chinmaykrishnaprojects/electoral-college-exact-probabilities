"""Cross-chamber: one national percentile x shared by Senate, House and governor races.
Each chamber gets its own rho (fit to its own control market); the balance-of-power combo is then a free test."""
import json, os, sys
import numpy as np
from scipy import stats, optimize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fit
from races import R_HOLDOVER

D = fit.D
HG = json.load(open(os.path.join(D, "house_gov.json"), encoding="utf-8"))
NX = fit.NX
XG = fit.XG
GOV_HOLD_D, GOV_HOLD_R = 6, 8


def nat(evt_prefix):
    for k, v in HG["nat"].items():
        if k.startswith(evt_prefix): return v
    return None


def sub_mid(evt, sub):
    for m in evt["markets"]:
        if (m["sub"] or "").lower().startswith(sub.lower()): return m["mid"]


C = {
    "S": dict(p=fit.P, need_R=50 - R_HOLDOVER),                       # R control: R wins >= 19 of 35
    "H": dict(p=np.array([v["p"] for v in HG["house"].values()]), need_R=218),
    "G": dict(p=np.array([v["p"] for v in HG["gov"].values()]), need_R=None),
}
ctlH = nat("CONTROLH-2026"); ctlS = nat("CONTROLS-2026"); bop = nat("KXBALANCEPOWERCOMBO"); govw = nat("KXGOVWINS")
target = {"S": sub_mid(ctlS, "Republican"), "H": sub_mid(ctlH, "Republican"), "G": sub_mid(govw, "Republican")}
print("market P(R):", {k: round(v, 3) for k, v in target.items()})


def per_x(cham, rho):
    """P(R wins chamber | x) for each x on the grid."""
    c = C[cham]
    p = np.clip(c["p"], 1e-4, 1 - 1e-4)
    q = fit.cond_beta(p, rho)
    dist = np.zeros((len(p) + 1, NX)); dist[0] = 1
    for i in range(len(p)):
        dist[1:] = dist[1:] * (1 - q[i]) + dist[:-1] * q[i]; dist[0] *= (1 - q[i])
    if cham == "G":  # R "more governorships": R total > 25  <=> R wins >= 18 of 36
        return dist[18:].sum(0), dist
    return dist[c["need_R"]:].sum(0), dist


def implied(cham):
    f = lambda r: per_x(cham, r)[0].mean() - target[cham]
    a, b = f(0.0), f(0.98)
    if np.sign(a) == np.sign(b): return None
    return optimize.brentq(f, 0.0, 0.98, xtol=1e-3)


rho = {k: implied(k) for k in "SHG"}
print("implied rho:", {k: None if v is None else round(v, 3) for k, v in rho.items()})
curve = {k: per_x(k, rho[k] if rho[k] is not None else 0.5) for k in "SHG"}

# balance of power under a shared x
rS, rH = curve["S"][0], curve["H"][0]
model = {"Democrats sweep": ((1 - rS) * (1 - rH)).mean(), "Republicans sweep": (rS * rH).mean(),
         "D-House, R-Senate": (rS * (1 - rH)).mean(), "R-House, D-Senate": ((1 - rS) * rH).mean()}
mk_ = {m["sub"]: m["mid"] for m in bop["markets"]}
tot = sum(mk_.values())
print("\nBalance of power (shared national x, each chamber at its own implied rho):")
for k in model: print(f"  {k:<20} market {mk_[k]/tot:.3f}   model {model[k]:.3f}")

# tetrachoric Senate-House from the combo
pDH = (mk_["Democrats sweep"] + mk_["D-House, R-Senate"]) / tot
pDS = (mk_["Democrats sweep"] + mk_["R-House, D-Senate"]) / tot
pDD = mk_["Democrats sweep"] / tot
a, b = stats.norm.ppf(pDH), stats.norm.ppf(pDS)
tet = optimize.brentq(lambda r: stats.multivariate_normal.cdf([a, b], cov=[[1, r], [r, 1]]) - pDD, -0.99, 0.999)
print(f"  P(D House)={pDH:.3f} P(D Senate)={pDS:.3f} P(both)={pDD:.3f} -> Senate-House tetrachoric rho = {tet:.2f};"
      f" P(D Senate | D House) = {pDD/pDH:.3f}, P(D Senate | R House) = {(mk_['R-House, D-Senate']/tot)/(1-pDH):.3f}")
mS = 1 - rS; mH = 1 - rH
print(f"  model: P(D Senate | D House) = {((mS*mH).mean()/mH.mean()):.3f}, P(D Senate | R House) = {((mS*(1-mH)).mean()/(1-mH).mean()):.3f}")

# House seat buckets vs model
_, dH = curve["H"]
dD = dH.mean(1)[::-1]  # index = D seats
buckets = [m for m in nat("KXDHOUSESEATS")["markets"]]
print("\nHouse D seats: bucket market vs model")
for m in buckets:
    s = m["sub"]
    if s.startswith("Below"): lo, hi = 0, int(s.split()[1]) - 1
    elif s.startswith("Above"): lo, hi = int(s.split()[1]) + 1, 435
    else: lo, hi = map(int, s.split("-"))
    print(f"  {s:<10} market {m['mid']:.3f}  model {dD[lo:hi+1].sum():.3f}")

# national popular vote margin ladder -> quantile function; map x (R-good) to D margin
lad = nat("KXHOUSEPOPVOTEMARGIND")
pts = []
for m in lad["markets"]:
    import re
    g = re.match(r"(Democrats|Republicans), ≥(\d+)%", m["sub"] or "")
    if g: pts.append((int(g.group(2)) * (1 if g.group(1) == "Democrats" else -1), m["mid"]))
pts.sort()
print("\nPopular vote ladder P(D margin >= k):", pts)
out = dict(rho=rho, target=target, balance=dict(market={k: v / tot for k, v in mk_.items()}, model=model, tetra=tet),
           curves={k: curve[k][0].tolist()[::10] for k in "SHG"}, house_buckets=[dict(sub=m["sub"], mid=m["mid"]) for m in buckets],
           popvote=pts)
json.dump(out, open(os.path.join(D, "fit_all.json"), "w"), indent=1)
