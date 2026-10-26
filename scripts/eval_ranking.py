"""Is the right account at the top of the list? (reads data/eval/matcher-test-scored.csv from eval_matcher.py)

Each test query has one true row (same CNIC) and up to four look-alikes: two that share a spelling key and two
"name twins" with the identical name and a different CNIC. We rank them the way each method would and count how
often the true row comes first, split by what the family knew (father's name on both sides or not).

usage: python -I scripts/eval_ranking.py
"""
import json, os, re, sys
import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from gm.names import split_relation  # noqa: E402


def ctrl_f(q, r):
    own = re.sub(r"\s+", " ", split_relation(q)[0]).strip().lower()
    return float(bool(own) and own in re.sub(r"\s+", " ", r).lower())


def main():
    d = pd.read_csv(os.path.join(ROOT, "data", "eval", "matcher-test-scored.csv"))
    d["group"] = (d.label == 1).cumsum()
    d["ctrlf"] = [ctrl_f(q, r) for q, r in zip(d.query_name, d.row_name)]
    rng = np.random.default_rng(0)
    d["tie"] = rng.random(len(d))  # ties broken at random, as a person scrolling would
    out = {}
    for label, sub in (("all", d), ("father known on both sides", d[d.father_known == 1]),
                       ("no father's name", d[d.father_known == 0])):
        res = {}
        groups = [g for _, g in sub.groupby("group") if g.label.sum() == 1 and len(g) > 1]
        for name, col in (("Ctrl+F", "ctrlf"), ("Fuzzy text", "seq_sim"), ("TabPFN", "tabpfn")):
            first = 0
            for g in groups:
                top = g.sort_values([col, "tie"], ascending=False).iloc[0]
                first += int(top.label == 1)
            res[name] = round(first / max(1, len(groups)), 3)
        res["queries"] = len(groups)
        out[label] = res
    json.dump(out, open(os.path.join(ROOT, "data", "eval", "ranking.json"), "w"), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
