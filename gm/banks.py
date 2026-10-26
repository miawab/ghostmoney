"""One name per bank (the lists spell the same bank a dozen ways), plus what happened to it since.

`now` is where an heir goes today when the bank merged or was taken over. Sources: State Bank merger
notifications (https://www.sbp.org.pk/notifications/bpd/index.htm) and the banks' own announcements.
"""
import re

# (canonical name, regex on the bank text or file name, bank to visit today or None if it still exists)
BANKS = [
    ("Habib Bank Limited", r"habib\s*bank(?!.*(metro|al))|^hbl", None),
    ("Habib Metropolitan Bank", r"metro", None),
    ("National Bank of Pakistan", r"national\s*bank|^nbp", None),
    ("United Bank Limited", r"united\s*bank|^ubl", None),
    ("MCB Islamic Bank", r"mcb\s*islamic", None),
    ("MCB Bank", r"mcb|muslim\s*commercial", None),
    ("Allied Bank", r"allied|^abl", None),
    ("Bank Alfalah", r"al[\s\-_]*falah", None),
    ("Bank Al Habib", r"al[\s\-_]*habib", None),
    ("Meezan Bank", r"meezan", None),
    ("BankIslami Pakistan", r"bank[\s_]*islami|^islami", None),
    ("Askari Bank", r"askari", None),
    ("Faysal Bank", r"faysal|faisal", None),
    ("Soneri Bank", r"soneri", None),
    ("JS Bank", r"^js|js[\s_]*bank|jahangir\s*siddiqui", None),
    ("Bank of Punjab", r"punjab(?!.*(provincial|cooperative))|^bop", None),
    ("Bank of Khyber", r"khyber", None),
    ("Sindh Bank", r"sindh", None),
    ("Standard Chartered Pakistan", r"standard|^scb", None),
    ("Dubai Islamic Bank Pakistan", r"dubai", None),
    ("Al Baraka Bank Pakistan", r"bara?ka", None),
    ("Bank Makramah (formerly Summit Bank)", r"makramah|summit|my\s*bank|atlas\s*bank|arif\s*habib\s*bank|rupali", None),
    ("Silkbank", r"silk|saudi\s*pak", "United Bank Limited (merger 2025; confirm with the State Bank)"),
    ("Samba Bank", r"samba|crescent\s*commercial", None),
    ("Zarai Taraqiati Bank", r"zarai|ztbl|agricultur", None),
    ("SME Bank", r"sme|small\s*(and|&)\s*medium|regional\s*development\s*finance", None),
    ("First Women Bank", r"women", None),
    ("Industrial Development Bank", r"industrial\s*development|idbl|idbp", None),
    ("ICBC Pakistan", r"industrial\s*(and|&)?\s*commercial|icbc", None),
    ("Punjab Provincial Cooperative Bank", r"provincial|cooperative|ppcbl", None),
    ("Easypaisa Bank (formerly Telenor Microfinance)", r"easy\s*_?paisa|telenor", None),
    ("Khushhali Bank", r"khush", None),
    ("Citibank Pakistan", r"citi", "Citibank's Pakistan retail business went to Habib Bank Limited (2012)"),
    ("Deutsche Bank Pakistan", r"deutsche", None),
    ("Barclays Pakistan", r"barclays", "Habib Bank Limited (2015)"),
    ("HSBC Pakistan", r"hsbc", "Meezan Bank (2014)"),
    ("KASB Bank", r"kasb", "BankIslami Pakistan (2015)"),
    ("NIB Bank", r"\bnib\b|pici|pakistan\s*industrial\s*credit", "MCB Bank (2017)"),
    ("Royal Bank of Scotland / ABN AMRO", r"rbs|royal\s*bank|abn", "Faysal Bank (2010)"),
    ("Atlas Bank", r"atlas", "Summit Bank, now Bank Makramah"),
    ("Mybank", r"mybank", "Summit Bank, now Bank Makramah"),
    ("Prime Commercial Bank", r"prime", "ABN AMRO (2007), then RBS, now Faysal Bank"),
    ("Union Bank", r"union", "Standard Chartered (2006)"),
    ("Emirates Global Islamic Bank", r"emirates|egibl", "Silkbank, now United Bank Limited"),
    ("Burj Bank", r"burj", "Al Baraka Bank Pakistan (2016)"),
    ("Bank of Tokyo-Mitsubishi", r"tokyo", None),
    ("American Express Bank", r"american\s*express|amex", None),
    ("Oman International Bank", r"oman", None),
    ("Habib Bank AG Zurich", r"zurich|habib\s*bank\s*ag", None),
    ("Bolan Bank", r"bolan", None),
]


def canonical(text):
    t = (text or "").lower().replace("_", " ")
    for name, rx, now in BANKS:
        if re.search(rx, t):
            return name, now
    return (text or "").strip().title(), None
