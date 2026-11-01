"""Calibration of Kalshi Senate-related markets that already settled:
   2024 general (SENATExx-24) and 2026 primaries/nominee markets. Price = daily mid 2 days before close."""
import json, os, sys, re, time, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ser = get("/series?category=Elections").get("series", [])
tick = [s["ticker"] for s in ser if re.match(r"^(SENATE|KXSENATE)", s["ticker"])]
rows = []


def ts(s):
    return int(dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())


for t in tick:
    try:
        evs = get(f"/events?series_ticker={t}&status=settled&with_nested_markets=true&limit=200").get("events", [])
    except Exception as e:
        continue
    for e in evs:
        et = e["event_ticker"]
        kind = "2024 general" if re.match(r"^SENATE[A-Z]+-24", et) else "2026 primary/nominee" if ("-26" in et and t.startswith("KXSENATE") and t[-1] in "RD") else None
        if not kind: continue
        for m in (e.get("markets") or get(f"/historical/markets?event_ticker={et}&limit=200").get("markets", [])):
            res = m.get("result")
            if res not in ("yes", "no"): continue
            # election day: use 'occurrence'/'close' minus padding; settle can be weeks after. Use day before the first big volume? keep simple:
            ref = e.get("strike_date") or m.get("expected_expiration_time") or m["close_time"]
            end = ts(m.get("close_time"))
            try:
                q = f"start_ts={end-86400*120}&end_ts={end}&period_interval=1440"
                c = []
                for path in (f"/historical/markets/{m['ticker']}/candlesticks?{q}", f"/series/{t}/markets/{m['ticker']}/candlesticks?{q}"):
                    try:
                        c = get(path).get("candlesticks", [])
                    except Exception:
                        c = []
                    if c: break
            except Exception:
                continue
            pts = []
            for x in c:
                g = lambda k: (x.get(k) or {}).get("close_dollars", (x.get(k) or {}).get("close"))
                b, a, p = g("yes_bid"), g("yes_ask"), g("price")
                b, a, p = [float(v) if v not in (None, "") else None for v in (b, a, p)]
                mid = (b + a) / 2 if b is not None and a and a - b < 0.25 else p
                if mid is not None: pts.append((x["end_period_ts"], mid, float(x.get("volume_fp") or x.get("volume") or 0)))
            if len(pts) < 3: continue
            # pre-resolution price: last point before price snaps to 0/1 -- take the last day whose mid is in (0.02,0.98) or the
            # point before the max-volume day (election day spike)
            if kind == "2024 general":
                eve = [x for x in pts if x[0] <= 1730782800]  # close of Nov 4 2024 ET
                if not eve: continue
                pre = eve[-1]
            else:
                vmax_i = max(range(len(pts)), key=lambda i: pts[i][2])
                pre = pts[max(0, vmax_i - 1)]
            rows.append(dict(kind=kind, event=et, ticker=m["ticker"], name=m.get("yes_sub_title"), p=pre[1],
                             date=time.strftime("%Y-%m-%d", time.gmtime(pre[0])), y=1 if res == "yes" else 0))
    print(t, len(rows), flush=True)

json.dump(rows, open(os.path.join(D, "calibration.json"), "w"), indent=0)
import collections
for kind in ["2024 general", "2026 primary/nominee"]:
    R = [r for r in rows if r["kind"] == kind and r["p"] > 0.005]
    if not R: continue
    brier = sum((r["p"] - r["y"]) ** 2 for r in R) / len(R)
    print(f"\n{kind}: n={len(R)} brier={brier:.4f}")
    bins = collections.defaultdict(list)
    for r in R: bins[min(9, int(r["p"] * 10))].append(r)
    for b in sorted(bins):
        L = bins[b]; print(f"  {b/10:.1f}-{(b+1)/10:.1f}: n={len(L):3d} mean p={sum(r['p'] for r in L)/len(L):.3f} hit={sum(r['y'] for r in L)/len(L):.3f}")
    ups = sorted([r for r in R if r["y"] == 1], key=lambda r: r["p"])[:8]
    print("  biggest upsets:", [(r["event"], r["name"], round(r["p"], 3), r["date"]) for r in ups])
