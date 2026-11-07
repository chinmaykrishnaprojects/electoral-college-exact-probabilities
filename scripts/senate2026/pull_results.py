"""Settled 2026 results + daily price history for every Senate/House/Governor race -> data/results.json.

For each race: who won (R or not), when the market closed (= Kalshi's call time), and the daily
R-price path. Plus hourly election-night prices for the three control markets.
"""
import json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get
from races import RACES

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
HG = json.load(open(os.path.join(D, "house_gov.json"), encoding="utf-8"))
ST = int(time.mktime((2025, 9, 1, 0, 0, 0, 0, 0, 0)))
EN = int(time.mktime((2026, 11, 6, 0, 0, 0, 0, 0, 0)))


def ts(s):
    return int(time.mktime(time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S"))) - time.timezone if s else None


def event_markets(ev):
    for path in (f"/markets?event_ticker={ev}&limit=200", f"/historical/markets?event_ticker={ev}&limit=200"):
        try:
            ms = get(path, use_cache=False).get("markets", [])
        except Exception:
            ms = []
        if ms:
            return ms
    return []


def candles(series, ticker, period=1440, st=ST, en=EN):
    paths = [f"/series/{series}/markets/{ticker}/candlesticks?start_ts={st}&end_ts={en}&period_interval={period}",
             f"/historical/markets/{ticker}/candlesticks?start_ts={st}&end_ts={en}&period_interval={period}"]
    for path in paths:
        try:
            cs = get(path, use_cache=False).get("candlesticks", [])
        except Exception:
            cs = []
        if cs:
            break
    rows = []
    for c in cs:
        def fx(k):
            o = c.get(k) or {}
            v = o.get("close_dollars", o.get("close"))
            if v in (None, ""):
                return None
            v = float(v)
            return v / 100 if v > 1.0001 else v
        b, a, p = fx("yes_bid"), fx("yes_ask"), fx("price")
        mid = (b + a) / 2 if b is not None and a is not None and 0 < a and a - b < 0.2 else p
        if mid is None:
            continue
        rows.append([c["end_period_ts"], round(mid, 4)])
    return rows


def race_job(args):
    chamber, key, ev, rticks, series, p0, combo = args
    ms = event_markets(ev) if ev else []
    won_r, call, why = None, None, ""
    if combo:  # AK governor: combo codes ...-REP / -DEM for the governor's party
        yes = [m for m in ms if m.get("result") == "yes"]
        if yes:
            won_r = bool(re.search(r"REP[A-Z]*$", yes[0]["ticker"]))
            why = yes[0]["ticker"]
    elif ms:
        rs = [m for m in ms if m["ticker"] in rticks]
        if any(m.get("result") == "yes" for m in rs):
            won_r = True
        elif any(m.get("result") == "yes" for m in ms):
            won_r = False
        elif rs and all(m.get("result") == "no" for m in rs) and any(m.get("status") in ("finalized", "settled") for m in rs):
            won_r = False
        yes = [m for m in ms if m.get("result") == "yes"]
        why = (yes[0].get("yes_sub_title") or yes[0]["ticker"]) if yes else ""
    closes = [ts(m.get("close_time")) for m in ms if m.get("result") in ("yes", "no")]
    call = min(closes) if closes else None
    status = sorted({m.get("status") for m in ms})
    hist = candles(series, rticks[0]) if rticks and series else []
    return dict(ch=chamber, key=key, p=p0, won_r=won_r, call=call, winner=why, status=status, hist=hist)


jobs = []
for st, ser, rt, *_ in RACES:
    jobs.append(("senate", st, rt.rsplit("-", 1)[0], [rt], ser, None, False))
for k, v in HG["house"].items():
    jobs.append(("house", k, v.get("event"), v["tickers"], v.get("series"), v["p"], False))
for k, v in HG["gov"].items():
    jobs.append(("gov", k, v.get("event"), v["tickers"], v.get("series"), v["p"], bool(v.get("from_combo"))))

with ThreadPoolExecutor(6) as ex:
    races = list(ex.map(race_job, jobs))

unk = [(r["ch"], r["key"], r["status"]) for r in races if r["won_r"] is None]
print("races:", len(races), "unresolved:", len(unk), unk[:20])
for ch in ("senate", "house", "gov"):
    rs = [r for r in races if r["ch"] == ch]
    print(ch, "R wins", sum(1 for r in rs if r["won_r"]), "of", len(rs), " with history", sum(1 for r in rs if r["hist"]))

# election-night hourly control prices (Nov 3 18:00 ET -> Nov 5 noon ET)
n0 = int(time.mktime((2026, 11, 3, 22, 0, 0, 0, 0, 0))) - time.timezone
n1 = int(time.mktime((2026, 11, 5, 17, 0, 0, 0, 0, 0))) - time.timezone
night = {}
for name, ser, tk in [("senate", "CONTROLS", "CONTROLS-2026-D"), ("house", "CONTROLH", "CONTROLH-2026-D")]:
    night[name] = candles(ser, tk, 60, n0, n1)
gw = HG["nat"].get("KXGOVWINS-26") or next((v for k, v in HG["nat"].items() if v["series"] == "KXGOVWINS"), None)
if gw:
    for m in gw["markets"]:
        night["gov|" + m["sub"]] = candles("KXGOVWINS", m["ticker"], 60, n0, n1)
        print("gov night", m["sub"], len(night["gov|" + m["sub"]]))
ctl = {}
for name, ev in [("senate", "CONTROLS-2026"), ("house", "CONTROLH-2026")]:
    ms = event_markets(ev)
    ctl[name] = [dict(t=m["ticker"], res=m.get("result"), close=ts(m.get("close_time"))) for m in ms]
print({k: len(v) for k, v in night.items()}, ctl)
json.dump(dict(races=races, night=night, control=ctl, pulled=time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())),
          open(os.path.join(D, "results.json"), "w"))
