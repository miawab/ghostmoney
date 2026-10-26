// Name matching in the browser: a line-for-line port of gm/names.py and gm/features.py.
// The page uses it to work out which index shards to download and how well each row fits,
// so the name the family types never leaves the browser. tests/parity.test.mjs checks it
// gives the same answers as the Python version on thousands of real names.

const CANON_FAMILIES = {
  MUHAMMAD: 'MUHAMMAD MOHAMMAD MOHAMMED MUHAMMED MOHAMAD MUHAMAD MOHAMED MOHD MUHD MHD MD MOH MOHAMMOD MUHAMMOD MUHMMAD MOHAMMD',
  AHMED: 'AHMED AHMAD AHAMAD AHMMED AHMEED',
  HUSSAIN: 'HUSSAIN HUSAIN HUSSAN HOSSAIN HUSSEIN HUSEIN HUSSIAN HUSAN',
  HASSAN: 'HASSAN HASAN',
  REHMAN: 'REHMAN RAHMAN REHMAAN RAHMAAN REHMANE',
  RASOOL: 'RASOOL RASUL RASOL RASOOOL',
  GHULAM: 'GHULAM GULAM GHOLAM GHULLAM',
  NOOR: 'NOOR NUR NOOR NOR',
  BIBI: 'BIBI BIBEE BEEBI',
  BEGUM: 'BEGUM BEGAM BAGUM',
  AKHTAR: 'AKHTAR AKHTER AKTAR',
  IQBAL: 'IQBAL IKBAL',
  SHAFIQ: 'SHAFIQ SHAFIQUE SHAFEEQ SHAFIK',
  RAFIQ: 'RAFIQ RAFIQUE RAFEEQ RAFIK',
  TARIQ: 'TARIQ TARIQUE TARIK',
  SIDDIQUE: 'SIDDIQUE SIDDIQ SIDIQ SADDIQUE SIDDIQI SIDIQUE',
  QADIR: 'QADIR QADEER KADIR QADIRR',
  YOUSAF: 'YOUSAF YOUSUF YUSUF YOUSIF YUSAF YOUSEF',
  YAQOOB: 'YAQOOB YAQUB YAKUB YAQOB YAQOOOB',
  AYUB: 'AYUB AYOUB AYYUB AYOOB',
  ZAHID: 'ZAHID ZAHEED',
  ABBAS: 'ABBAS ABAS',
  ISMAIL: 'ISMAIL ISMAEEL ESMAIL ISMAEL',
  IBRAHIM: 'IBRAHIM IBRAHEEM EBRAHIM IBRAHEM',
  ISHAQ: 'ISHAQ ISHAQUE ISHAK',
  FATIMA: 'FATIMA FATIMAH FATIMAA FATMA',
  KHATOON: 'KHATOON KHATUN KHATOOON',
  CHAUDHRY: 'CHAUDHRY CHAUDHARY CHAUDRY CHOUDHRY CHOUDHARY CHOHDRY CH CHAUDHRI CHAUHDRY',
  SHEIKH: 'SHEIKH SHAIKH SHK SH SHEIKKH',
  SYED: 'SYED SAYED SYYED SAIYED SYEDA SAYEDA',
  MIAN: 'MIAN MIYAN',
  ALLAH: 'ALLAH ALLA ALAH',
  DITTA: 'DITTA DITA DITTAH',
  UD: 'UD UL UDDIN',
};
const CANON = {};
for (const [canon, variants] of Object.entries(CANON_FAMILIES)) for (const v of variants.split(' ')) CANON[v] = canon;

const TITLES = new Set(('MR MRS MS MISS DR HAJI HAJJI AL HAJ LATE PROF ENGR MST MSTT MAST RAO AGHA CNIC NIC NO CNICNO ID ' +
  'PASSPORT AND MAULANA MOLANA HAFIZ QAZI SARDAR BEGUM_TITLE').split(' '));
export const COMMON = new Set(('MUHAMMAD AHMED ALI KHAN BIBI BEGUM HUSSAIN SHAH SYED MALIK CHAUDHRY SHEIKH ABDUL GHULAM ALLAH ' +
  'UD DIN ULLAH MIAN RANA BUTT BAIG MIRZA QURESHI NOOR AKHTAR IQBAL HASSAN KHATOON JAN GUL RAZA ABBAS BANO FATIMA SAEED ' +
  'ASLAM IMRAN ARSHAD ASHRAF TARIQ KHALID ZAHID AKRAM NAZIR BASHIR RIAZ YOUSAF').split(' '));
const RELATION = /\b(S\s*\/\s*O|D\s*\/\s*O|W\s*\/\s*O|SO|DO|WO|S\/0|D\/0|W\/0|SON\s+OF|DAUGHTER\s+OF|WIFE\s+OF|WD\/O|WIDOW\s+OF)\b\.?/i;

const URDU = {
  'ب': 'B', 'پ': 'P', 'ت': 'T', 'ٹ': 'T', 'ث': 'S', 'ج': 'J', 'چ': 'C', 'ح': '', 'خ': 'K', 'د': 'D', 'ڈ': 'D',
  'ذ': 'Z', 'ر': 'R', 'ڑ': 'R', 'ز': 'Z', 'ژ': 'Z', 'س': 'S', 'ش': 'X', 'ص': 'S', 'ض': 'Z', 'ط': 'T', 'ظ': 'Z',
  'ع': '', 'غ': 'G', 'ف': 'F', 'ق': 'K', 'ک': 'K', 'ك': 'K', 'گ': 'G', 'ل': 'L', 'م': 'M', 'ن': 'N', 'ں': 'N',
  'و': '', 'ہ': '', 'ه': '', 'ھ': '', 'ء': '', 'ی': '', 'ي': '', 'ے': '', 'ا': '', 'آ': '', 'أ': '', 'ئ': '', 'ۃ': '',
};
const isUrdu = (s) => /[؀-ۿ]/.test(s);
const dedupe = (s) => s.replace(/(.)\1+/g, '$1');

export function skeleton(token) {
  if (isUrdu(token)) return dedupe([...token].map((ch) => URDU[ch] ?? '').join(''));
  let t = token.toUpperCase();
  for (const [a, b] of [['PH', 'F'], ['SH', 'X'], ['CH', 'C'], ['KH', 'K'], ['GH', 'G'], ['TH', 'T'], ['DH', 'D'],
    ['Q', 'K'], ['V', 'W'], ['CK', 'K'], ['Z', 'Z'], ['ZH', 'Z']]) t = t.split(a).join(b);
  let first = t.slice(0, 1);
  const rest = t.slice(1).replace(/[AEIOUYHW]/g, '');
  if (first && 'AEIOUYHW'.includes(first)) first = first === 'H' ? 'H' : '';
  return dedupe(first + rest);
}

export function tokens(text) {
  let t = (text || '').normalize('NFKC').toUpperCase();
  t = t.replace(/[^\p{L}\p{N}_؀-ۿ/]+/gu, ' ');
  t = t.replace(/\bABDUL(?=[A-Z]{3,})/g, 'ABDUL ');
  t = t.replace(/(?<=[A-Z]{3})(ULLAH|UDDIN|UD DIN)\b/g, ' $1');
  const out = [];
  for (let w of t.replace(/\//g, ' ').split(/\s+/).filter(Boolean)) {
    if (/^\p{N}+$/u.test(w) || ([...w].length === 1 && w !== 'M')) continue;
    w = CANON[w] ?? w;
    if (w === 'M') w = 'MUHAMMAD';
    if (TITLES.has(w)) continue;
    out.push(w === 'UDDIN' ? 'UD' : w);
  }
  return out;
}

export function splitRelation(raw) {
  raw = raw || '';
  const m = RELATION.exec(raw);
  if (!m) return [raw, '', ''];
  let rel = m[1].toUpperCase().replace(/\s/g, '').replace(/0/g, 'O');
  rel = { SONOF: 'S/O', DAUGHTEROF: 'D/O', WIFEOF: 'W/O', WIDOWOF: 'W/O', 'WD/O': 'W/O', SO: 'S/O', DO: 'D/O', WO: 'W/O' }[rel] ?? rel;
  return [raw.slice(0, m.index).trim(), raw.slice(m.index + m[0].length).trim(), rel];
}

export function parseName(raw) {
  const [own, father, relation] = splitRelation(raw);
  return { own: tokens(own), father: tokens(father), relation };
}

export function keys(toks) {
  const s = new Set();
  for (const t of toks) {
    const k = skeleton(t);
    if (!COMMON.has(t) && k.length >= 2) s.add(k);
  }
  return [...s].sort();
}

// The shard keys build_index.py files a row under: its uncommon-name skeletons, or all of them joined.
export function shardKeys(own) {
  const k = keys(own);
  return k.length ? k : [own.map(skeleton).sort().join('+')];
}

export function cnicDigits(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length === 11 || d.length === 13 ? d : '';
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(str) {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(str)) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const shardOf = (key, shards = 4096) => crc32(key) % shards;

// difflib.SequenceMatcher(None, a, b).ratio() for short strings (no junk, no autojunk below 200 chars).
export function seqRatio(a, b) {
  const blocks = (alo, ahi, blo, bhi) => {
    let besti = alo, bestj = blo, best = 0;
    let prev = new Map();
    for (let i = alo; i < ahi; i++) {
      const cur = new Map();
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue;
        const k = (prev.get(j - 1) || 0) + 1;
        cur.set(j, k);
        if (k > best) { besti = i - k + 1; bestj = j - k + 1; best = k; }
      }
      prev = cur;
    }
    if (!best) return 0;
    return best + (alo < besti && blo < bestj ? blocks(alo, besti, blo, bestj) : 0) +
      (besti + best < ahi && bestj + best < bhi ? blocks(besti + best, ahi, bestj + best, bhi) : 0);
  };
  const total = a.length + b.length;
  return total ? (2 * blocks(0, a.length, 0, b.length)) / total : 1;
}

const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const jacc = (a, b) => {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
};

export const FEATURES = ['own_jacc', 'canon_jacc', 'rare_hits', 'rare_missing', 'row_extra', 'first_match', 'seq_sim',
  'father_known', 'father_sim', 'province_match', 'len_diff', 'log_freq'];

export function features(qOwn, qFather, qProvince, rOwn, rFather, rProvince, rFreq) {
  const qs = qOwn.map(skeleton), rs = rOwn.map(skeleton);
  const qRare = new Set(qOwn.filter((t) => !COMMON.has(t)).map(skeleton));
  const rSet = new Set(rs);
  const fq = qFather.map(skeleton), fr = rFather.map(skeleton);
  const fatherKnown = fq.length && fr.length ? 1 : 0;
  const qsSet = new Set(qs);
  return [
    round(jacc(qs, rs), 4),
    round(jacc(qOwn, rOwn), 4),
    [...qRare].filter((x) => rSet.has(x)).length,
    [...qRare].filter((x) => !rSet.has(x)).length,
    [...rSet].filter((x) => !qsSet.has(x)).length,
    qs.length && rs.length && qs[0] === rs[0] ? 1 : 0,
    round(seqRatio(qOwn.join(' '), rOwn.join(' ')), 4),
    fatherKnown,
    fatherKnown ? round(jacc(fq, fr), 4) : -1,
    qProvince && rProvince ? (qProvince.toLowerCase().slice(0, 4) === rProvince.toLowerCase().slice(0, 4) ? 1 : 0) : -1,
    Math.abs(qs.length - rs.length),
    round(Math.log10(Math.max(1, rFreq)), 3),
  ];
}

// Same salted hash as build_index.py, so a typed CNIC can be checked against a row without shipping the number.
export async function cnicHash(digits) {
  if (!digits) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ghostmoney:' + digits));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}
