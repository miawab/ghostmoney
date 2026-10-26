"""Pakistani name handling: one name, many spellings.

The same man shows up as MUHAMMAD RASOOL, MOHD. RASUL, M. RASOOL S/O ALLAH DITTA or غلام رسول.
Ctrl+F finds one of those. This module turns a written name into:
  - the person's own name tokens, and the father's / husband's name if the row says S/O, D/O, W/O
  - a canonical spelling per token (MOHD -> MUHAMMAD) and a consonant "skeleton" (RASOOL, RASUL -> RSL)
so two spellings of one name compare equal.
"""
import re
import unicodedata

# Spelling families seen in the lists. Left side: every variant; right side: the canonical form.
CANON = {}
for canon, variants in {
    "MUHAMMAD": "MUHAMMAD MOHAMMAD MOHAMMED MUHAMMED MOHAMAD MUHAMAD MOHAMED MOHD MUHD MHD MD MOH MOHAMMOD MUHAMMOD MUHMMAD MOHAMMD",
    "AHMED": "AHMED AHMAD AHAMAD AHMMED AHMEED",
    "HUSSAIN": "HUSSAIN HUSAIN HUSSAN HOSSAIN HUSSEIN HUSEIN HUSSIAN HUSAN",
    "HASSAN": "HASSAN HASAN",
    "REHMAN": "REHMAN RAHMAN REHMAAN RAHMAAN REHMANE",
    "RASOOL": "RASOOL RASUL RASOL RASOOOL",
    "GHULAM": "GHULAM GULAM GHOLAM GHULLAM",
    "NOOR": "NOOR NUR NOOR NOR",
    "BIBI": "BIBI BIBEE BEEBI",
    "BEGUM": "BEGUM BEGAM BAGUM",
    "AKHTAR": "AKHTAR AKHTER AKTAR",
    "IQBAL": "IQBAL IKBAL",
    "SHAFIQ": "SHAFIQ SHAFIQUE SHAFEEQ SHAFIK",
    "RAFIQ": "RAFIQ RAFIQUE RAFEEQ RAFIK",
    "TARIQ": "TARIQ TARIQUE TARIK",
    "SIDDIQUE": "SIDDIQUE SIDDIQ SIDIQ SADDIQUE SIDDIQI SIDIQUE",
    "QADIR": "QADIR QADEER KADIR QADIRR",
    "YOUSAF": "YOUSAF YOUSUF YUSUF YOUSIF YUSAF YOUSEF",
    "YAQOOB": "YAQOOB YAQUB YAKUB YAQOB YAQOOOB",
    "AYUB": "AYUB AYOUB AYYUB AYOOB",
    "ZAHID": "ZAHID ZAHEED",
    "ABBAS": "ABBAS ABAS",
    "ISMAIL": "ISMAIL ISMAEEL ESMAIL ISMAEL",
    "IBRAHIM": "IBRAHIM IBRAHEEM EBRAHIM IBRAHEM",
    "ISHAQ": "ISHAQ ISHAQUE ISHAK",
    "FATIMA": "FATIMA FATIMAH FATIMAA FATMA",
    "KHATOON": "KHATOON KHATUN KHATOOON",
    "CHAUDHRY": "CHAUDHRY CHAUDHARY CHAUDRY CHOUDHRY CHOUDHARY CHOHDRY CH CHAUDHRI CHAUHDRY",
    "SHEIKH": "SHEIKH SHAIKH SHK SH SHEIKKH",
    "SYED": "SYED SAYED SYYED SAIYED SYEDA SAYEDA",
    "MIAN": "MIAN MIYAN",
    "ALLAH": "ALLAH ALLA ALAH",
    "DITTA": "DITTA DITA DITTAH",
    "UD": "UD UL UDDIN",
}.items():
    for v in variants.split():
        CANON[v] = canon

TITLES = {"MR", "MRS", "MS", "MISS", "DR", "HAJI", "HAJJI", "AL", "HAJ", "LATE", "PROF", "ENGR", "MST", "MSTT", "MAST",
          "RAO", "AGHA", "CNIC", "NIC", "NO", "CNICNO", "ID", "PASSPORT", "AND", "MAULANA", "MOLANA", "HAFIZ", "QAZI", "SARDAR", "BEGUM_TITLE"}
# Very common tokens: useful for scoring, useless for finding a person (half the list is MUHAMMAD).
COMMON = {"MUHAMMAD", "AHMED", "ALI", "KHAN", "BIBI", "BEGUM", "HUSSAIN", "SHAH", "SYED", "MALIK", "CHAUDHRY", "SHEIKH",
          "ABDUL", "GHULAM", "ALLAH", "UD", "DIN", "ULLAH", "MIAN", "RANA", "BUTT", "BAIG", "MIRZA", "QURESHI", "NOOR",
          "AKHTAR", "IQBAL", "HASSAN", "KHATOON", "JAN", "GUL", "RAZA", "ABBAS", "BANO", "FATIMA", "SAEED", "ASLAM",
          "IMRAN", "ARSHAD", "ASHRAF", "TARIQ", "KHALID", "ZAHID", "AKRAM", "NAZIR", "BASHIR", "RIAZ", "YOUSAF"}
BUSINESS = re.compile(r"\b(LTD|LIMITED|PVT|M/S|MESSRS|TRUST|ASSOCIATES|TRADERS|TRADING|ENTERPRISES?|INDUSTR|COMPANY|CORP|"
                      r"BRANCH|MISC|SCHOOL|COLLEGE|MOSQUE|MASJID|MADRASSA|GOVT|GOVERNMENT|DEPARTMENT|DEPTT|BOARD|SOCIETY|"
                      r"WELFARE|FOUNDATION|BANK|HOSPITAL|STORE|AGENCY|SONS|BROTHERS|INTERNATIONAL|PAKISTAN|COMMITTEE|CLUB|"
                      r"UNIVERSITY|PRINCIPAL|DIRECTOR|FINANCE|OFFICER|COMMISSIONER|CONTROLLER|ACCOUNTANT|TREASURY|DISTRICT|PROJECT|PROGRAM|MILLS?\b|FURNITURE|MERCHANT|CABLE|ELECTRIC|MOTORS|TEXTILE|BUILDERS|CONSTRUCTION|TRAVELS?\b|MEDICAL|PHARMA|COMMUNICATION|MOBILE|MANAGER|SECRETARY|FUND|ACCOUNT|SUSPENSE|STALE|DD\b|PO\b|FDD|TDR|CHEQUE)", re.I)
RELATION = re.compile(r"\b(S\s*/\s*O|D\s*/\s*O|W\s*/\s*O|SO|DO|WO|S/0|D/0|W/0|SON\s+OF|DAUGHTER\s+OF|WIFE\s+OF|WD/O|WIDOW\s+OF)\b\.?", re.I)

# Urdu letters -> a Roman consonant skeleton (vowel letters vanish, as in the Roman skeleton below).
URDU = {"ب": "B", "پ": "P", "ت": "T", "ٹ": "T", "ث": "S", "ج": "J", "چ": "C", "ح": "", "خ": "K", "د": "D", "ڈ": "D",
        "ذ": "Z", "ر": "R", "ڑ": "R", "ز": "Z", "ژ": "Z", "س": "S", "ش": "X", "ص": "S", "ض": "Z", "ط": "T", "ظ": "Z",
        "ع": "", "غ": "G", "ف": "F", "ق": "K", "ک": "K", "ك": "K", "گ": "G", "ل": "L", "م": "M", "ن": "N", "ں": "N",
        "و": "", "ہ": "", "ه": "", "ھ": "", "ء": "", "ی": "", "ي": "", "ے": "", "ا": "", "آ": "", "أ": "", "ئ": "", "ۃ": ""}


def skeleton(token):
    """Consonant skeleton of one Roman-script token: RASOOL/RASUL -> RSL, HUSSAIN/HUSAIN -> HSN."""
    if any("؀" <= ch <= "ۿ" for ch in token):
        return re.sub(r"(.)\1+", r"\1", "".join(URDU.get(ch, "") for ch in token))
    t = token.upper()
    for a, b in (("PH", "F"), ("SH", "X"), ("CH", "C"), ("KH", "K"), ("GH", "G"), ("TH", "T"), ("DH", "D"),
                 ("Q", "K"), ("V", "W"), ("CK", "K"), ("Z", "Z"), ("ZH", "Z")):
        t = t.replace(a, b)
    first = t[:1]
    rest = re.sub(r"[AEIOUYHW]", "", t[1:])
    if first in "AEIOUYHW":  # a leading vowel or H is too unstable to keep (AHMED/AHMAD, HUSSAIN keeps H below)
        first = "H" if first == "H" else ""
    return re.sub(r"(.)\1+", r"\1", first + rest)


def tokens(text):
    """Split a written name into canonical Roman tokens (Urdu tokens are kept as they are)."""
    t = unicodedata.normalize("NFKC", text or "").upper()
    t = re.sub(r"[^\w؀-ۿ/]+", " ", t)
    t = re.sub(r"\bABDUL(?=[A-Z]{3,})", "ABDUL ", t)          # ABDULREHMAN -> ABDUL REHMAN
    t = re.sub(r"(?<=[A-Z]{3})(ULLAH|UDDIN|UD DIN)\b", r" \1", t)  # NASRULLAH -> NASR ULLAH
    out = []
    for w in t.replace("/", " ").split():
        if w.isdigit() or len(w) == 1 and w not in "M":
            continue
        w = CANON.get(w, w)
        if w == "M":
            w = "MUHAMMAD"
        if w in TITLES:
            continue
        out.append("UD" if w == "UDDIN" else w)
    return out


def split_relation(raw):
    """'ALI RAZA S/O GHULAM NABI' -> ('ALI RAZA', 'GHULAM NABI', 'S/O')."""
    m = RELATION.search(raw or "")
    if not m:
        return raw or "", "", ""
    rel = re.sub(r"\s", "", m.group(1).upper()).replace("0", "O")
    rel = {"SONOF": "S/O", "DAUGHTEROF": "D/O", "WIFEOF": "W/O", "WIDOWOF": "W/O", "WD/O": "W/O", "SO": "S/O", "DO": "D/O", "WO": "W/O"}.get(rel, rel)
    return raw[: m.start()].strip(), raw[m.end():].strip(), rel


def is_business(raw):
    return bool(BUSINESS.search(raw or ""))


def parse_name(raw):
    own, father, rel = split_relation(raw)
    return {"own": tokens(own), "father": tokens(father), "relation": rel, "business": is_business(raw)}


def keys(toks):
    """Search keys for a token list: the skeletons of the uncommon tokens (at least 2 letters)."""
    return sorted({skeleton(t) for t in toks if t not in COMMON and len(skeleton(t)) >= 2})


def cnic_digits(raw):
    """CNIC (13 digits) or old NIC (11 digits) as digits only, else ''."""
    d = re.sub(r"\D", "", raw or "")
    return d if len(d) in (11, 13) else ""
