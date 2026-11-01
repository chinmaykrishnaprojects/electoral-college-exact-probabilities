"""House (435 districts), governors (36) and national/cross-chamber markets -> data/house_gov.json.
P(R) per race = sum of mids of markets whose rules name the Republican Party / total of mids."""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
APP = dict(AL=7, AK=1, AZ=9, AR=4, CA=52, CO=8, CT=5, DE=1, FL=28, GA=14, HI=2, ID=2, IL=17, IN=9, IA=4, KS=4, KY=6, LA=6, ME=2,
           MD=8, MA=9, MI=13, MN=8, MS=4, MO=8, MT=2, NE=3, NV=4, NH=2, NJ=12, NM=3, NY=26, NC=14, ND=1, OH=15, OK=5, OR=6, PA=17,
           RI=2, SC=7, SD=1, TN=9, TX=38, UT=4, VT=1, VA=11, WA=10, WV=2, WI=8, WY=1)
GOV26 = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "FL", "GA", "HI", "ID", "IL", "IA", "KS", "ME", "MD", "MA", "MI", "MN", "NE", "NV",
         "NH", "NM", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "VT", "WI", "WY"]
assert len(GOV26) == 36
FRESH = "--fresh" in sys.argv


def f(x):
    try: return float(x)
    except Exception: return None


def mid(m):
    b, a, l = f(m.get("yes_bid_dollars")), f(m.get("yes_ask_dollars")), f(m.get("last_price_dollars"))
    if b is not None and a is not None and a > 0 and a - b < 0.25: return (b + a) / 2
    return l or 0.0


def party(m):
    t = (m.get("rules_primary") or "") + " " + (m.get("title") or "")
    if m["ticker"].endswith("-R") or re.search(r"Republican", t): return "R"
    if m["ticker"].endswith("-D") or re.search(r"Democrat", t): return "D"
    return "I"


def race_from(ms):
    tot = sum(mid(m) for m in ms)
    if tot <= 0: return None
    pr = sum(mid(m) for m in ms if party(m) == "R") / tot
    cands = {party(m): m.get("yes_sub_title") for m in sorted(ms, key=mid, reverse=True)}
    return dict(p=round(pr, 4), liq=round(sum(f(m.get("volume_fp")) or 0 for m in ms)),
                r=cands.get("R"), d=cands.get("D") or cands.get("I"), ind=any(party(m) == "I" and mid(m) > 0.05 for m in ms),
                tickers=[m["ticker"] for m in ms if party(m) == "R"])


def open_events(series):
    try:
        return get(f"/events?series_ticker={series}&status=open&with_nested_markets=true&limit=50", use_cache=not FRESH).get("events", [])
    except Exception:
        return []


# ---------------- House
evs = []
cur = ""
for _ in range(20):
    d = get(f"/events?series_ticker=KXHOUSERACE&status=open&with_nested_markets=true&limit=200" + (f"&cursor={cur}" if cur else ""), use_cache=not FRESH)
    evs += d.get("events", []); cur = d.get("cursor") or ""
    if not cur: break
house = {}
for e in evs:
    m = re.match(r"KXHOUSERACE-([A-Z]{2})(\d\d|AL)-26$", e["event_ticker"])
    if not m: continue
    key = f"{m.group(1)}-{'AL' if m.group(2) == 'AL' else int(m.group(2))}"
    r = race_from(e["markets"])
    if r: house[key] = dict(r, series="KXHOUSERACE", event=e["event_ticker"])

missing = []
for st, n in APP.items():
    for k in (["AL"] if n == 1 else range(1, n + 1)):
        key = f"{st}-{k}"
        if key in house: continue
        cands = [f"HOUSE{st}{k}", f"KXHOUSE{st}{k}", f"KXHOUSE{st}{k:02d}" if k != "AL" else None, f"HOUSE{st}{k:02d}" if k != "AL" else None,
                 f"HOUSEPARTY-{st}{k:02d}" if k != "AL" else None]
        if k == "AL": cands += [f"HOUSE{st}AL", f"KXALASKAHOUSE" if st == "AK" else None]
        if st == "AK": cands += ["HOUSEAKAL", "KXALASKAHOUSE"]
        got = None
        for s in [c for c in cands if c]:
            for e in open_events(s):
                if "26" not in e["event_ticker"] and "2026" not in (e.get("sub_title") or ""): continue
                r = race_from(e["markets"])
                if r and len(e["markets"]) >= 2:
                    got = dict(r, series=s, event=e["event_ticker"]); break
            if got: break
        if got: house[key] = got
        else: missing.append(key)
print("house districts priced:", len(house), " missing:", missing)

# ---------------- Governors
gov = {}
for st in GOV26:
    for s in [f"GOVPARTY{st}", f"GOVPARTY-{st}"]:
        for e in open_events(s):
            if not re.search(r"-26|-27|2026", e["event_ticker"] + (e.get("sub_title") or "")): continue
            r = race_from(e["markets"])
            if r: gov[st] = dict(r, series=s, event=e["event_ticker"]); break
        if st in gov: break
for st in [s for s in GOV26 if s not in gov]:  # fall back to the Senate-governor combo (codes DEMxxx = D governor)
    for e in open_events(f"KX{st}SENGOVCOMBO"):
        ms = e["markets"]; tot = sum(mid(m) for m in ms)
        if tot > 0:
            pr = sum(mid(m) for m in ms if re.search(r"-REP[A-Z]*$", m["ticker"])) / tot
            gov[st] = dict(p=round(pr, 4), liq=round(sum(f(m.get("volume_fp")) or 0 for m in ms)), r=None, d=None, ind=False, tickers=[],
                           series=f"KX{st}SENGOVCOMBO", event=e["event_ticker"], from_combo=True)
            break
# CA districts dropped by the new map have no market: Kalshi prices D at 48 of 52 CA seats -> treat as safe D
for key in missing:
    if key.startswith("CA-"):
        house[key] = dict(p=0.01, liq=0, r=None, d=None, ind=False, tickers=[], series=None, event=None, assumed=True)
missing = [k for k in missing if not k.startswith("CA-")]
print("governors priced:", len(gov), " missing:", [s for s in GOV26 if s not in gov])

# ---------------- national / cross-chamber
nat = {}
for s in ["CONTROLH", "CONTROLS", "KXBALANCEPOWERCOMBO", "KXDHOUSESEATS", "KXHOUSEPOPVOTEMARGIND", "KXGOVWINS", "KXDEMSWINGSTATEGOVSWEEP",
          "KXGENERICBALLOT", "KXDEMTRIFECTA2026", "KXDEMNEWENGLANDSWEEP"]:
    for e in open_events(s):
        if re.search(r"-28|-29|2028", e["event_ticker"]): continue
        nat[e["event_ticker"]] = dict(series=s, title=e["title"], markets=[dict(ticker=m["ticker"], sub=m.get("yes_sub_title"), bid=f(m.get("yes_bid_dollars")),
                                                                                  ask=f(m.get("yes_ask_dollars")), mid=mid(m), vol=f(m.get("volume_fp")) or 0,
                                                                                  rules=m.get("rules_primary", "")[:300]) for m in e["markets"]])
for k, v in nat.items():
    print(k, "|", v["title"][:60], "|", "; ".join(f"{(m['sub'] or '')[:22]}={m['mid']:.3f}" for m in v["markets"][:14]))

json.dump(dict(asof=time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), house=house, gov=gov, nat=nat),
          open(os.path.join(D, "house_gov.json"), "w", encoding="utf-8"), ensure_ascii=False)
ER = sum(v["p"] for v in house.values())
print(f"E[R House seats] from districts = {ER:.1f} (+ unpriced {len(missing)})")
