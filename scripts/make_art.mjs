// Draws the page art (public/land.svg, papel.svg, calavera.svg). Seeded, so the output never changes.
// All original shapes: a stacked city at night, a marigold bridge, cut-paper flags, a rupee sugar skull.
// run:  node scripts/make_art.mjs
import { writeFileSync } from 'node:fs';

let seed = 1947;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

// ---- the city ----
const W = 1600, H = 620;
const LIT = ['#ffb627', '#ffd166', '#19e3d0', '#ff2e93', '#ff7a1a'];
const WALL = ['#2a1468', '#35187d', '#241059', '#3f1c8c'];

function tower(cx, base, width, floors, far) {
  let out = '', y = base, w = width;
  const lit = far ? 0.3 : 0.55;
  for (let f = 0; f < floors; f++) {
    const h = between(34, 62), x = cx + between(-14, 14) - w / 2;
    y -= h;
    out += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${(h + 2).toFixed(0)}" fill="${pick(WALL)}"/>`;
    out += `<path d="M${(x - 7).toFixed(0)} ${y.toFixed(0)}h${(w + 14).toFixed(0)}l-7 -7h${(-w).toFixed(0)}z" fill="#ff2e93" opacity="${far ? 0.35 : 0.8}"/>`;
    for (let wx = x + 9; wx < x + w - 10; wx += 18) {
      for (let wy = y + 9; wy < y + h - 12; wy += 20) {
        if (rnd() < lit) out += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="9" height="12" rx="4.5" fill="${pick(LIT)}"/>`;
      }
    }
    w *= between(0.82, 0.97);
  }
  out += `<path d="M${cx - w / 2} ${y - 7}L${cx} ${y - 34}L${cx + w / 2} ${y - 7}z" fill="#19e3d0" opacity="${far ? 0.4 : 0.85}"/>`;
  return out;
}

function stars() {
  let s = '';
  for (let i = 0; i < 90; i++) s += `<circle cx="${between(0, W).toFixed(0)}" cy="${between(0, 330).toFixed(0)}" r="${between(0.7, 2).toFixed(1)}" fill="#fff3d6" opacity="${between(0.3, 0.9).toFixed(2)}"/>`;
  return s;
}

// A row of towers, kept low in the middle so the words above stay readable.
function row(step, far) {
  let s = '';
  for (let x = -20; x < W + 60; x += step + between(-20, 30)) {
    const edge = Math.abs(x - W / 2) / (W / 2);
    const floors = Math.round((far ? 3 : 2) + edge * edge * (far ? 6 : 7) + between(0, 1.5));
    s += tower(x, H, between(70, 130), floors, far);
  }
  return s;
}

function bridge() {
  const d = `M-40 ${H - 40}Q${W / 2} ${H - 330} ${W + 40} ${H - 40}`;
  let petals = '';
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, x = (1 - t) ** 2 * -40 + 2 * t * (1 - t) * (W / 2) + t ** 2 * (W + 40);
    const y = (1 - t) ** 2 * (H - 40) + 2 * t * (1 - t) * (H - 330) + t ** 2 * (H - 40);
    petals += `<circle cx="${(x + between(-10, 10)).toFixed(0)}" cy="${(y + between(-10, 10)).toFixed(0)}" r="${between(2.5, 6).toFixed(1)}" fill="${pick(['#ffd166', '#ffb627', '#ff7a1a'])}"/>`;
  }
  return `<path d="${d}" fill="none" stroke="#ff7a1a" stroke-width="44" opacity=".28" filter="url(#glow)"/>
<path d="${d}" fill="none" stroke="#ff9f1c" stroke-width="20"/>
<path d="${d}" fill="none" stroke="#ffd166" stroke-width="5" stroke-dasharray="2 13" stroke-linecap="round"/>${petals}`;
}

writeFileSync('public/land.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140a3a"/><stop offset=".55" stop-color="#3a1590"/><stop offset=".85" stop-color="#a0219a"/><stop offset="1" stop-color="#ff5e7e"/></linearGradient>
<filter id="glow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="20"/></filter>
<filter id="haze"><feGaussianBlur stdDeviation="1.1"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars()}
<circle cx="1330" cy="120" r="62" fill="#ffe9b0"/><circle cx="1330" cy="120" r="100" fill="#ffe9b0" opacity=".12"/>
<g filter="url(#haze)" opacity=".62">${row(105, true)}</g>
${bridge()}
<g>${row(170, false)}</g>
</svg>
`);

// ---- cut-paper flags: skull, coin, flower, coin ----
const SKULL = 'M60 22c-13 0-22 9-22 21 0 8 4 14 10 17v8h24v-8c6-3 10-9 10-17 0-12-9-21-22-21zM50 38a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM70 38a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM60 52l4 7h-8z';
const COIN = 'M60 24a24 24 0 1 0 0 48 24 24 0 0 0 0-48zM60 32a16 16 0 1 1 0 32 16 16 0 0 1 0-32z';
function flowerPath() {
  let p = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, x = 60 + Math.cos(a) * 17, y = 46 + Math.sin(a) * 17;
    p += `M${(x - 6).toFixed(1)} ${y.toFixed(1)}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z`;
  }
  return p + 'M54 46a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z';
}
function flag(i, color, cut) {
  let edge = 'M0 0H120V82';
  for (let k = 0; k < 6; k++) edge += 'a10 10 0 0 1 -20 0';
  return `<g transform="translate(${i * 124} 8)"><path fill-rule="evenodd" fill="${color}" d="${edge}Z${cut}"/></g>`;
}
writeFileSync('public/papel.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="496" height="104" viewBox="0 0 496 104">
<path d="M0 7H496" stroke="#fff3d6" stroke-width="2" opacity=".7"/>
${flag(0, '#ff2e93', SKULL)}${flag(1, '#ff9f1c', COIN)}${flag(2, '#19e3d0', flowerPath())}${flag(3, '#8a3ffc', SKULL)}
</svg>
`);

// ---- the sugar skull ----
let dots = '';
for (let i = 0; i < 8; i++) {
  const a = Math.PI + (i * Math.PI) / 7;
  dots += `<circle cx="${(32 + Math.cos(a) * 21).toFixed(1)}" cy="${(30 + Math.sin(a) * 21).toFixed(1)}" r="1.9" fill="${i % 2 ? '#ff2e93' : '#19e3d0'}"/>`;
}
function eye(cx) {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += `<circle cx="${(cx + Math.cos(a) * 6).toFixed(1)}" cy="${(31 + Math.sin(a) * 6).toFixed(1)}" r="2.6" fill="#ff9f1c"/>`;
  }
  return s + `<circle cx="${cx}" cy="31" r="4.2" fill="#2a1468"/>`;
}
writeFileSync('public/calavera.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<path d="M32 5C17 5 7 16 7 30c0 9 5 16 11 20v7a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-7c6-4 11-11 11-20C57 16 47 5 32 5z" fill="#fff3d6"/>
${dots}${eye(21)}${eye(43)}
<path d="M32 38l4 7h-8z" fill="#ff2e93"/>
<path d="M24 50v8M32 50v8M40 50v8" stroke="#2a1468" stroke-width="2"/>
<circle cx="32" cy="16" r="6" fill="#ff9f1c"/><text x="32" y="19" font-family="Arial,sans-serif" font-weight="700" font-size="8" text-anchor="middle" fill="#2a1468">₨</text>
</svg>
`);
console.log('art written');
