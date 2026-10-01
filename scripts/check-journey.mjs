// Sanity checks for the "Revenir à moi" journey content (src/data/journey.ts).
// Usage: node scripts/check-journey.mjs   (exits 1 when an assertion fails)
// Content only, no personal data.
import { buildSync } from 'esbuild';

const out = buildSync({ entryPoints: ['src/data/journey.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
const J = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const PHASES = ['regles', 'folliculaire', 'fertile', 'luteale', 'premenstruel', 'retard', 'grossesse'];
const BANNED = [/aurais d[ûu]/i, /échec/i, /paresse/i, /faible/i, /tu devrais/i, /il faut/i, /\btu dois\b/i, /mauvaise m[eè]re/i, /égoïste/i, /honte/i, /(je suis|tu es) nulle/i, /rattraper/i, /en retard sur toi/i, /kilo|\bkg\b|maigr|poids/i];
const texts = [];

// needs
const NEED_KEYS = ['repos', 'calme', 'lien', 'mouvement', 'plaisir', 'aide', 'espace', 'reconnaissance'];
ok(J.NEEDS.length === 8 && NEED_KEYS.every((k) => J.NEEDS.some((n) => n.key === k)), 'NEEDS has the 8 keys');
J.NEEDS.forEach((n) => texts.push(n.label));

const chips = (list, where) => {
  ok(Array.isArray(list) && list.length >= 3 && list.length <= 6, `${where}: 3–6 chips (${list?.length})`);
  (list ?? []).forEach((c) => { ok(c.length <= 40, `${where}: chip ≤ 40 (${c})`); texts.push(c); });
  ok(new Set(list).size === list.length, `${where}: unique chips`);
};
// chapters
const REREAD = 'À relire quand ça monte';
const understand = (u, w) => {
  ok(u && u.title && u.title.length <= 60, `${w}: understand title ≤ 60`);
  ok(Array.isArray(u?.paragraphs) && u.paragraphs.length >= 2 && u.paragraphs.length <= 4, `${w}: 2–4 paragraphs`);
  (u?.paragraphs ?? []).forEach((t, i) => ok(t.length <= 320, `${w}: paragraph ${i + 1} ≤ 320 (${t.length})`));
  texts.push(u.title, ...(u?.paragraphs ?? []));
};
const reread = (r, w) => {
  ok(r?.title === REREAD, `${w}: reread title`);
  ok(Array.isArray(r?.lines) && r.lines.length >= 3 && r.lines.length <= 4, `${w}: 3–4 reread lines`);
  (r?.lines ?? []).forEach((t) => { ok(t.length <= 90, `${w}: reread line ≤ 90 (${t})`); texts.push(t); });
};
const quote = (q, w) => {
  ok(q && typeof q.text === 'string' && q.text.length > 0 && q.text.length <= 180, `${w}: quote ≤ 180`);
  ok(q?.author === undefined || (typeof q.author === 'string' && q.author.length > 0), `${w}: quote author`);
  texts.push(q.text);
};
ok(J.CHAPTERS.length === 4, '4 chapters');
J.CHAPTERS.forEach((c, i) => {
  ok(c.index === i + 1, `chapter ${i + 1} index`);
  ok(c.intro.length <= 280, `chapter ${c.index} intro ≤ 280 (${c.intro.length})`);
  ok(c.title && c.subtitle && c.recapPrompt, `chapter ${c.index} fields`);
  texts.push(c.title, c.subtitle, c.intro, c.recapPrompt);
  quote(c.quote, `chapter ${c.index}`);
  understand(c.understand, `chapter ${c.index}`);
  reread(c.reread, `chapter ${c.index}`);
});

// modules
ok(Array.isArray(J.MODULES) && J.MODULES.length >= 1, 'MODULES present');
const anxMod = J.MODULES.find((m) => m.key === 'anxiete');
ok(anxMod && anxMod.days.length === 6 && anxMod.steps.length === 6, 'anxiety module: 6 days / 6 steps');
ok(anxMod && [2, 3].includes(anxMod.chapter) && anxMod.days.every((d) => Math.ceil(d / 15) === anxMod.chapter), 'anxiety module inside chapter 2 or 3');
ok(anxMod && anxMod.days.every((d, i) => i === 0 || d === anxMod.days[i - 1] + 1), 'anxiety module: consecutive days');
ok(anxMod?.understand?.title === 'Comprendre l’anxiété', 'anxiety module: "Comprendre l’anxiété"');
for (const m of J.MODULES) {
  ok(m.title.length <= 60 && m.intro.length <= 280, `module ${m.key}: title/intro lengths`);
  texts.push(m.title, m.intro, ...m.steps);
  quote(m.quote, `module ${m.key}`);
  understand(m.understand, `module ${m.key}`);
  reread(m.reread, `module ${m.key}`);
  m.days.forEach((d, i) => {
    const p = J.PROMPTS.find((x) => x.day === d);
    ok(p?.module?.key === m.key && p.module.step === i + 1, `module ${m.key}: day ${d} tagged step ${i + 1}`);
    ok(p?.theme === 'anxiete', `module ${m.key}: day ${d} theme anxiete`);
  });
}
ok(J.PROMPTS.filter((p) => p.module).length === J.MODULES.reduce((s, m) => s + m.days.length, 0), 'no stray module tags');

// life wheel
const DOMAIN_KEYS = ['sante', 'carriere', 'finance', 'relations', 'contribution', 'loisirs', 'amour', 'developpement'];
ok(J.LIFE_DOMAINS.length === 8 && DOMAIN_KEYS.every((k) => J.LIFE_DOMAINS.some((d) => d.key === k)), 'LIFE_DOMAINS has the 8 keys');
J.LIFE_DOMAINS.forEach((d) => { ok(d.label.length <= 40 && d.hint.length <= 90, `domain ${d.key}: lengths`); texts.push(d.label, d.hint); });

// emotions
const EMO_KEYS = ['joie', 'confiance', 'peur', 'surprise', 'tristesse', 'degout', 'colere', 'anticipation'];
ok(J.EMOTIONS.length === 8 && EMO_KEYS.every((k) => J.EMOTIONS.some((e) => e.key === k)), 'EMOTIONS has the 8 families');
const allNuances = [];
for (const e of J.EMOTIONS) {
  ok(e.nuances.length >= 6 && e.nuances.length <= 8, `emotion ${e.key}: 6–8 nuances (${e.nuances.length})`);
  ok(/^--emo-[a-z]+$/.test(e.color) && /^#[0-9A-F]{6}$/i.test(e.hex), `emotion ${e.key}: color token + hex`);
  e.nuances.forEach((n) => { ok(n.length <= 24, `emotion ${e.key}: nuance ≤ 24 (${n})`); allNuances.push(n); });
  texts.push(e.label, ...e.nuances);
}
ok(new Set(allNuances).size === allNuances.length, 'emotion nuances unique');

// values
ok(J.VALUES.length >= 18 && J.VALUES.length <= 24, `~20 VALUES (${J.VALUES.length})`);
ok(new Set(J.VALUES).size === J.VALUES.length, 'unique VALUES');
J.VALUES.forEach((v) => { ok(v.length <= 24, `value ≤ 24 (${v})`); texts.push(v); });

// science
ok(J.SCIENCE.title === 'Ce que disent les études' && J.SCIENCE.intro && J.SCIENCE.summary, 'SCIENCE fields');
ok(J.SCIENCE.points.length >= 3 && J.SCIENCE.points.length <= 6, 'SCIENCE: 3–6 points');
ok(J.SCIENCE.points.some((p) => /Pennebaker/.test(p.source ?? '')) && J.SCIENCE.points.some((p) => /Emmons & McCullough, 2003/.test(p.source ?? '')), 'SCIENCE cites Pennebaker and Emmons & McCullough');
J.SCIENCE.points.forEach((p) => { ok(p.title && p.text.length <= 280, `science point « ${p.title} » ≤ 280`); texts.push(p.title, p.text); });
(J.SCIENCE.benefits ?? []).forEach((b) => texts.push(b.title, b.text));
texts.push(J.SCIENCE.intro, J.SCIENCE.summary);

// checkpoints
ok(J.CHECKPOINTS.length === 3 && [0, 30, 60].every((d) => J.checkpointFor(d)), 'checkpoints 0 / 30 / 60');
const cp0 = J.checkpointFor(0), cp30 = J.checkpointFor(30), cp60 = J.checkpointFor(60);
ok(cp0?.title === 'Mon point de départ' && cp30?.title === 'Premier regard en arrière' && cp60?.title === 'Ajustements et découvertes', 'checkpoint titles');
for (const cp of J.CHECKPOINTS) {
  const w = `checkpoint ${cp.day}`;
  const keys = cp.fields.map((f) => f.key);
  ok(new Set(keys).size === keys.length, `${w}: unique field keys`);
  ok(['energy', 'stress', 'satisfaction'].every((k) => cp.fields.some((f) => f.kind === 'scale' && f.key === k)), `${w}: energy/stress/satisfaction scales`);
  ok(cp.title.length <= 60 && cp.intro.length <= 280, `${w}: title/intro lengths`);
  quote(cp.quote, w);
  texts.push(cp.title, cp.intro);
  for (const f of cp.fields) {
    texts.push(f.label);
    if ('q' in f) { ok(f.q.length <= 160, `${w}/${f.key}: q ≤ 160`); texts.push(f.q); }
    if (f.kind === 'scale') texts.push(f.low, f.high);
    if (f.kind === 'wheel') texts.push(f.hint);
    if (f.kind === 'choice') { ok(f.options.length >= 2, `${w}/${f.key}: options`); texts.push(...f.options, f.followUp ?? ''); }
    if (f.kind === 'text' && f.chips) chips(f.chips, `${w}/${f.key}`);
  }
}
ok(cp0.fields.some((f) => f.kind === 'wheel') && cp0.fields.some((f) => f.kind === 'values' && f.pick === 3) && cp0.fields.some((f) => f.key === 'intention' && f.kind === 'text'), 'day 0: wheel + intention + 3 values');
ok(['intentionBack', 'innerChild', 'values', 'beliefs', 'strengths', 'learning'].every((k) => cp30.fields.some((f) => f.key === k)), 'day 30 fields');
ok(cp30.fields.find((f) => f.key === 'intentionBack')?.options.length === 3, 'day 30: oui / non / en chemin');
ok(['intentionBack', 'vision', 'gratitude', 'resilience', 'calm', 'learning'].every((k) => cp60.fields.some((f) => f.key === k)), 'day 60 fields');

// prompts
ok(J.PROMPTS.length === 60, `60 prompts (${J.PROMPTS.length})`);
const days = new Set(J.PROMPTS.map((p) => p.day));
ok(days.size === 60 && [...Array(60)].every((_, i) => days.has(i + 1)), 'unique days 1..60');
for (const ch of [1, 2, 3, 4]) ok(J.PROMPTS.filter((p) => p.chapter === ch).length === 15, `chapter ${ch} has 15 prompts`);
let withVariants = 0;
for (const p of J.PROMPTS) {
  const w = `day ${p.day}`;
  ok(p.chapter === Math.ceil(p.day / 15), `${w}: chapter matches day`);
  ok(p.title.length <= 60, `${w}: title ≤ 60`);
  ok(p.question.length <= 160, `${w}: question ≤ 160 (${p.question.length})`);
  chips(p.chips, w);
  ok(J.THEMES[p.theme], `${w}: known theme ${p.theme}`);
  ok(Array.isArray(p.questions) && p.questions.length >= 2 && p.questions.length <= 3, `${w}: 2–3 questions (${p.questions?.length})`);
  ok(p.questions[0].q === p.question && JSON.stringify(p.questions[0].chips) === JSON.stringify(p.chips), `${w}: question/chips mirror questions[0]`);
  p.questions.forEach((q, i) => {
    ok(typeof q.q === 'string' && q.q.length > 0 && q.q.length <= 160, `${w}: q${i + 1} ≤ 160 (${q.q?.length})`);
    if (i > 0 && q.chips) chips(q.chips, `${w}/q${i + 1}`);
    texts.push(q.q);
  });
  ok(new Set(p.questions.map((q) => q.q)).size === p.questions.length, `${w}: distinct questions`);
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
const REQUIRED_THEMES = ['meteo', 'corps', 'modeles', 'enfant', 'valeurs', 'croyances', 'forces', 'anxiete', 'charge', 'culpabilite', 'besoins', 'limites', 'joie', 'gratitude', 'lien', 'identite', 'vision', 'lettre'];
const usedThemes = new Set(J.PROMPTS.map((p) => p.theme));
for (const t of REQUIRED_THEMES) ok(usedThemes.has(t), `theme covered: ${t}`);
ok(J.PROMPTS.filter((p) => p.theme === 'anxiete').length === 6, '6 anxiety days');
Object.values(J.THEMES).forEach((t) => texts.push(t));

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
    ok(r.questions.length >= 2 && r.questions.length <= 3 && r.questions[0].q === r.question && r.theme && r.themeLabel, `promptFor(${d}, ${ph}) questions`);
  }
}
ok(J.promptFor(0, null).title === J.PROMPTS[0].title && J.promptFor(99, 'regles').chapter.index === 4, 'promptFor clamps');
ok(J.promptFor(1, 'regles').question !== J.promptFor(1, null).question, 'variant used');
ok(J.promptFor(1, 'regles').questions[0].q === J.promptFor(1, 'regles').question && J.promptFor(1, 'regles').questions[1].q === J.promptFor(1, null).questions[1].q, 'variant replaces only the first question');
ok(J.promptFor(21, null).module?.step === 1 && J.promptFor(26, null).module?.of === 6 && !J.promptFor(20, null).module, 'promptFor module info');

// wording
for (const t of texts) for (const re of BANNED) ok(!re.test(t), `banned ${re} in « ${t} »`);

console.log(fails ? `${fails} échec(s)` : `journey OK: ${J.PROMPTS.length} days (${J.PROMPTS.reduce((s, p) => s + p.questions.length, 0)} questions), ${withVariants} with phase variants, ${J.CHECKPOINTS.length} checkpoints, ${J.EMOTIONS.length} emotions, ${J.LIFE_DOMAINS.length} domains, ${J.RULES.length} rules`);
process.exit(fails ? 1 : 0);
