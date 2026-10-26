"""Turn every downloaded State Bank list (raw/<year>/*) into one clean table: data/index/rows.csv.gz.

Banks used different headers, sheets and formats over 23 years (xls, xlsx, csv, zip), so each sheet's
header row is found by keywords and mapped to one schema. Anything unreadable is listed in
data/parse-report.json instead of being silently dropped.

usage: python -I scripts/parse.py [year ...]
"""
import csv, gzip, io, json, os, re, sys, zipfile
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "data", "index")

FIELDS = ["year", "bank", "branch_code", "branch", "province", "cnic", "name", "address", "nature",
          "account", "applicant", "instrument", "instrument_no", "instrument_date", "favour",
          "currency", "amount", "amount_pkr", "last_activity", "file"]

# header text -> field. Order matters: the first rule that matches wins.
RULES = [
    ("bank", r"^bank\s*name|^name\s*of\s*(the\s*)?bank|^bank$"),
    ("branch_code", r"branch\s*code|br\.?\s*code"),
    ("branch", r"branch\s*name|^branch$|name\s*of\s*(the\s*)?branch|branch\s*address"),
    ("province", r"province|region"),
    ("cnic", r"cnic|\bnic\b|passport|n\.i\.c|id\s*card|identity"),
    ("applicant", r"applicant|purchaser|remitter"),
    ("favour", r"favou?r|beneficiary|payee"),
    ("instrument_no", r"instrument\s*(no|number|#)|draft\s*no|cheque\s*no|po\s*no|dd\s*no"),
    ("instrument_date", r"instrument\s*date|date\s*of\s*(issue|instrument)|issue\s*date"),
    ("instrument", r"instrument\s*type|type\s*of\s*instrument|^instrument$"),
    ("last_activity", r"last\s*(date|transaction|activity)|date\s*of\s*last|dormant\s*since|last\s*dr|last\s*cr"),
    ("account", r"a/?c\.?\s*(no|number|#)|account\s*(no|number|#)|^account$"),
    ("name", r"^name$|depositor|account\s*(holder|title)|title\s*of\s*(the\s*)?a|name\s*of\s*(the\s*)?(depositor|account|customer|holder|a/c)|customer\s*name|^title$|^a/c\s*title|^names?\b"),
    ("address", r"address"),
    ("nature", r"nature|type\s*of\s*(deposit|account)|deposit\s*type|account\s*type|category"),
    ("currency", r"^currency|ccy"),
    ("amount_pkr", r"pkr|eqv|equivalent|rupee"),
    ("amount", r"amount|balance|outstanding"),
    ("year", r"^period|^year"),
]


def field_for(header):
    h = re.sub(r"\s+", " ", str(header).strip().lower())
    if not h or h.startswith("unnamed") or h == "nan":
        return None
    for field, rx in RULES:
        if re.search(rx, h):
            return field
    return None


def find_header(df):
    """Index of the row that looks most like a header, and its column -> field map."""
    best = (None, {})
    for i in range(min(25, len(df))):
        mapping = {}
        for col, val in df.iloc[i].items():
            f = field_for(val)
            if f and f not in mapping.values():
                mapping[col] = f
        if "name" in mapping.values() and len(mapping) >= 3 and len(mapping) > len(best[1]):
            best = (i, mapping)
    return best


def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in ("nan", "nat", "none", "-", "--", "n/a", "na", "nil", "null", "0"):
        return ""
    if s.endswith(" 00:00:00"):
        s = s[:-9]
    return re.sub(r"\s+", " ", s)


def money(v):
    s = clean(v).replace(",", "")
    m = re.search(r"-?\d+(\.\d+)?", s)
    return round(float(m.group(0)), 2) if m else ""


def frames(path):
    """Yield (label, DataFrame) for every sheet / inner file, all as strings with no header."""
    low = path.lower()
    if low.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            for inner in z.namelist():
                if inner.endswith("/") or not re.search(r"\.(xlsx?|csv)$", inner, re.I):
                    continue
                data = io.BytesIO(z.read(inner))
                yield from frames_from(data, inner, inner.lower())
    else:
        with open(path, "rb") as f:
            yield from frames_from(io.BytesIO(f.read()), os.path.basename(path), low)


def frames_from(data, label, low):
    if low.endswith(".csv"):
        for enc in ("utf-8", "cp1252", "latin-1"):
            try:
                data.seek(0)
                yield label, pd.read_csv(data, header=None, dtype=str, encoding=enc, on_bad_lines="skip", engine="python")
                return
            except UnicodeDecodeError:
                continue
        return
    engine = "xlrd" if low.endswith(".xls") else "openpyxl"
    try:
        sheets = pd.read_excel(data, header=None, dtype=str, sheet_name=None, engine=engine)
    except Exception:
        data.seek(0)  # some ".xls" files are really xlsx or html
        try:
            sheets = pd.read_excel(data, header=None, dtype=str, sheet_name=None,
                                   engine="openpyxl" if engine == "xlrd" else "xlrd")
        except Exception:
            data.seek(0)
            sheets = {f"html{i}": t for i, t in enumerate(pd.read_html(data, header=None))}
            sheets = {k: v.astype(str) for k, v in sheets.items()}
    for name, df in sheets.items():
        yield f"{label}#{name}", df


def bank_from_file(name):
    stem = re.sub(r"[_\-]?(19|20)\d\d.*$", "", os.path.splitext(name)[0])
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stem).replace("_", " ").strip()


def parse_file(path, year, writer, report):
    rows = 0
    for label, df in frames(path):
        df = df.dropna(how="all")
        if df.empty:
            continue
        hi, mapping = find_header(df)
        if hi is None:
            report["no_header"].append(f"{year}/{label} ({len(df)} rows)")
            continue
        body = df.iloc[df.index.get_loc(df.index[hi]) + 1:]
        for _, r in body.iterrows():
            rec = {f: "" for f in FIELDS}
            for col, f in mapping.items():
                rec[f] = clean(r.get(col))
            if not rec["name"] or field_for(rec["name"]) == "name":  # repeated header rows
                continue
            rec["year"] = year
            rec["bank"] = rec["bank"] or bank_from_file(os.path.basename(path))
            rec["amount"] = money(rec["amount"])
            rec["amount_pkr"] = money(rec["amount_pkr"]) or (rec["amount"] if rec["currency"].lower() in ("", "pkr", "pak rupee", "rupee", "rs", "pak rupees") else "")
            rec["file"] = os.path.basename(path)
            writer.writerow(rec)
            rows += 1
    return rows


def main():
    years = sys.argv[1:] or sorted(os.listdir(RAW))
    os.makedirs(OUT, exist_ok=True)
    report = {"files": {}, "no_header": [], "errors": []}
    total = 0
    for year in years:
        ydir = os.path.join(RAW, year)
        out = os.path.join(OUT, f"rows-{year}.csv.gz")
        with gzip.open(out, "wt", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, FIELDS)
            w.writeheader()
            for name in sorted(os.listdir(ydir)):
                if name.endswith(".part"):
                    continue
                try:
                    n = parse_file(os.path.join(ydir, name), year, w, report)
                    report["files"][f"{year}/{name}"] = n
                    total += n
                    if n == 0:
                        report["errors"].append(f"{year}/{name}: 0 rows")
                except Exception as e:
                    report["errors"].append(f"{year}/{name}: {type(e).__name__}: {e}")
        print(year, sum(v for k, v in report["files"].items() if k.startswith(year + "/")), flush=True)
    json.dump(report, open(os.path.join(ROOT, "data", "parse-report.json"), "w"), indent=1)
    print("total rows", total, "| errors", len(report["errors"]), "| sheets without header", len(report["no_header"]))


if __name__ == "__main__":
    main()
