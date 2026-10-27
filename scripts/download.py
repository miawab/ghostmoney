"""Download every State Bank unclaimed-deposit list in data/sbp-sources.json into raw/<year>/.

Three files at a time, retries, writes to .part and renames so a broken download is never
mistaken for a finished one. Skips files already on disk. Year comes from the page section,
or from the file name when the page didn't label it.
"""
import json, os, re, sys, time, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130"

def year_of(row):
    if row["year"]:
        return row["year"]
    m = re.search(r"(19|20)\d\d", row["url"].rsplit("/", 1)[-1])
    return m.group(0) if m else "unknown"

def sources():
    raw = json.load(open(os.path.join(ROOT, "data", "sbp-sources.json"), encoding="utf8"))
    return json.loads(raw) if isinstance(raw, str) else raw

def fetch(row):
    y = year_of(row)
    name = row["url"].rsplit("/", 1)[-1]
    dest = os.path.join(ROOT, "raw", y, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(4):
        try:
            req = urllib.request.Request(row["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r, open(dest + ".part", "wb") as f:
                want = int(r.headers.get("Content-Length") or 0)
                while chunk := r.read(1 << 16):
                    f.write(chunk)
            got = os.path.getsize(dest + ".part")
            if want and got != want:  # the server sometimes ends a big file early without an error
                raise IOError(f"short read {got} of {want}")
            if name.lower().endswith((".xlsx", ".zip")) and not zipfile.is_zipfile(dest + ".part"):
                raise IOError("not a whole zip")
            os.replace(dest + ".part", dest)
            return True
        except Exception as e:
            err = e
            time.sleep(3 * (attempt + 1))
    print("FAIL", y, row["url"], err, flush=True)
    return False

def main():
    rows = sources()
    with ThreadPoolExecutor(3) as pool:
        results = list(pool.map(fetch, rows))
    print(f"done: {sum(results)} ok, {len(results) - sum(results)} failed", flush=True)

if __name__ == "__main__":
    sys.exit(main())
