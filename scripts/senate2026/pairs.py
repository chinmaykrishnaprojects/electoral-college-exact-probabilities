"""Pairwise implied (tetrachoric) correlations from Kalshi joint tables + marginal consistency."""
import json, os, sys, itertools
import numpy as np
from scipy import stats, optimize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fit
from fit import mk, P, IDX

out = {"combos": [], "pairs": [], "govsen": []}


def tetra(p1, p2, p11):
    """Gaussian-copula rho s.t. P(A&B)=p11 given P(A)=p1, P(B)=p2."""
    a, b = stats.norm.ppf(p1), stats.norm.ppf(p2)
    f = lambda r: stats.multivariate_normal.cdf([a, b], cov=[[1, r], [r, 1]]) - p11
    lo, hi = f(-0.99), f(0.995)
    if np.sign(lo) == np.sign(hi):
        return 0.995 if hi < 0 else -0.99
    return optimize.brentq(f, -0.99, 0.995, xtol=1e-3)


def table(ser, states, letter_means_D):
    ms = mk(ser)
    cells = {}
    for k, v in ms.items():
        code = k.rsplit("-", 1)[-1]
        cells[tuple(((ch == "T") == letter_means_D) for ch in code)] = v["mid"]  # True = D wins
    s = sum(cells.values())
    print(f"\n{ser}: {len(cells)} cells, sum of mids = {s:.3f} (overround {100*(s-1):+.1f}%)")
    cells = {k: v / s for k, v in cells.items()}
    rec = dict(series=ser, states=states, overround=s - 1, marg={}, pairs=[])
    for i, st in enumerate(states):
        m = sum(v for k, v in cells.items() if k[i])
        single = 1 - P[IDX[st]]
        rec["marg"][st] = dict(combo=m, single=single)
        print(f"  P({st} D): combo {m:.3f}  single {single:.3f}  diff {m-single:+.3f}")
    for i, j in itertools.combinations(range(len(states)), 2):
        pi = sum(v for k, v in cells.items() if k[i]); pj = sum(v for k, v in cells.items() if k[j])
        pij = sum(v for k, v in cells.items() if k[i] and k[j])
        r = tetra(pi, pj, pij)
        rec["pairs"].append(dict(a=states[i], b=states[j], rho=r))
        print(f"  {states[i]}-{states[j]}: P(both D) {pij:.3f} vs indep {pi*pj:.3f}  -> implied rho {r:.2f}")
    out["combos"].append(rec)


table("KXFOURSTATESEN", ["TX", "AK", "IA", "OH"], True)
table("KXFIVESTATESEN", ["ME", "MI", "NH", "AK", "OH"], True)
table("KXTHREESTATESEN", ["NE", "KS", "SC"], False)

print("\nGovernor-Senate combos (same state):")
for st in ["ME", "OH", "TX", "MN", "GA", "MI", "AK", "NE", "KS", "IA", "NH", "FL"]:
    ser = f"KX{st}SENGOVCOMBO"
    if ser not in fit.ev: continue
    ms = mk(ser); s = sum(v["mid"] for v in ms.values())
    c = {k.rsplit("-", 1)[-1]: v["mid"] / s for k, v in ms.items()}
    # code = GOV then SEN party, DEM/REP/IND
    senD = sum(v for k, v in c.items() if not k.endswith("REP"))
    govD = sum(v for k, v in c.items() if k.startswith("DEM"))
    both = sum(v for k, v in c.items() if k.startswith("DEM") and not k.endswith("REP"))
    r = tetra(govD, senD, both)
    single = 1 - P[IDX[st]]
    out["govsen"].append(dict(st=st, senD_combo=senD, senD_single=single, govD=govD, rho=r, overround=s - 1))
    print(f"  {st}: Sen non-R combo {senD:.3f} vs single {single:.3f} | Gov D {govD:.3f} | gov-sen rho {r:.2f} | overround {100*(s-1):+.1f}%")

json.dump(out, open(os.path.join(fit.D, "pairs.json"), "w"), indent=1)
