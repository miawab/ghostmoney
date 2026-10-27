"""How well does each way of matching find the same person written differently? (data/pairs/test.csv)

Compares what a family can do today (Ctrl+F in the Excel file) with spelling rules and with TabPFN
trained on the pair features. Needs tabpfn + scikit-learn (pricecheck's venv has both) and TABPFN_TOKEN.

usage: python -I scripts/eval_matcher.py
"""
import json, os, re, sys, time
import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from gm.features import FEATURES  # noqa: E402
from gm.names import split_relation  # noqa: E402

TRAIN_N = 3000  # TabPFN on CPU allows up to 5,000 rows; 3,000 keeps a full test run under a few minutes


def ctrl_f(q, r):
    """What Ctrl+F finds: the name as the family would type it, inside the row text."""
    own = re.sub(r"\s+", " ", split_relation(q)[0]).strip().lower()
    return own and own in re.sub(r"\s+", " ", r).lower()


def scores(y, pred):
    y, pred = np.asarray(y).astype(bool), np.asarray(pred).astype(bool)
    tp, fp, fn = (y & pred).sum(), (~y & pred).sum(), (y & ~pred).sum()
    return {"found": round(tp / max(1, tp + fn), 3), "precision": round(tp / max(1, tp + fp), 3),
            "false_alarms": int(fp), "tp": int(tp), "missed": int(fn)}


def main():
    train = pd.read_csv(os.path.join(ROOT, "data", "pairs", "train.csv"))
    test = pd.read_csv(os.path.join(ROOT, "data", "pairs", "test.csv"))
    tr = train.sample(min(TRAIN_N, len(train)), random_state=1)
    X, y = tr[FEATURES].values, tr["label"].values
    Xt, yt = test[FEATURES].values, test["label"].values
    spelled = (test.label == 1) & (test.query_name.str.upper().str.strip() != test.row_name.str.upper().str.strip())
    hard = test.label.eq(0) | spelled  # negatives + positives Ctrl+F has to work for

    preds = {
        "Ctrl+F (what families do today)": np.array([ctrl_f(q, r) for q, r in zip(test.query_name, test.row_name)]),
        "Same name after spelling rules": (test.canon_jacc >= 0.999).values,
        "Fuzzy text match (80% similar)": (test.seq_sim >= 0.8).values,
    }
    from sklearn.linear_model import LogisticRegression
    lr = LogisticRegression(max_iter=2000).fit(X, y)
    preds["Logistic regression on features"] = lr.predict_proba(Xt)[:, 1] >= 0.5

    t0 = time.time()
    if os.environ.get("TABPFN_LOCAL"):
        from tabpfn import TabPFNClassifier
        clf = TabPFNClassifier(device="cpu", n_estimators=4)
    else:  # the same hosted API the site uses
        from tabpfn_client import TabPFNClassifier, set_access_token
        set_access_token(os.environ["TABPFN_TOKEN"])
        clf = TabPFNClassifier()
    clf.fit(X, y)
    prob = np.concatenate([clf.predict_proba(Xt[i:i + 1000])[:, 1] for i in range(0, len(Xt), 1000)])
    secs = time.time() - t0
    preds["TabPFN on features"] = prob >= 0.5
    test["tabpfn"] = prob

    out = {"train_pairs": int(len(tr)), "test_pairs": int(len(test)), "test_same_person": int(yt.sum()),
           "test_spelled_differently": int(spelled.sum()), "tabpfn_seconds": round(secs, 1), "methods": {}}
    for name, p in preds.items():
        out["methods"][name] = {"all": scores(yt, p), "spelled_differently": scores(yt[hard], p[hard])}
    # confidence bands: how often a "very likely" really is the person
    bands = []
    for lo, hi in ((0.9, 1.01), (0.7, 0.9), (0.5, 0.7), (0.3, 0.5), (0, 0.3)):
        m = (prob >= lo) & (prob < hi)
        bands.append({"band": f"{lo:.1f}-{min(hi, 1):.1f}", "pairs": int(m.sum()), "same_person": round(float(yt[m].mean()), 3) if m.any() else None})
    out["tabpfn_bands"] = bands
    os.makedirs(os.path.join(ROOT, "data", "eval"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "data", "eval", "matcher.json"), "w"), indent=1)
    test.to_csv(os.path.join(ROOT, "data", "eval", "matcher-test-scored.csv"), index=False)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
