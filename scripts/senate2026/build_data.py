"""Bake everything the Senate tab needs into src/senate/data.json."""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fit
from fit import mk, P, IDX, LIQ
from races import RACES, R_HOLDOVER, D_HOLDOVER

D = fit.D
OUT = sys.argv[1]
ts = json.load(open(os.path.join(D, "timeseries.json")))
pairs = json.load(open(os.path.join(D, "pairs.json")))
cal_path = os.path.join(D, "calibration.json")
cal = json.load(open(cal_path)) if os.path.exists(cal_path) else []

races = []
for st, ser, rt, held, rc, dc in RACES:
    races.append(dict(st=st, held=held, r=rc, d=dc, p=round(float(P[IDX[st]]), 4), liq=round(LIQ[st])))

combos = []


def add(name, group, want, m, kind="joint", k=None, states=None):
    combos.append(dict(name=name, group=group, want=want, kind=kind, k=k, states=states,
                       bid=m["bid"], ask=m["ask"], mid=round(m["mid"], 4), vol=round(m["vol"])))


c = mk("CONTROLS", "CONTROLS-2026")
add("R control", "Control", None, c["CONTROLS-2026-R"], kind="control")
for t, m in mk("KXRSENATEWON").items():
    n = int(t.split("AL")[-1]); add(f"R wins ≥{n} of 35 (≥{R_HOLDOVER+n} seats)", "Seat ladder", None, m, kind="atleast", k=n)


def table(ser, group, states, letter_means_R):
    for t, m in mk(ser).items():
        code = t.rsplit("-", 1)[-1]
        add(m["sub"], group, {s: ((ch == "T") == letter_means_R) for s, ch in zip(states, code)}, m)


table("KXFOURSTATESEN", "Combo: D wins of TX/AK/IA/OH", ["TX", "AK", "IA", "OH"], False)
table("KXFIVESTATESEN", "Combo: D wins of ME/MI/NH/AK/OH", ["ME", "MI", "NH", "AK", "OH"], False)
table("KXTHREESTATESEN", "Combo: R wins of NE/KS/SC", ["NE", "KS", "SC"], True)
add("D sweep GA, MI, NC, ME", "Sweeps", {"GA": False, "MI": False, "NC": False, "ME": False}, mk("KXDEMCOREFOURSENATESWEEP")["KXDEMCOREFOURSENATESWEEP-26NOV03"])
add("R sweep IA, KS, NE", "Sweeps", {"IA": True, "KS": True, "NE": True}, mk("KXGOPPLAINSSENSWEEP")["KXGOPPLAINSSENSWEEP-26NOV03"])
add("R wins ≥5 of AK/IA/KS/MI/OH/TX", "Sweeps", None, mk("KXGOPSIXSENATE")["KXGOPSIXSENATE-26NOV03-AL5"], kind="subset_atleast", k=5,
    states=["AK", "IA", "KS", "MI", "OH", "TX"])

rows = ts["rows"]
hist = dict(dates=[r["date"] for r in rows], market_D=[round(r["market_D"], 4) for r in rows],
            implied_rho=[None if r["implied_rho"] is None else round(r["implied_rho"], 3) for r in rows],
            indep_D=[round(r["indep_D"], 4) for r in rows],
            races={s: [r["races"][s] for r in rows] for s in fit.ST})

# calibration summary
calsum = {}
for kind in ["2024 general", "2026 primary/nominee"]:
    R = [r for r in cal if r["kind"] == kind and 0.005 < r["p"] and "MOV" not in r["event"]]
    if not R: continue
    bins = [[] for _ in range(10)]
    for r in R: bins[min(9, int(r["p"] * 10))].append(r)
    calsum[kind] = dict(n=len(R), brier=sum((r["p"] - r["y"]) ** 2 for r in R) / len(R),
                        bins=[dict(lo=i / 10, n=len(b), p=(sum(r["p"] for r in b) / len(b)) if b else None,
                                   hit=(sum(r["y"] for r in b) / len(b)) if b else None) for i, b in enumerate(bins)],
                        upsets=[dict(event=r["event"], name=r["name"], p=r["p"], date=r["date"]) for r in sorted([r for r in R if r["y"] == 1], key=lambda r: r["p"])[:8]])

data = dict(asof=time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), r_hold=R_HOLDOVER, d_hold=D_HOLDOVER, races=races, combos=combos,
            hist=hist, pairs=pairs, calibration=calsum,
            implied=[dict(name=r["name"], rho=r["implied_rho"], vol=r["vol"]) for r in json.load(open(os.path.join(D, "fit.json")))["beta"]["rows"]],
            fit=dict(beta_rho_joint=fit_json["beta"]["rho"], gauss_rho_joint=fit_json["gauss"]["rho"]) if (fit_json := json.load(open(os.path.join(D, "fit.json")))) else {})
HG = json.load(open(os.path.join(D, "house_gov.json"), encoding="utf-8"))
H2 = json.load(open(os.path.join(D, "history2.json")))
FA = json.load(open(os.path.join(D, "fit_all.json")))
FH = json.load(open(os.path.join(D, "fit_house.json")))


def natm(series):
    for k, v in HG["nat"].items():
        if v["series"] == series: return [dict(sub=m["sub"], bid=m["bid"], ask=m["ask"], mid=round(m["mid"], 4), vol=round(m["vol"])) for m in v["markets"]]
    return []


def clean(name):
    return None if not name else name.replace("’", "'")


house = [dict(id=k, p=v["p"], liq=v["liq"], r=clean(v.get("r")), d=clean(v.get("d")), ind=v.get("ind", False), assumed=v.get("assumed", False))
         for k, v in HG["house"].items()]
gov = [dict(st=k, p=v["p"], liq=v["liq"], r=clean(v.get("r")), d=clean(v.get("d")), combo=v.get("from_combo", False)) for k, v in HG["gov"].items()]
data["house"] = dict(races=house, buckets=natm("KXDHOUSESEATS"), control=natm("CONTROLH"), shift=FH)
data["gov"] = dict(races=gov, hold=dict(D=["DE", "KY", "NJ", "NC", "VA", "WA"], R=["IN", "LA", "MS", "MO", "MT", "ND", "UT", "WV"]),
                   wins=natm("KXGOVWINS"), swing_sweep=natm("KXDEMSWINGSTATEGOVSWEEP"))
data["nat"] = dict(balance=natm("KXBALANCEPOWERCOMBO"), popvote=FA["popvote"], fit_all=dict(rho=FA["rho"], balance=FA["balance"]),
                   ne_sweep=natm("KXDEMNEWENGLANDSWEEP"))
data["hist2"] = H2
json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB;", len(combos), "combo/ladder markets; hist days", len(rows), "; cal kinds", list(calsum))
