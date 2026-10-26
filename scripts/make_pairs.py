"""Labelled name pairs from the lists themselves, for training and testing the matcher.

Ground truth comes from CNICs: two personal rows with the same 13-digit CNIC are the same person
(however the clerk spelled the name); a row with a different 13-digit CNIC that shares a search key is a
different person with a similar name (the hard case). One side plays "what the family typed" (own name,
father's name if the row had one, province), the other is the list row.

Pairs are split by CNIC so no person is in both train and test.
Writes data/pairs/train.csv and data/pairs/test.csv (features + label + both raw names).

usage: python -I scripts/make_pairs.py [rows-2023.csv.gz ...]
"""
import csv, gzip, os, random, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from gm.names import parse_name, keys, skeleton, cnic_digits  # noqa: E402
from gm.features import features, FEATURES  # noqa: E402

csv.field_size_limit(10_000_000)
random.seed(7)


def main():
    paths = sys.argv[1:] or [os.path.join(ROOT, "data", "index", "rows-2023.csv.gz")]
    people = []
    for path in paths:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                c = cnic_digits(r["cnic"])
                if len(c) != 13:
                    continue
                p = parse_name(r["name"])
                if p["business"] or len(p["own"]) < 2:
                    continue
                people.append((c, r["name"], p, r["province"]))
    print("people with CNIC", len(people))
    freq = defaultdict(int)
    by_cnic = defaultdict(list)
    by_key = defaultdict(list)
    by_full = defaultdict(list)
    for i, (c, raw, p, prov) in enumerate(people):
        full = " ".join(sorted(skeleton(t) for t in p["own"]))
        freq[full] += 1
        by_full[full].append(i)
        by_cnic[c].append(i)
        for k in keys(p["own"]):
            by_key[k].append(i)

    def fq(p):
        return freq[" ".join(sorted(skeleton(t) for t in p["own"]))]

    # a CNIC on dozens of rows is a placeholder (0000000000000) or an organisation, not one person
    cnics = [c for c, ix in by_cnic.items() if 1 < len(ix) <= 20]
    random.shuffle(cnics)
    cnics = cnics[:12000]
    test_cnics = set(cnics[: len(cnics) // 4])
    out = {"train": [], "test": []}
    noise = 0

    def related(p, q):
        return bool(set(keys(p["own"])) & set(keys(q["own"])))
    for c in cnics:
        ix = by_cnic[c]
        a, b = random.sample(ix, 2)
        # prefer a pair written differently: that's the case Ctrl+F misses
        for x in ix:
            for y in ix:
                if x < y and people[x][2]["own"] != people[y][2]["own"] and related(people[x][2], people[y][2]):
                    a, b = x, y
        A, B = people[a], people[b]
        # Same CNIC but nothing in common (a shop's name, a joint account, a clerk's typo in the CNIC):
        # not a spelling of one name, so leave it out and count it.
        if not related(A[2], B[2]):
            noise += 1
            continue
        split = "test" if c in test_cnics else "train"
        f = features(A[2]["own"], A[2]["father"], A[3], B[2]["own"], B[2]["father"], B[3], fq(B[2]))
        out[split].append(f + [1, A[1], B[1]])
        # two hard negatives: share a search key with A, different CNIC
        ks = keys(A[2]["own"])
        for _ in range(2):
            if not ks:
                break
            pool = by_key[random.choice(ks)]
            for _try in range(6):
                n = people[random.choice(pool)]
                if n[0] != c:
                    f = features(A[2]["own"], A[2]["father"], A[3], n[2]["own"], n[2]["father"], n[3], fq(n[2]))
                    out[split].append(f + [0, A[1], n[1]])
                    break
        # name twins: the very same name, a different CNIC. Common names (GHULAM RASOOL) belong to
        # thousands of people, and only the father's name, the province or rarity can tell them apart.
        twins = by_full[" ".join(sorted(skeleton(t) for t in A[2]["own"]))]
        for _ in range(2):
            for _try in range(6):
                n = people[random.choice(twins)]
                if n[0] != c:
                    f = features(A[2]["own"], A[2]["father"], A[3], n[2]["own"], n[2]["father"], n[3], fq(n[2]))
                    out[split].append(f + [0, A[1], n[1]])
                    break
    print("same CNIC but unrelated names (left out):", noise)
    os.makedirs(os.path.join(ROOT, "data", "pairs"), exist_ok=True)
    for split, rows in out.items():
        with open(os.path.join(ROOT, "data", "pairs", f"{split}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(FEATURES + ["label", "query_name", "row_name"])
            w.writerows(rows)
        print(split, len(rows), "pairs,", sum(r[len(FEATURES)] for r in rows), "same person")


if __name__ == "__main__":
    main()
