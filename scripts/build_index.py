"""Build the search index the site serves: data/index/site/shards/<n>.json.gz + stats.json.

Every person row is written to the shard of each of its name keys (gm.names.keys). The browser works
out the keys for a name on its own and downloads only those shards, so the server learns a shard
number shared by thousands of names, never the name itself.

CNICs are not shipped whole: a shard row carries the last 4 digits and a short hash, so the page can
confirm a CNIC the family types in without publishing every number again.

usage: python -I scripts/build_index.py
"""
import csv, glob, gzip, hashlib, json, os, sys, zlib
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from gm.names import parse_name, keys, skeleton, cnic_digits  # noqa: E402
from gm.banks import canonical  # noqa: E402

csv.field_size_limit(10_000_000)
SHARDS = 4096
OUT = os.path.join(ROOT, "data", "index", "site")
PLACEHOLDER = {"PAY ORDER", "UNAVAILABLE", "CD MISC", "NA", "N A", "UNKNOWN", "NOT AVAILABLE", "DEMAND DRAFT", "CALL DEPOSIT"}


def shard_of(key):
    return zlib.crc32(key.encode()) % SHARDS


def cnic_hash(d):
    return hashlib.sha256(("ghostmoney:" + d).encode()).hexdigest()[:10] if d else ""


def main():
    files = sorted(glob.glob(os.path.join(ROOT, "data", "index", "rows-*.csv.gz")))
    shards = defaultdict(list)
    seen = set()
    stats = {"rows": 0, "people": 0, "businesses": 0, "unnamed": 0, "duplicates": 0, "pkr_total": 0.0,
             "pkr_people": 0.0, "by_year": {}, "by_bank": defaultdict(lambda: [0, 0.0]), "with_cnic": 0,
             "with_father": 0, "over_100k": 0, "shards": SHARDS}
    rid = 0
    freq = defaultdict(int)
    all_rows = []
    for path in files:
        year = os.path.basename(path)[5:9]
        ycount = [0, 0.0]
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                stats["rows"] += 1
                try:
                    amt = float(r["amount_pkr"] or 0)
                except ValueError:
                    amt = 0.0
                bank, now = canonical(r["bank"] or r["file"])
                sig = (bank, r["account"], r["instrument_no"], r["amount_pkr"], r["name"].upper())
                if r["account"] and sig in seen:  # same account listed again in a later year
                    stats["duplicates"] += 1
                    continue
                if r["account"]:
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
                if amt > 100000:
                    stats["over_100k"] += 1
                c = cnic_digits(r["cnic"])
                stats["with_cnic"] += bool(c)
                stats["with_father"] += bool(p["father"])
                rid += 1
                row = {
                    "i": rid, "y": year, "b": bank, "n": raw[:90],
                    "o": p["own"], "f": p["father"], "rel": p["relation"],
                    "br": r["branch"][:60], "bc": r["branch_code"][:8], "pr": r["province"][:24].title(),
                    "ad": r["address"][:80], "k": r["nature"][:30], "in": r["instrument"][:24],
                    "a": round(amt, 2), "cur": r["currency"][:12], "la": r["last_activity"][:10],
                    "ac": r["account"][-4:] if r["account"] else "",
                    "c4": c[-4:] if c else "", "ch": cnic_hash(c), "cl": len(c),
                }
                if now:
                    row["now"] = now
                full = " ".join(sorted(skeleton(t) for t in p["own"]))
                freq[full] += 1
                all_rows.append((row, full))
                ks = keys(p["own"]) or ["+".join(sorted(skeleton(t) for t in p["own"]))]
                for s in {shard_of(k) for k in ks}:
                    shards[s].append(row)
        stats["by_year"][year] = ycount
        print(year, ycount[0], f"{ycount[1] / 1e9:.2f} bn", flush=True)

    for row, full in all_rows:  # how many people in the lists share this exact name: a match on a rare name means more
        row["fq"] = freq[full]
    os.makedirs(os.path.join(OUT, "shards"), exist_ok=True)
    size = 0
    for s in range(SHARDS):
        data = gzip.compress(json.dumps(shards.get(s, []), separators=(",", ":"), ensure_ascii=False).encode(), 6)
        with open(os.path.join(OUT, "shards", f"{s}.json.gz"), "wb") as f:
            f.write(data)
        size += len(data)
    stats["by_bank"] = {k: v for k, v in sorted(stats["by_bank"].items(), key=lambda x: -x[1][1])}
    stats["index_mb"] = round(size / 1e6, 1)
    json.dump(stats, open(os.path.join(OUT, "stats.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in stats.items() if k not in ("by_bank", "by_year")}, indent=1))


if __name__ == "__main__":
    main()
