"""List Kalshi election series for House, governors and cross-chamber combos (open events only)."""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kalshi import get

ser = get("/series?category=Elections").get("series", []) + get("/series?category=Politics").get("series", [])
seen = set()
pat = re.compile(r"house|governor|gov|congress|trifecta|balance|control|power|midterm|district|ballot", re.I)
out = []
for s in ser:
    t = s["ticker"]
    if t in seen: continue
    seen.add(t)
    txt = f'{t} {s.get("title","")}'
    if pat.search(txt) and not re.search(r"chile|italy|kenya|nigeria|paraguay|czech|dominican|brazil|uk |canada|japan|india|germany|france|australia|philipp|mayor|pope", txt, re.I):
        out.append((t, s.get("title", "")))
print(len(out))
for t, ti in sorted(out):
    print(t, "|", ti)
