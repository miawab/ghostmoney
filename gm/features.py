"""Numbers that describe how well a list row fits what the family knows. TabPFN turns them into a probability.

Only these numbers ever go to the scoring service, never the names. public/match.js computes the very
same features in the browser; tests/test_parity.py checks the two agree.
"""
from difflib import SequenceMatcher
import math

from gm.names import COMMON, skeleton

FEATURES = ["own_jacc", "canon_jacc", "rare_hits", "rare_missing", "row_extra", "first_match", "seq_sim",
            "father_known", "father_sim", "province_match", "len_diff", "log_freq"]


def _jacc(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if a | b else 0.0


def features(q_own, q_father, q_province, r_own, r_father, r_province, r_freq):
    qs = [skeleton(t) for t in q_own]
    rs = [skeleton(t) for t in r_own]
    q_rare = {skeleton(t) for t in q_own if t not in COMMON}
    r_set = set(rs)
    fq = [skeleton(t) for t in q_father]
    fr = [skeleton(t) for t in r_father]
    father_known = 1 if fq and fr else 0
    return [
        round(_jacc(qs, rs), 4),
        round(_jacc(q_own, r_own), 4),
        len(q_rare & r_set),
        len(q_rare - r_set),
        len(r_set - set(qs)),
        1 if qs and rs and qs[0] == rs[0] else 0,
        round(SequenceMatcher(None, " ".join(q_own), " ".join(r_own)).ratio(), 4),
        father_known,
        round(_jacc(fq, fr), 4) if father_known else -1,
        (1 if q_province.lower()[:4] == r_province.lower()[:4] else 0) if q_province and r_province else -1,
        abs(len(qs) - len(rs)),
        round(math.log10(max(1, r_freq)), 3),
    ]
