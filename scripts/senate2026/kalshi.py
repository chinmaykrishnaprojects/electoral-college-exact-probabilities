"""Tiny Kalshi public-API client with backoff + disk cache."""
import json, os, time, hashlib, urllib.request, urllib.error

BASE = "https://api.elections.kalshi.com/trade-api/v2"
CACHE = os.environ.get("KCACHE", os.path.join(os.path.dirname(__file__), "data", "cache"))
os.makedirs(CACHE, exist_ok=True)


def get(path, use_cache=True):
    url = path if path.startswith("http") else BASE + path
    key = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + ".json")
    if use_cache and os.path.exists(key):
        return json.load(open(key, encoding="utf-8"))
    delay = 1.0
    for _ in range(8):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode("utf-8"))
            json.dump(d, open(key, "w", encoding="utf-8"))
            time.sleep(0.15)
            return d
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(delay); delay *= 2; continue
            raise
    raise RuntimeError("rate limited: " + url)
