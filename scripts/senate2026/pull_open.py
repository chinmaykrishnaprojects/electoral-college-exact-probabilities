import sys, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ser = get("/series?category=Elections").get("series", [])
pat = re.compile(r"^(SENATE|KXSENATE|CONTROLS|KX.*SEN|KXGOPSIXSENATE|KXHARRISSTATEGOP|KXUSINDEPENDENT|KXAPCALLSENATE)")
tick = [s["ticker"] for s in ser if pat.match(s["ticker"]) and "senate" in (s.get("title", "") + s["ticker"]).lower()
        and not re.search(r"CHILE|ITALY|KENYA|NIGERIA|PARAGUAY|CZECH|DOMINICAN|SAOPAULO|BRIS", s["ticker"])]
print("series to pull", len(tick))
out = {}
for t in tick:
    d = get(f"/events?series_ticker={t}&status=open&with_nested_markets=true&limit=200")
    evs = d.get("events", [])
    if evs:
        out[t] = evs
json.dump(out, open(os.path.join(OUT, "senate_open.json"), "w", encoding="utf-8"))
for t, evs in out.items():
    for e in evs:
        ms = e.get("markets", [])
        vol = sum(m.get("volume", 0) or 0 for m in ms)
        line = "; ".join(f"{m.get('yes_sub_title') or m['ticker']}={m.get('last_price')}/{m.get('yes_bid')}-{m.get('yes_ask')}" for m in ms[:6])
        print(f"{e['event_ticker']:<28} vol={vol:<9} {e['title'][:50]:<50} | {line[:160]}")
