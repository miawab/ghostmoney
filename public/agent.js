// Gemma's three jobs, and the code that checks each answer before the page uses it.
//   understand(story)          a family's description -> search fields
//   review(notes, candidates)  a second opinion on the top matches
//   letterBody(...)            the personal paragraph of the claim letter
// Gemma runs on the visitor's own machine: through Ollama when Ghost Money runs locally (/api/gemma),
// otherwise inside this tab with WebLLM (Gemma 4 E2B, downloaded once and cached by the browser).

const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';
export const BROWSER_MODEL = 'gemma-4-E2B-it-q4f16_1-MLC';

let mode = null;       // 'local' | 'browser' | null
let engine = null;
let localModel = '';
export const trace = []; // step timings for Sentry (no text)

export async function detect() {
  try {
    const r = await fetch('/api/gemma');
    const j = await r.json();
    if (j.local) { mode = 'local'; localModel = j.model; return { mode, model: j.model }; }
  } catch { /* static hosting */ }
  return { mode: null, canBrowser: 'gpu' in navigator };
}

export const ready = () => Boolean(mode);
export const where = () => (mode === 'local' ? `on this PC (${localModel})` : mode === 'browser' ? 'in this tab (Gemma 4 E2B)' : 'off');

export async function loadInBrowser(onProgress) {
  if (!('gpu' in navigator)) throw new Error('This browser has no WebGPU. Try Chrome or Edge on a laptop.');
  const webllm = await import(WEBLLM);
  engine = await webllm.CreateMLCEngine(BROWSER_MODEL, { initProgressCallback: (p) => onProgress?.(p) });
  mode = 'browser';
}

async function chat(step, system, user) {
  const t0 = performance.now();
  let text, inTok, outTok, model;
  if (mode === 'local') {
    const r = await fetch('/api/gemma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step, system, user }) });
    if (!r.ok) throw new Error(`Gemma ${r.status}`);
    const j = await r.json();
    ({ text, in: inTok, out: outTok, model } = j);
  } else if (mode === 'browser') {
    const r = await engine.chat.completions.create({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.1, max_tokens: 900,
    });
    text = r.choices[0].message.content;
    inTok = r.usage?.prompt_tokens; outTok = r.usage?.completion_tokens; model = BROWSER_MODEL;
  } else throw new Error('Gemma is off');
  trace.push({ op: 'gen_ai.chat', name: `${step} (${model})`, ms: Math.round(performance.now() - t0), model, in: inTok, out: outTok });
  return parseJson(text);
}

function parseJson(text) {
  const s = String(text || '').replace(/```(json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Gemma did not answer in JSON');
  return JSON.parse(s.slice(a, b + 1));
}

const NAME_OK = /^[\p{L}\s.'/-]{2,80}$/u;
const PROVINCES = ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad', 'Gilgit-Baltistan', 'Azad Kashmir'];

export async function understand(story) {
  const system = `You help a Pakistani family search the State Bank of Pakistan's unclaimed-deposit lists for a relative who died.
From their description, return JSON only:
{"name": "", "father": "", "relation": "S/O|D/O|W/O|", "city": "", "province": "", "cnic": "", "spellings": [], "notes": ""}
- name / father: the person's and their father's (or husband's) names in CAPITAL English letters, as a bank clerk would type them. Transliterate Urdu.
- spellings: up to 4 other ways a clerk might have spelled the person's name (e.g. MOHD RASUL for MUHAMMAD RASOOL).
- province: one of ${PROVINCES.join(', ')}, or "".
- cnic: only if the description contains the number. Never make one up.
- notes: one short English sentence of anything else useful (job, years, where they banked). No guesses.`;
  const j = await chat('understand', system, String(story).slice(0, 1200));
  // Code checks Gemma: names must look like names, a CNIC must really be in the story, provinces from the list.
  const digits = String(story).replace(/\D/g, '');
  const clean = (s) => (typeof s === 'string' && NAME_OK.test(s.trim()) ? s.trim().toUpperCase() : '');
  const cnic = String(j.cnic || '').replace(/\D/g, '');
  return {
    name: clean(j.name),
    father: clean(j.father),
    relation: ['S/O', 'D/O', 'W/O'].includes(j.relation) ? j.relation : '',
    city: typeof j.city === 'string' ? j.city.slice(0, 40) : '',
    province: PROVINCES.includes(j.province) ? j.province : '',
    cnic: cnic && digits.includes(cnic) && (cnic.length === 13 || cnic.length === 11) ? cnic : '',
    spellings: (Array.isArray(j.spellings) ? j.spellings : []).map(clean).filter(Boolean).slice(0, 4),
    notes: typeof j.notes === 'string' ? j.notes.slice(0, 240) : '',
  };
}

export async function review(query, notes, cands) {
  const system = `You double-check possible matches between a deceased relative and rows in Pakistan's unclaimed-deposit lists.
A matching score from a separate model is given; do not repeat it. Use the family's notes (city, work, years) and the row (branch, province, year listed, last activity date).
Return JSON only: {"reviews": [{"id": 0, "verdict": "likely|maybe|unlikely", "reason": "one short sentence"}]}.
Reasons must only use facts shown. "not listed" means the list does not say, so it neither matches nor clashes.
Say "unlikely" when the row's details clash with the notes (e.g. a different father's name, a branch in another province, last activity after the person died).`;
  const user = JSON.stringify({
    looking_for: query, family_notes: notes || '',
    rows: cands.map((c) => ({ id: c.i, name_in_list: c.n, father_or_husband_in_list: c.f?.length ? c.f.join(' ') : 'not listed', branch: c.br, province: c.pr, listed_in: c.y, last_activity: c.la || 'not given', kind: c.k, score: Math.round(c.p * 100) / 100 })),
  });
  const j = await chat('review', system, user);
  const ids = new Set(cands.map((c) => c.i));
  const out = {};
  for (const r of Array.isArray(j.reviews) ? j.reviews : []) {
    // only rows we showed it, only the three verdicts, short plain reasons
    r.id = Number(r.id);
    if (!ids.has(r.id) || !['likely', 'maybe', 'unlikely'].includes(r.verdict)) continue;
    out[r.id] = { verdict: r.verdict, reason: String(r.reason || '').slice(0, 220) };
  }
  return out;
}

export async function letterBody(lang, query, row, notes) {
  const system = `Write the personal paragraph of a letter from the legal heirs of a deceased account holder to a bank branch manager in Pakistan, asking to start a refund claim for an unclaimed deposit the bank surrendered to the State Bank.
Language: ${lang === 'ur' ? 'Urdu (Urdu script)' : 'English'}. Polite, plain, 3 sentences.
Do NOT write any numbers, amounts, dates, account numbers or CNICs: the letter template adds those. Do not invent facts.
Return JSON only: {"paragraph": ""}`;
  const j = await chat('letter', system, JSON.stringify({ deceased: query.name, father_or_husband: query.father || '', family_notes: notes || '', bank: row.b, branch: row.br }));
  // anything with digits is dropped: amounts and numbers come only from the list row
  return String(j.paragraph || '').replace(/[\d٠-٩۰-۹]+[\d,./-]*/g, '').slice(0, 900);
}
