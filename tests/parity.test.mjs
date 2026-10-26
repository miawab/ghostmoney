// The browser matcher (public/match.js) must agree with the Python one (gm/), or the page would look in the
// wrong shards and score rows differently from what TabPFN was trained on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseName, shardKeys, shardOf, features } from '../public/match.js';

const v = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

test('names parse, key and shard the same as Python', () => {
  let bad = [];
  for (const n of v.names) {
    const p = parseName(n.raw);
    const ks = shardKeys(p.own);
    const shards = [...new Set(ks.map((k) => shardOf(k)))].sort((a, b) => a - b);
    const ok = JSON.stringify(p.own) === JSON.stringify(n.own) && JSON.stringify(p.father) === JSON.stringify(n.father) &&
      p.relation === n.relation && JSON.stringify(ks) === JSON.stringify(n.keys) && JSON.stringify(shards) === JSON.stringify(n.shards);
    if (!ok) bad.push({ raw: n.raw, py: [n.own, n.father, n.keys], js: [p.own, p.father, ks] });
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${v.names.length} names differ`);
});

test('pair features match Python', () => {
  let bad = [];
  for (const p of v.pairs) {
    const A = parseName(p.a), B = parseName(p.b);
    const f = features(A.own, A.father, p.pa, B.own, B.father, p.pb, p.fq);
    if (f.some((x, i) => Math.abs(x - p.f[i]) > 1e-3)) bad.push({ a: p.a, b: p.b, py: p.f, js: f });
  }
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} of ${v.pairs.length} pairs differ`);
});
