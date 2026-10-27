"""Build the search index the site serves: data/ghostmoney-index.tar holding site/shards/<n>.json.gz + stats.json.

Every person row is written to the shard of each of its name keys (gm.names.keys). The browser works
out the keys for a name on its own and downloads only those shards, so the server learns a shard
number shared by thousands of names, never the name itself.

CNICs are not shipped whole: a shard row carries the last 4 digits and a short hash, so the page can
confirm a CNIC the family types in without publishing every number again.

usage: python -I scripts/build_index.py [years...]   (e.g. 2023 2024 2025 for a smaller demo index)
"""
import csv, glob, gzip, hashlib, io, json, os, sys, tarfile, zlib
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from gm.names import parse_name, keys, skeleton, cnic_digits  # noqa: E402
from gm.banks import canonical  # noqa: E402

csv.field_size_limit(10_000_000)
SHARDS = 4096
OUT = os.path.join(ROOT, "data", "index", "site")
YEARS = sys.argv[1:]
PLACEHOLDER = {"PAY ORDER", "UNAVAILABLE", "CD MISC", "NA", "N A", "UNKNOWN", "NOT AVAILABLE", "DEMAND DRAFT", "CALL DEPOSIT"}


def shard_of(key):
    return zlib.crc32(key.encode()) % SHARDS


def cnic_hash(d):
    return hashlib.sha256(("ghostmoney:" + d).encode()).hexdigest()[:10] if d else ""


def walk(stats):
    """Every person row, once: (year, bank, now, amt, parsed name, raw name, csv row). Fills in stats as it goes."""
    seen = set()
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "index", "rows-*.csv.gz"))):
        year = os.path.basename(path)[5:9]
        if YEARS and year not in YEARS:
            continue
        ycount = [0, 0.0]
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                stats["rows"] += 1
                try:
                    amt = float(r["amount_pkr"] or 0)
                except ValueError:
                    amt = 0.0
                bank, now = canonical(r["bank"] or r["file"])
                if r["account"]:  # the same account listed again in a later year's list
                    sig = hash((bank, r["account"], r["instrument_no"], r["amount_pkr"], r["name"].upper()))
                    if sig in seen:
                        stats["duplicates"] += 1
                        continue
                    seen.add(sig)
                stats["pkr_total"] += amt
                ycount[0] += 1
                ycount[1] += amt
                stats["by_bank"][bank][0] += 1
                stats["by_bank"][bank][1] += amt
                raw = r["name"].strip()
                p = parse_name(raw)
                if not p["own"] or " ".join(p["own"]) in PLACEHOLDER or raw.upper().strip(". ") in PLACEHOLDER:
                    stats["unnamed"] += 1
                    continue
                if p["business"]:
                    stats["businesses"] += 1
                    continue
                stats["people"] += 1
                stats["pkr_people"] += amt
                stats["over_100k"] += amt > 100000
                stats["with_father"] += bool(p["father"])
                yield year, bank, now, amt, p, raw, r
        stats["by_year"][year] = ycount
        print(year, ycount[0], f"{ycount[1] / 1e9:.2f} bn", flush=True)


def new_stats():
    return {"rows": 0, "people": 0, "businesses": 0, "unnamed": 0, "duplicates": 0, "pkr_total": 0.0,
            "pkr_people": 0.0, "by_year": {}, "by_bank": defaultdict(lambda: [0, 0.0]), "with_cnic": 0,
            "with_father": 0, "over_100k": 0, "shards": SHARDS}


def add(tar, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))


def full_name(p):
    return " ".join(sorted(skeleton(t) for t in p["own"]))


def main():
    # Pass 1: how many people share each exact name (a match on a rare name means more).
    stats = new_stats()
    freq = defaultdict(int)
    for *_, p, _raw, _r in walk(stats):
        freq[full_name(p)] += 1
    # Pass 2: each shard is a gzip stream kept in memory (a small compressor per shard), so the
    # whole index is built in one pass without an uncompressed copy on disk.
    zs = [zlib.compressobj(6, zlib.DEFLATED, 31, memLevel=2) for _ in range(SHARDS)]
    out = [[] for _ in range(SHARDS)]
    started = bytearray(SHARDS)
    rid = 0
    for year, bank, now, amt, p, raw, r in walk(new_stats()):
        c = cnic_digits(r["cnic"])
        stats["with_cnic"] += bool(c)
        rid += 1
        row = {
            "i": rid, "y": year, "b": bank, "n": raw[:90],
            "o": p["own"], "f": p["father"], "rel": p["relation"],
            "br": r["branch"][:60], "bc": r["branch_code"][:8], "pr": r["province"][:24].title(),
            "ad": r["address"][:80], "k": r["nature"][:30], "in": r["instrument"][:24],
            "a": round(amt, 2), "cur": r["currency"][:12], "la": r["last_activity"][:10],
            "ac": r["account"][-4:] if r["account"] else "",
            "c4": c[-4:] if c else "", "ch": cnic_hash(c), "cl": len(c), "fq": freq[full_name(p)],
        }
        if now:
            row["now"] = now
        line = json.dumps(row, separators=(",", ":"), ensure_ascii=False).encode()
        ks = keys(p["own"]) or ["+".join(sorted(skeleton(t) for t in p["own"]))]
        for s in {shard_of(k) for k in ks}:
            chunk = zs[s].compress((b"," if started[s] else b"[") + line)
            if chunk:
                out[s].append(chunk)
            started[s] = 1

    stats["by_bank"] = {k: v for k, v in sorted(stats["by_bank"].items(), key=lambda x: -x[1][1])}
    # Written straight into the release tar (site/shards/<n>.json.gz + site/stats.json);
    # scripts/fetch_index.py unpacks it into data/index/.
    tar_path = os.path.join(ROOT, "data", "ghostmoney-index-" + "-".join(YEARS) + ".tar" if YEARS else "ghostmoney-index.tar")
    size = 0
    with tarfile.open(tar_path + ".part", "w") as tar:
        for s in range(SHARDS):
            out[s].append(zs[s].compress(b"]" if started[s] else b"[]"))
            out[s].append(zs[s].flush())
            add(tar, f"site/shards/{s}.json.gz", b"".join(out[s]))
            size += sum(map(len, out[s]))
            out[s] = None
        stats["index_mb"] = round(size / 1e6, 1)
        add(tar, "site/stats.json", json.dumps(stats, indent=1).encode())
    os.replace(tar_path + ".part", tar_path)
    if not YEARS:  # a partial build lives only in its archive; leave the local full index alone
        os.makedirs(OUT, exist_ok=True)
        json.dump(stats, open(os.path.join(OUT, "stats.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in stats.items() if k not in ("by_bank", "by_year")}, indent=1))


if __name__ == "__main__":
    main()
