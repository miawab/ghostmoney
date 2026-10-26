"""Download the prebuilt search index (a GitHub release file) into data/index/site/. Used by the Render build.

The index is built from the State Bank's public lists by scripts/download.py, parse.py and build_index.py;
it's too big for the git repo, so it ships as a release file instead.

usage: python scripts/fetch_index.py [release-tag]
"""
import os, sys, tarfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("INDEX_TAG", "index-v1")
URL = f"https://github.com/miawab/ghostmoney/releases/download/{TAG}/ghostmoney-index.tar"


def main():
    dest = os.path.join(ROOT, "data", "index")
    os.makedirs(dest, exist_ok=True)
    tmp = os.path.join(dest, "index.tar")
    print("downloading", URL, flush=True)
    urllib.request.urlretrieve(URL, tmp)
    with tarfile.open(tmp) as t:
        for m in t.getmembers():  # only plain files under site/
            if not m.isfile() or not m.name.startswith("site/") or ".." in m.name:
                raise SystemExit(f"unexpected entry in index archive: {m.name}")
        t.extractall(dest, filter="data")
    os.remove(tmp)
    print("index ready:", len(os.listdir(os.path.join(dest, "site", "shards"))), "shards", flush=True)


if __name__ == "__main__":
    main()
