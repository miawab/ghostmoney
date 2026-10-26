"""Download every State Bank unclaimed-deposit list in data/sbp-sources.json into raw/<year>/.

Polite: one file at a time, skips files already on disk. Year comes from the page section,
or from the file name when the page didn't label it.
"""
import json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130"

def year_of(row):
    if row["year"]:
        return row["year"]
    m = re.search(r"(19|20)\d\d", row["url"].rsplit("/", 1)[-1])
    return m.group(0) if m else "unknown"

def main():
    raw = json.load(open(os.path.join(ROOT, "data", "sbp-sources.json"), encoding="utf8"))
    rows = json.loads(raw) if isinstance(raw, str) else raw
    ok = fail = 0
    for row in rows:
        y = year_of(row)
        name = row["url"].rsplit("/", 1)[-1]
        dest = os.path.join(ROOT, "raw", y, name)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            ok += 1
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            req = urllib.request.Request(row["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
                f.write(r.read())
            ok += 1
        except Exception as e:
            fail += 1
            print("FAIL", y, row["url"], e, flush=True)
        time.sleep(0.3)
    print(f"done: {ok} ok, {fail} failed", flush=True)

if __name__ == "__main__":
    sys.exit(main())
