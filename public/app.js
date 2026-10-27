import * as M from './match.js';
import * as G from './agent.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => 'Rs ' + Math.round(n).toLocaleString('en-PK');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// city -> province as the lists write it (the score compares provinces)
const CITY = {
  Punjab: 'Lahore Faisalabad Rawalpindi Multan Gujranwala Sialkot Sargodha Bahawalpur Sahiwal Sheikhupura Jhang Rahim_Yar_Khan Gujrat Kasur Okara Sadiqabad Chiniot Kamoke Mandi_Bahauddin Jhelum Khanewal Hafizabad Muzaffargarh Dera_Ghazi_Khan Vehari Attock Chakwal Mianwali Bhakkar Layyah Narowal Pakpattan Toba_Tek_Singh Lodhran Khushab Talagang Murree Kot_Addu',
  Sindh: 'Karachi Hyderabad Sukkur Larkana Nawabshah Mirpur_Khas Jacobabad Shikarpur Khairpur Dadu Thatta Badin Sanghar Umerkot Tando_Adam Ghotki Kandhkot',
  'Khyber Pukhtoon Khaw': 'Peshawar Mardan Abbottabad Swat Mingora Kohat Bannu Dera_Ismail_Khan Charsadda Nowshera Mansehra Swabi Haripur Chitral Dir Malakand Karak Lakki_Marwat Tank Batagram',
  Balochistan: 'Quetta Turbat Khuzdar Gwadar Chaman Sibi Zhob Loralai Hub Nushki Kalat Mastung',
  Federal: 'Islamabad',
  'Gilgit Baltistan': 'Gilgit Skardu Hunza Ghizer Astore Chilas',
  'Azad & Jammu Kashmir': 'Muzaffarabad Mirpur Kotli Bagh Rawalakot Bhimber Palak',
};
const PROV_ALIASES = { punjab: 'Punjab', sindh: 'Sindh', kp: 'Khyber Pukhtoon Khaw', kpk: 'Khyber Pukhtoon Khaw', 'khyber pakhtunkhwa': 'Khyber Pukhtoon Khaw', nwfp: 'Khyber Pukhtoon Khaw', balochistan: 'Balochistan', baluchistan: 'Balochistan', islamabad: 'Federal', ict: 'Federal', 'gilgit-baltistan': 'Gilgit Baltistan', gb: 'Gilgit Baltistan', 'azad kashmir': 'Azad & Jammu Kashmir', ajk: 'Azad & Jammu Kashmir' };
const cityToProv = {};
for (const [p, list] of Object.entries(CITY)) for (const c of list.split(' ')) cityToProv[c.replace(/_/g, ' ').toLowerCase()] = p;
$('#cities').innerHTML = Object.keys(cityToProv).sort().map((c) => `<option value="${c.replace(/\b\w/g, (x) => x.toUpperCase())}">`).join('');
const provinceOf = (s) => { const k = (s || '').trim().toLowerCase(); return cityToProv[k] || PROV_ALIASES[k] || ''; };

// ---- stats ----
let sizes = [];  // KB per index piece
let indexVer = '';  // changes when the index is rebuilt, so a cached old piece is never mixed in
const BIG = 3000;
const statsReady = fetch('stats.json').then((r) => r.json()).then((s) => {
  sizes = s.sizes || [];
  indexVer = String(s.rows || '');
  $('#sPeople').textContent = (s.people / 1e6).toFixed(2) + ' million';
  $('#sMoney').textContent = 'Rs ' + (s.pkr_people / 1e9).toFixed(1) + ' billion';
  $('#sYears').textContent = Object.keys(s.by_year).length + ' years';
}).catch(() => {});

// ---- Gemma status ----
const pill = $('#gemmaPill');
let gemmaInfo = {};
G.detect().then((d) => { gemmaInfo = d; paintPill(); });
function paintPill(text) {
  pill.classList.toggle('on', G.ready());
  pill.textContent = text || (G.ready() ? `Gemma: ${G.where()}` : gemmaInfo.canBrowser ? 'Gemma: load in this tab' : 'Gemma: off');
  $('#storyHint').textContent = G.ready()
    ? `Gemma (${G.where()}) turns this into search fields. The story stays on this device.`
    : 'Gemma needs to load first (about 1.5 GB, once). Tap the Gemma button at the top, or fill in the form instead.';
}
pill.addEventListener('click', async () => {
  if (G.ready()) return;
  if (!gemmaInfo.canBrowser) { alertBox('This browser cannot run Gemma (no WebGPU). The search still works without it.'); return; }
  try {
    await G.loadInBrowser((p) => paintPill(`Gemma: loading ${Math.round((p.progress || 0) * 100)}%`));
    paintPill();
  } catch (e) { paintPill(); alertBox('Gemma could not load here: ' + e.message); }
});
function alertBox(msg) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = msg; $('.search').append(p); setTimeout(() => p.remove(), 9000); }

// ---- tabs ----
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
  $('#fName').required = b.dataset.tab === 'form';
}));

// ---- run steps ----
let stepList;
function step(who, text) {
  const li = document.createElement('li');
  li.className = 'doing';
  li.innerHTML = `<span class="dot"></span><span><span class="who">${who}</span>${esc(text)}</span><small></small>`;
  stepList.append(li);
  const t0 = performance.now();
  return {
    done(note, cls = 'done') { li.className = cls; li.querySelector('small').textContent = (note ? note + ' · ' : '') + ((performance.now() - t0) / 1000).toFixed(1) + ' s'; },
    text(t) { li.children[1].innerHTML = `<span class="who">${who}</span>${esc(t)}`; },
  };
}

// ---- search ----
let last = null;
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#goBtn');
  btn.disabled = true;
  $('#run').hidden = false; $('#results').hidden = true;
  stepList = $('#steps'); stepList.innerHTML = '';
  G.trace.length = 0;
  try { await run(); } catch (err) { step('error', err.message).done('', 'fail'); console.error(err); }
  btn.disabled = false;
});

async function run() {
  const storyMode = !$('[data-panel="story"]').hidden;
  let q = { name: $('#fName').value.trim(), father: $('#fFather').value.trim(), city: $('#fCity').value.trim(), cnic: M.cnicDigits($('#fCnic').value), spellings: [], notes: '' };
  if (storyMode) {
    const story = $('#fStory').value.trim();
    if (!story) throw new Error('Write a few words about them first.');
    if (!G.ready()) throw new Error('Gemma is not loaded. Tap the Gemma button at the top, or use the form.');
    const s = step('gemma', 'Reading your description');
    const u = await G.understand(story);
    if (!u.name) { s.done('no name found', 'fail'); throw new Error('Gemma could not find a name in that. Try the form.'); }
    q = { ...q, ...u, city: u.city || u.province };
    s.done(`${u.name}${u.father ? ' · ' + u.relation + ' ' + u.father : ''}${u.spellings.length ? ' · +' + u.spellings.length + ' spellings' : ''}`);
    $('#fName').value = u.name; $('#fFather').value = u.father; $('#fCity').value = q.city; if (u.cnic) $('#fCnic').value = u.cnic;
  }
  if (!q.name) throw new Error('Type their name first.');
  const [ownRaw, fatherRaw] = M.splitRelation(q.name);
  const own = M.tokens(ownRaw);
  const father = M.tokens(q.father || fatherRaw);
  const prov = provinceOf(q.city) || q.city;
  if (!own.length) throw new Error('That name has no letters we can search.');

  // 1. which index pieces to fetch (computed here; only shard numbers go over the network)
  await statsReady;
  const s1 = step('browser', 'Working out the spellings to look for');
  const variants = [own, ...q.spellings.map((x) => M.tokens(M.splitRelation(x)[0]))].filter((v) => v.length);
  const qKeys = new Set(variants.flatMap((v) => M.shardKeys(v)));
  // Every row is filed under each of its keys, so one key per name is enough to find it. Pieces
  // for very common parts (Ahmad, Rehman) run to 15 MB, so skip those when a smaller key covers the name.
  const kb = (k) => sizes[M.shardOf(k)] || 0;
  const picked = variants.flatMap((v) => {
    const ks = M.shardKeys(v).sort((a, b) => kb(a) - kb(b));
    const small = ks.filter((k) => kb(k) <= BIG);
    return small.length ? small : ks.slice(0, 1);
  });
  const shardIds = [...new Set(picked.map((k) => M.shardOf(k)))];
  s1.done(`${[...qKeys].join(', ')} → ${shardIds.length} index piece${shardIds.length > 1 ? 's' : ''}`);

  const s2 = step('browser', `Downloading ${shardIds.length} index piece${shardIds.length > 1 ? 's' : ''}`);
  const t2 = performance.now();
  const shards = await Promise.all(shardIds.map((n) => fetch(`shards/${n}.json.gz?v=${indexVer}`).then((r) => { if (!r.ok) throw new Error('index not available'); return r.json(); })));
  const rows = shards.flat();
  s2.done(`${rows.length.toLocaleString()} rows`);
  G.trace.push({ op: 'gen_ai.execute_tool', name: 'fetch_shards', ms: Math.round(performance.now() - t2), shards: shardIds.length, rows: rows.length });

  // 2. candidates: rows that share a spelling key with any variant
  const s3 = step('browser', 'Comparing every row in those pieces');
  const seen = new Set();
  let cands = [];
  // A CNIC or account number shared by many rows is a placeholder the bank typed in, not a real one.
  const chCount = {};
  for (const r of rows) if (r.ch) chCount[r.ch] = (chCount[r.ch] || 0) + 1;
  const city = (q.city || '').trim().toLowerCase();
  const useCity = city.length >= 3 && !PROV_ALIASES[city];
  for (const r of rows) {
    if (seen.has(r.i)) continue;
    if (r.ch && (chCount[r.ch] > 3 || /^(0000|1234|5678|9999|1111)$/.test(r.c4))) { r.ch = ''; r.c4 = ''; }
    if (/^0+$/.test(r.ac)) r.ac = '';
    const rk = M.shardKeys(r.o);
    if (!rk.some((k) => qKeys.has(k))) continue;
    seen.add(r.i);
    // best feature row over the spelling variants
    let best = null;
    for (const v of variants) {
      const f = M.features(v, father, prov, r.o, r.f, r.pr, r.fq || 1);
      if (!best || f[6] + f[0] > best[6] + best[0]) best = f;
    }
    cands.push({ ...r, fx: best, cityHit: useCity && `${r.br} ${r.ad}`.toLowerCase().includes(city) });
  }
  // CNIC: checked here against a hash in the row, never sent anywhere
  let cnicOut = 0;
  if (q.cnic) {
    const h = await M.cnicHash(q.cnic);
    for (const c of cands) c.cnic = c.ch ? (c.ch === h ? 'match' : 'differs') : 'none';
    cnicOut = cands.filter((c) => c.cnic === 'differs').length;
    cands = cands.filter((c) => c.cnic !== 'differs');
  }
  // How many rows carry exactly this name (all name parts agree). For a common name this is the
  // honest headline: thousands, of which only the 250 most promising go on to be scored.
  const sameName = cands.filter((c) => c.fx[1] === 1).length;
  const shared = cands.length;
  // Most promising first: name letters, then the father's name, then province and city.
  const pre = (c) => c.fx[6] + c.fx[0] + c.fx[8] + 0.3 * c.fx[9] + (c.cityHit ? 0.5 : 0) + (c.cnic === 'match' ? 9 : 0);
  cands.sort((a, b) => pre(b) - pre(a));
  cands = cands.slice(0, 250);
  s3.done(`${shared.toLocaleString()} share a spelling${shared > 250 ? ' · closest 250 kept' : ''}${cnicOut ? ` · ${cnicOut} ruled out by CNIC` : ''}`);
  if (!cands.length) return show(q, [], cnicOut);

  // 3. TabPFN scores the numbers
  const s4 = step('tabpfn', `Scoring ${cands.length} rows from 12 numbers each (no names sent)`);
  const t4 = performance.now();
  const r = await fetch('api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: cands.map((c) => c.fx) }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'scoring failed');
  const sc = await r.json();
  cands.forEach((c, i) => { c.p = c.cnic === 'match' ? Math.max(sc.p[i], 0.99) : sc.p[i]; });
  // Code checks the model: a clearly different father's name on the record is a different person.
  // Different only if no part of the name agrees and the letters don't either (so ALLAHDITTA and
  // ALLAH DITA still count as the same father, but LAL DIN does not).
  let fatherOut = 0;
  if (father.length) {
    const fqSkel = new Set(father.map(M.skeleton));
    const fqJoined = father.join('');
    for (const c of cands) {
      if (!c.f?.length || c.cnic === 'match') continue;
      const shared = c.f.some((t) => !M.COMMON.has(t) && fqSkel.has(M.skeleton(t)));
      if (!shared && M.seqRatio(fqJoined, c.f.join('')) < 0.75) { c.p = Math.min(c.p, 0.1); c.fatherDiffers = true; fatherOut++; }
    }
  }
  // The city isn't one of TabPFN's numbers (training rows have no family-typed city), so it only breaks near-ties.
  cands.sort((a, b) => (b.p + (b.cityHit ? 0.05 : 0)) - (a.p + (a.cityHit ? 0.05 : 0)));
  s4.done((sc.model === 'tabpfn' ? 'TabPFN' : 'backup model (TabPFN unreachable)') + (fatherOut ? ` · ${fatherOut} set aside: father's name differs` : ''));
  G.trace.push({ op: 'gen_ai.execute_tool', name: 'tabpfn_match_score', ms: Math.round(performance.now() - t4), rows: cands.length, model: sc.model });

  // 4. Gemma's second opinion on the best few
  const top = cands.filter((c) => c.p >= 0.3).slice(0, 5);
  if (G.ready() && top.length) {
    const s5 = step('gemma', `Reviewing the top ${top.length} with what you told it`);
    try {
      const rev = await G.review({ name: q.name, father: q.father, city: q.city }, q.notes, top);
      for (const c of top) c.review = rev[c.i];
      s5.done(`${Object.keys(rev).length} reviewed`);
    } catch (e) { s5.done(e.message, 'fail'); }
  } else if (top.length) step('gemma', 'Second opinion skipped (Gemma not loaded)').done('', 'skip');

  show(q, cands, cnicOut, sameName);
  fetch('api/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steps: G.trace }) }).catch(() => {});
}

function band(p) { return p >= 0.9 ? ['likely', 'Very likely them'] : p >= 0.7 ? ['likely', 'Likely them'] : p >= 0.5 ? ['maybe', 'Possibly them'] : ['', 'Probably someone else with a similar name']; }

function show(q, cands, cnicOut, sameName = 0) {
  last = { q, cands };
  const strong = cands.filter((c) => c.p >= 0.5);
  const weak = cands.filter((c) => c.p >= 0.3 && c.p < 0.5).slice(0, 15);
  const total = strong.reduce((s, c) => s + (c.a || 0), 0);
  $('#results').hidden = false;
  const banks = [...new Set(strong.map((c) => c.b))];
  // A common name with nothing else to go on: be honest that these are many different people.
  const crowd = strong.length > 5 && !strong.some((c) => c.cnic === 'match');
  const crowdN = Math.max(strong.length, sameName);
  // Even "son of the same father" can be several people: different CNICs under the same name pair.
  const fatherRows = strong.filter((c) => q.father && c.f?.length && !c.fatherDiffers && c.cnic !== 'match');
  const twins = new Set(fatherRows.map((c) => c.ch || c.i)).size > 2 ? fatherRows.length : 0;
  $('#summary').innerHTML = crowd
    ? `<div class="big">${crowdN.toLocaleString()}</div><p><b>accounts belong to people named ${esc(q.name)}</b>, and the lists alone can't tell them apart. ${twins ? `${twins} of them are also listed with the father's name ${esc(q.father)}, under different CNICs.` : q.father ? 'Most rows have no father\'s name recorded.' : 'Adding the father\'s or husband\'s name helps.'} ${q.cnic ? '' : 'A CNIC settles it, if anyone has it saved. '}The closest are below; a branch in the city where they lived is the best clue.</p>`
    : strong.length
    ? `<div class="big">${fmt(total)}</div><p><b>${strong.length} account${strong.length > 1 ? 's' : ''}</b> in the State Bank lists could be ${esc(q.name)}'s, at ${esc(banks.slice(0, 3).join(', '))}${banks.length > 3 ? ' and more' : ''}.${cnicOut ? ` ${cnicOut} rows with the name were ruled out by CNIC.` : ''}</p>
       <div class="listen"><button type="button" data-lang="ur" lang="ur">اردو میں سنیں</button><button type="button" data-lang="en">Listen</button></div>`
    : `<p class="empty">No strong match for ${esc(q.name)} in the lists${cnicOut ? ` (${cnicOut} rows with that name have a different CNIC)` : ''}. Try another spelling, add the father's name, or describe them to Gemma. Many families find nothing, which is good news too: nothing was lost.</p>`;
  $('#summary').querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => listen(b.dataset.lang, strong.length, total, banks, b)));
  const box = $('#cards'); box.innerHTML = '';
  strong.slice(0, 12).forEach((c) => box.append(card(c, q, crowd && crowdN, twins)));
  $('#weaker').hidden = !weak.length;
  if (weak.length) {
    $('#weaker summary').textContent = `${weak.length} weaker matches (similar names, probably other people)`;
    const wb = $('#weakCards'); wb.innerHTML = ''; weak.forEach((c) => wb.append(card(c, q, crowd && crowdN, twins)));
  }
  remember(q.name);
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function card(c, q, crowd = 0, twins = 0) {
  const el = $('#cardTpl').content.firstElementChild.cloneNode(true);
  let [cls, words] = band(c.p);
  // In a crowd of same-name people, a high name score is not identity. Only a CNIC, a matching father's
  // name or the city can lift one row above the rest, so say so.
  const fatherAgrees = q.father && c.f?.length && !c.fatherDiffers;
  if (crowd && c.cnic !== 'match' && !fatherAgrees && c.p >= 0.5) [cls, words] = [c.cityHit ? 'maybe' : '', `Same name, one of ${crowd.toLocaleString()}`];
  if (twins && c.cnic !== 'match' && fatherAgrees && c.p >= 0.5) [cls, words] = [c.cityHit ? 'likely' : 'maybe', `Same name and father, one of ${twins}`];
  if (cls) el.classList.add(cls);
  el.querySelector('.nm').textContent = c.n;
  el.querySelector('.where').textContent = `${c.b} · ${c.br || 'branch not given'}${c.pr ? ' · ' + c.pr : ''}`;
  el.querySelector('.amt').textContent = c.a ? fmt(c.a) : '';
  el.querySelector('.meter span').style.width = Math.round(c.p * 100) + '%';
  el.querySelector('.meter').setAttribute('aria-label', `match ${Math.round(c.p * 100)} percent`);
  el.querySelector('.verdict').textContent = `${words}${words.startsWith('Same name') ? '' : ` · ${Math.round(c.p * 100)}%`}${c.cityHit ? ` · branch in ${q.city}` : ''}${c.fatherDiffers ? ' · father\'s name differs' : ''}`;
  const cnic = c.cnic === 'match' ? '<span class="badge ok">CNIC matches</span>' : c.cnic === 'none' ? '<span class="badge na">no CNIC in list</span>' : c.c4 ? `<span class="badge na">ends ${esc(c.c4)}</span>` : '<span class="badge na">not listed</span>';
  const facts = [['Listed by SBP', c.y], ['Last activity', c.la || 'not given'], ['Account', c.ac ? 'ending ' + c.ac : c.in || '—'], ['Type', c.k || c.in || '—'], ['CNIC', cnic]];
  if (c.f && c.f.length) facts.push(['Father / husband', c.rel ? c.rel + ' ' + c.f.join(' ') : c.f.join(' ')]);
  el.querySelector('.facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${k === 'CNIC' ? v : esc(v)}</dd></div>`).join('');
  if (c.review) {
    const g = el.querySelector('.gemma'); g.hidden = false;
    const caution = c.review.verdict === 'likely' && c.p < 0.5 ? ' (the name evidence is weak, so treat this with care)' : '';
    g.innerHTML = `<b>Gemma: ${esc(c.review.verdict)}.</b> ${esc(c.review.reason)}${caution}`;
  }
  el.querySelector('.b-branch').addEventListener('click', () => whereToClaim(c, el));
  el.querySelector('.b-letter').addEventListener('click', () => letter(c, q, el));
  el.querySelector('.b-not').addEventListener('click', () => el.remove());
  return el;
}

async function whereToClaim(c, el) {
  const x = el.querySelector('.extra'); x.hidden = false;
  x.innerHTML = '<p class="hint">Looking up the branch…</p>';
  const now = c.now ? `<p><b>This bank has changed:</b> ${esc(c.b)} → ${esc(c.now)}. Go to the nearest branch of that bank. <a href="https://www.sbp.org.pk/notifications/bpd/index.htm" target="_blank" rel="noopener">State Bank merger notices</a></p>` : '';
  try {
    const t0 = performance.now();
    const r = await fetch('api/branch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bank: c.now ? c.now.split(' (')[0] : c.b, branch: c.br, province: c.pr }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || 'lookup failed');
    G.trace.push({ op: 'gen_ai.execute_tool', name: 'serpapi_branch_lookup', ms: Math.round(performance.now() - t0) });
    const res = j.results || [];
    x.innerHTML = now + (res.length ? res.map((b) => `<p><b>${esc(b.title)}</b><br>${esc(b.address || '')}${b.phone ? '<br>☎ ' + esc(b.phone) : ''}${b.gps_coordinates ? `<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${b.gps_coordinates.latitude},${b.gps_coordinates.longitude}">Open in Maps</a>` : ''}</p>`).join('')
      + `<p class="hint">From Google Maps via SerpApi, searched as “${esc(j.query)}”. Call before going: branches move.</p>`
      : `<p>No map listing found for “${esc(j.query)}”. Call the bank's helpline and give them the branch name and code ${esc(c.bc || '')}.</p>`);
  } catch (e) { x.innerHTML = now + `<p class="hint">${esc(e.message)}</p>`; }
}

async function letter(c, q, el) {
  const x = el.querySelector('.extra'); x.hidden = false;
  const lang = document.documentElement.lang === 'ur' ? 'ur' : 'en';
  let para = '';
  if (G.ready()) {
    x.innerHTML = '<p class="hint">Gemma is writing the personal part…</p>';
    try { para = await G.letterBody(lang, q, c, q.notes); } catch { para = ''; }
  }
  const under = (c.a || 0) < 100000;
  const body = `To
The Branch Manager
${c.b}${c.now ? ` (now ${c.now})` : ''}
${c.br || '[branch]'}${c.bc ? ` (branch code ${c.bc})` : ''}

Subject: Refund of unclaimed deposit of the late ${c.n}

Respected Sir/Madam,

We are the legal heirs of the late ${q.name}${q.father ? `, ${q.father.match(/^(S|D|W)\/O/i) ? '' : 'S/O '}${q.father}` : ''}. The State Bank of Pakistan's ${c.y} list of unclaimed deposits shows the following entry for this branch:

  Name in the list: ${c.n}
  ${c.ac ? `Account number ending: ${c.ac}` : `Instrument: ${c.in || 'not given'}`}
  Type: ${c.k || c.in || 'not given'}
  Amount: ${c.a ? fmt(c.a) : 'as listed'}${c.la ? `\n  Last activity: ${c.la}` : ''}

${para || 'We request you to start the refund claim under Section 31 of the Banking Companies Ordinance, 1962, and forward it to the State Bank of Pakistan.'}

Enclosed:
  - Copies of the CNICs of all legal heirs
  - Death certificate of the account holder
  - ${under ? 'Indemnity bond on Rs 100 non-judicial stamp paper, signed by all legal heirs' : 'Succession certificate'}

Yours faithfully,
Name: ____________   CNIC: ____________   Phone: ____________`;
  x.innerHTML = `<pre>${esc(body)}</pre><p class="hint">${para ? 'The middle paragraph is Gemma\'s; every name, number and date comes from the list row.' : 'Load Gemma for a personal paragraph. The facts are filled in from the list row.'} Check it before printing.</p><button type="button" class="copy">Copy letter</button>`;
  x.querySelector('.copy').addEventListener('click', () => navigator.clipboard.writeText(body));
}

async function listen(lang, found, total, banks, btn) {
  btn.disabled = true;
  try {
    const r = await fetch('api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, found, total, banks }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'voice unavailable');
    new Audio(URL.createObjectURL(await r.blob())).play();
  } catch (e) { alertBox(e.message); }
  btn.disabled = false;
}

// a candle for each name searched, kept only in this browser
function remember(name) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('gm-candles') || '[]'); } catch { /* private mode */ }
  if (name && !list.includes(name)) list.unshift(name);
  list = list.slice(0, 12);
  try { localStorage.setItem('gm-candles', JSON.stringify(list)); } catch { /* ignore */ }
  paintCandles(list);
}
function paintCandles(list) {
  $('#candles').hidden = !list.length;
  $('#candleList').innerHTML = list.map((n) => `<li><img src="candle.svg" alt="" width="18" height="18">${esc(n)}</li>`).join('');
}
try { paintCandles(JSON.parse(localStorage.getItem('gm-candles') || '[]')); } catch { /* ignore */ }
