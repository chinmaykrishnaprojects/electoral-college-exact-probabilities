"""Daily history for House control, governorships and the Congress balance-of-power combo -> data/history2.json."""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
HG = json.load(open(os.path.join(D, "house_gov.json"), encoding="utf-8"))
end = int(time.time()); st = end - 86400 * 420


def candles(series, ticker):
    d = get(f"/series/{series}/markets/{ticker}/candlesticks?start_ts={st}&end_ts={end}&period_interval=1440", use_cache=False)
    rows = []
    for c in d.get("candlesticks", []):
        g = lambda k: (c.get(k) or {}).get("close_dollars")
        b, a, p = [float(v) if v not in (None, "") else None for v in (g("yes_bid"), g("yes_ask"), g("price"))]
        mid = (b + a) / 2 if b is not None and a is not None and 0 < a and a - b < 0.2 else p
        if mid is not None:
            rows.append([time.strftime("%Y-%m-%d", time.gmtime(c["end_period_ts"])), round(mid, 4)])
    return rows


out = {}
for evt, v in HG["nat"].items():
    if v["series"] not in ("CONTROLH", "KXGOVWINS", "KXBALANCEPOWERCOMBO"): continue
    for m in v["markets"]:
        out[f'{v["series"]}|{m["sub"]}'] = candles(v["series"], m["ticker"])
        print(v["series"], m["sub"], len(out[f'{v["series"]}|{m["sub"]}']))
json.dump(out, open(os.path.join(D, "history2.json"), "w"))
