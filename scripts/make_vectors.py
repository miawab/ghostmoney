"""Test vectors for tests/parity.test.mjs: real names and pairs, with what the Python matcher says about them.

usage: python -I scripts/make_vectors.py
"""
import csv, gzip, json, os, random, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from gm.names import parse_name, keys, skeleton  # noqa: E402
from gm.features import features  # noqa: E402

csv.field_size_limit(10_000_000)
random.seed(11)


def main():
    names = []
    with gzip.open(os.path.join(ROOT, "data", "index", "rows-2023.csv.gz"), "rt", encoding="utf-8") as f:
        for i, r in enumerate(csv.DictReader(f)):
            if i % 400 == 0:
                names.append((r["name"], r["province"]))
    names += [("غلام رسول", ""), ("محمد اسلم ولد اللہ دتہ", ""), ("ABDULREHMAN S/0 NASRULLAH", "Punjab"),
              ("Mohd. Rasul s/o Allah Ditta", "PUNJAB"), ("FATIMA BIBI WD/O LATE M. YOUSUF", "Sindh")]
    single = []
    for raw, _ in names:
        p = parse_name(raw)
        ks = keys(p["own"]) or ["+".join(sorted(skeleton(t) for t in p["own"]))]
        single.append({"raw": raw, "own": p["own"], "father": p["father"], "relation": p["relation"],
                       "keys": ks, "shards": sorted({zlib.crc32(k.encode()) % 4096 for k in ks})})
    pairs = []
    for _ in range(1500):
        (a, pa), (b, pb) = random.sample(names, 2)
        A, B = parse_name(a), parse_name(b)
        fq = random.randint(1, 5000)
        pairs.append({"a": a, "pa": pa, "b": b, "pb": pb, "fq": fq,
                      "f": features(A["own"], A["father"], pa, B["own"], B["father"], pb, fq)})
    os.makedirs(os.path.join(ROOT, "tests"), exist_ok=True)
    json.dump({"names": single, "pairs": pairs}, open(os.path.join(ROOT, "tests", "vectors.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print(len(single), "names,", len(pairs), "pairs")


if __name__ == "__main__":
    main()
