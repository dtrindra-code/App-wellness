// Sanity checks for the "Revenir à moi" journey content (src/data/journey.ts).
// Usage: node scripts/check-journey.mjs   (exits 1 when an assertion fails)
// Content only, no personal data.
import { buildSync } from 'esbuild';

const out = buildSync({ entryPoints: ['src/data/journey.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
const J = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const PHASES = ['regles', 'folliculaire', 'fertile', 'luteale', 'premenstruel', 'retard', 'grossesse'];
const BANNED = [/aurais d[ûu]/i, /échec/i, /paresse/i, /faible/i, /tu devrais/i, /il faut/i, /kilo|\bkg\b|maigr|poids/i];
const texts = [];

// needs
const NEED_KEYS = ['repos', 'calme', 'lien', 'mouvement', 'plaisir', 'aide', 'espace', 'reconnaissance'];
ok(J.NEEDS.length === 8 && NEED_KEYS.every((k) => J.NEEDS.some((n) => n.key === k)), 'NEEDS has the 8 keys');
J.NEEDS.forEach((n) => texts.push(n.label));

// chapters
ok(J.CHAPTERS.length === 4, '4 chapters');
J.CHAPTERS.forEach((c, i) => {
  ok(c.index === i + 1, `chapter ${i + 1} index`);
  ok(c.intro.length <= 280, `chapter ${c.index} intro ≤ 280 (${c.intro.length})`);
  ok(c.title && c.subtitle && c.recapPrompt, `chapter ${c.index} fields`);
  texts.push(c.title, c.subtitle, c.intro, c.recapPrompt);
});

// prompts
ok(J.PROMPTS.length === 60, `60 prompts (${J.PROMPTS.length})`);
const days = new Set(J.PROMPTS.map((p) => p.day));
ok(days.size === 60 && [...Array(60)].every((_, i) => days.has(i + 1)), 'unique days 1..60');
for (const ch of [1, 2, 3, 4]) ok(J.PROMPTS.filter((p) => p.chapter === ch).length === 15, `chapter ${ch} has 15 prompts`);
const chips = (list, where) => {
  ok(Array.isArray(list) && list.length >= 3 && list.length <= 6, `${where}: 3–6 chips (${list?.length})`);
  (list ?? []).forEach((c) => { ok(c.length <= 40, `${where}: chip ≤ 40 (${c})`); texts.push(c); });
  ok(new Set(list).size === list.length, `${where}: unique chips`);
};
let withVariants = 0;
for (const p of J.PROMPTS) {
  const w = `day ${p.day}`;
  ok(p.chapter === Math.ceil(p.day / 15), `${w}: chapter matches day`);
  ok(p.title.length <= 60, `${w}: title ≤ 60`);
  ok(p.question.length <= 160, `${w}: question ≤ 160 (${p.question.length})`);
  chips(p.chips, w);
  if (p.tip !== undefined) { ok(p.tip.length <= 140, `${w}: tip ≤ 140 (${p.tip.length})`); texts.push(p.tip); }
  texts.push(p.title, p.question);
  if (p.variants && Object.keys(p.variants).length) withVariants++;
  for (const [ph, v] of Object.entries(p.variants ?? {})) {
    ok(PHASES.includes(ph), `${w}: known phase ${ph}`);
    ok(v.question.length <= 160, `${w}/${ph}: question ≤ 160 (${v.question.length})`);
    texts.push(v.question);
    if (v.chips) chips(v.chips, `${w}/${ph}`);
  }
}
ok(withVariants >= 40, `≥ 40 days with phase variants (${withVariants})`);

// rules
ok(J.RULES.length >= 10 && J.RULES.length <= 16, `~12 rules (${J.RULES.length})`);
ok(new Set(J.RULES.map((r) => r.key)).size === J.RULES.length, 'unique rule keys');
const AUTO = ['move', 'water', 'habit:me', 'habit:screens', 'habit:sleep', 'habit:light', 'habit:breakfast', 'habit:coherence', 'habit:walk'];
for (const r of J.RULES) {
  ok(r.label.length <= 40, `rule ${r.key}: label ≤ 40 (${r.label.length})`);
  ok(r.detail.length <= 80, `rule ${r.key}: detail ≤ 80 (${r.detail.length})`);
  ok(['corps', 'tete', 'coeur'].includes(r.area), `rule ${r.key}: area`);
  ok(r.auto === undefined || AUTO.includes(r.auto), `rule ${r.key}: auto`);
  texts.push(r.label, r.detail);
}
ok(JSON.stringify(J.DEFAULT_RULES) === JSON.stringify(['move', 'water', 'meal-seated', 'me-time', 'screens-off']), 'DEFAULT_RULES');
ok(J.DEFAULT_RULES.every((k) => J.RULES.some((r) => r.key === k)), 'DEFAULT_RULES exist in RULES');
const autoOf = (k) => J.RULES.find((r) => r.key === k)?.auto;
ok(autoOf('move') === 'move' && autoOf('water') === 'water' && autoOf('me-time') === 'habit:me' && autoOf('screens-off') === 'habit:screens' && !autoOf('meal-seated'), 'default rules auto wiring');

// sunday reset
ok(J.SUNDAY_RESET.length === 5, '5 reset steps');
ok(new Set(J.SUNDAY_RESET.map((s) => s.key)).size === 5, 'unique reset keys');
J.SUNDAY_RESET.forEach((s) => { texts.push(s.title, s.prompt, ...(s.chips ?? [])); ok(s.title && s.prompt, `reset ${s.key} fields`); });

// promptFor
for (const ph of [null, ...PHASES]) {
  for (let d = 1; d <= 60; d++) {
    const r = J.promptFor(d, ph);
    ok(r && r.title && r.question && r.chips.length >= 3 && r.chapter?.index === Math.ceil(d / 15), `promptFor(${d}, ${ph})`);
  }
}
ok(J.promptFor(0, null).title === J.PROMPTS[0].title && J.promptFor(99, 'regles').chapter.index === 4, 'promptFor clamps');
ok(J.promptFor(1, 'regles').question !== J.promptFor(1, null).question, 'variant used');

// wording
for (const t of texts) for (const re of BANNED) ok(!re.test(t), `banned ${re} in « ${t} »`);

console.log(fails ? `${fails} échec(s)` : `journey OK: ${J.PROMPTS.length} prompts, ${withVariants} with phase variants, ${J.RULES.length} rules`);
process.exit(fails ? 1 : 0);
