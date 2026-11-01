"""Daily close (bid/ask mid) for each race's R market + Senate control, since 2025-09."""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get
from races import RACES

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "history.json")
end = int(time.time())
st = end - 86400 * 420


def candles(series, ticker):
    d = get(f"/series/{series}/markets/{ticker}/candlesticks?start_ts={st}&end_ts={end}&period_interval=1440", use_cache=False)
    rows = []
    for c in d.get("candlesticks", []):
        def fx(k):
            v = (c.get(k) or {}).get("close_dollars")
            return float(v) if v not in (None, "") else None
        b, a, p = fx("yes_bid"), fx("yes_ask"), fx("price")
        mid = (b + a) / 2 if b is not None and a is not None and 0 < a and a - b < 0.2 else p
        if mid is None:
            continue
        rows.append([time.strftime("%Y-%m-%d", time.gmtime(c["end_period_ts"])), round(mid, 4), float(c.get("volume_fp") or 0)])
    return rows


hist = {"CONTROL_D": candles("CONTROLS", "CONTROLS-2026-D")}
for st_, ser, rt, *_ in RACES:
    try:
        hist[st_] = candles(ser, rt)
    except Exception as e:
        print("fail", st_, e); hist[st_] = []
    print(st_, len(hist[st_]), hist[st_][0][0] if hist[st_] else "-", hist[st_][-1] if hist[st_] else "-")
json.dump(hist, open(OUT, "w"))
