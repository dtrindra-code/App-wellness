// Sanity checks for the cycle guide content (src/lib/cycle-guide.ts) on fictional profiles.
// Usage: node scripts/check-cycle-guide.mjs   (exits 1 when an assertion fails)
// No personal data: every profile, date and number below is made up.
import { buildSync } from 'esbuild';

const load = async (entry) => {
  const out = buildSync({ entryPoints: [entry], bundle: true, format: 'esm', write: false, platform: 'neutral' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const G = await load('src/lib/cycle-guide.ts');
const F = await load('src/lib/foods.ts');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

// ---------- static content ----------
const PHASES = ['regles', 'folliculaire', 'fertile', 'luteale', 'premenstruel', 'retard', 'grossesse'];
const BANNED = [/ashwagandha/i, /tu aurais d[ûu]/i, /rattrap/i, /compens/i, /trich/i, /\bécart/i, /tu devrais/i, /il faut/i];
const SUPPLEMENT = /(compl[ée]ment|g[ée]lule|magn[ée]sium en|vitamine D en|om[ée]ga-3 en capsule|acide folique)/i;
const WEIGHT = /(perte de poids|d[ée]ficit|balance|kilo|\bkg\b|maigr)/i;
const texts = [];

for (const ph of PHASES) {
  const pl = G.PLATES[ph];
  ok(pl, `plate for ${ph}`);
  if (!pl) continue;
  ok(pl.title.length <= 40, `${ph} title ≤ 40 (${pl.title})`);
  ok(pl.favour.length >= 3 && pl.favour.length <= 4, `${ph} favour 3–4`);
  ok(pl.limit.length >= 2 && pl.limit.length <= 4, `${ph} limit 2–4`);
  ok(pl.ideas.length >= 3 && pl.ideas.length <= 6, `${ph} 3–6 ideas`);
  ok(pl.ideas.filter((i) => i.lavageOk).length >= 3, `${ph} ≥ 3 lavage ideas`);
  for (const i of pl.ideas) {
    for (const id of i.foodIds) ok(F.getFood(id), `${ph}/${i.id}: food id ${id} exists`);
    if (i.grams) ok(i.grams.length === i.foodIds.length, `${ph}/${i.id}: grams length`);
    if (i.why) ok(i.why.length <= 60, `${ph}/${i.id}: why ≤ 60 (${i.why.length})`);
  }
  if (ph === 'grossesse') {
    ok(!pl.weight, 'pregnancy has no weight note');
    ok(pl.ideas.every((i) => i.pregnancySafe), 'pregnancy ideas all pregnancySafe');
    ok(pl.ideas.every((i) => !i.foodIds.some((id) => /saumon-fume|huitre|sushi|foie|tartare|carpaccio/.test(id))), 'pregnancy: no raw / smoked ids');
    ok(!WEIGHT.test(pl.focus.replace('Pas de déficit', '')) && !pl.ideas.some((i) => WEIGHT.test(i.label)), 'pregnancy focus without weight talk');
  }
  texts.push(pl.title, pl.focus, pl.focusNoExtra ?? '', ...pl.favour, ...pl.limit, pl.weight ?? '', pl.ttc ?? '', pl.notTtc ?? '', ...pl.ideas.flatMap((i) => [i.label, i.why ?? '']));
}
const ids = new Set();
for (const t of G.REGULATION) {
  ok(!ids.has(t.id), `unique tip id ${t.id}`);
  ids.add(t.id);
  ok(t.title.length <= 40, `tip ${t.id} title ≤ 40`);
  ok(t.detail.length <= 70, `tip ${t.id} detail ≤ 70`);
  ok(`${t.title} · ${t.detail}`.length <= 90, `tip ${t.id} text ≤ 90 (${t.title.length + t.detail.length + 3})`);
  ok(t.priority >= 0 && t.priority <= 10, `tip ${t.id} priority 0–10`);
  texts.push(t.title, t.detail, t.why);
}
for (const s of texts) {
  for (const re of BANNED) ok(!re.test(s), `banned wording ${re} in « ${s} »`);
  const m = s.match(SUPPLEMENT);
  if (m) ok(/acide folique : demande à ton médecin ou ta sage-femme/i.test(s), `supplement only as « acide folique : demande… » in « ${s} »`);
}

// ---------- fictional profiles ----------
const BASE = {
  onboarded: true, sex: 'f', age: 33, heightCm: 166, startWeight: 72, startDate: '2026-10-01', goalWeight: 66,
  finalGoalWeight: 62, goalDate: '2026-12-13', lavageEnd: '2026-10-21', vacationStart: '2026-12-14', vacationEnd: '2026-12-28',
  prepStart: '2027-01-04', raceDate: '2027-06-13', raceName: 'Half test', activity: 1.3, basketDays: [1],
  cycle: { tracking: true, avgLength: 28, periodLength: 5, lutealLength: 14, ttc: false, pregnant: false },
};
const D = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const add = (s, n) => iso(D(s) + n * 86400000);
const state = (patch = {}, cyc = {}, days = {}) => ({
  profile: { ...BASE, ...patch, cycle: { ...BASE.cycle, ...cyc } },
  days, favorites: [], backend: 'local', loaded: true,
});
const START = '2026-09-22';
const withStart = (extra = {}) => ({ [START]: { date: START, meals: [], workouts: [], cycle: { period: 'start' } }, ...extra });
const dayFor = (n) => add(START, n - 1);

// Null cases.
ok(G.guideFor('2026-10-14', state({}, {}, {})) === null, 'null without a logged period');
ok(G.guideFor('2026-10-14', state({}, { tracking: false }, withStart())) === null, 'null when tracking is off');

// Phase by cycle day (28-day cycle, period 5, ovulation J15, fertile J10–J16, premenstruel J24–J28).
const expect = { 2: 'regles', 7: 'folliculaire', 12: 'fertile', 20: 'luteale', 26: 'premenstruel', 31: 'retard' };
for (const [n, ph] of Object.entries(expect)) {
  const g = G.guideFor(dayFor(+n), state({}, {}, withStart()), { moment: 'matin' });
  ok(g && g.phase === ph, `J${n} → ${ph} (got ${g?.phase})`);
}

// Seed-like case: luteal J23, TTC, short night, low Body Battery, stress 44 (spec §5 example).
const d23 = dayFor(23);
const seedDays = withStart({
  [d23]: { date: d23, meals: [], workouts: [], wellbeing: { sleepH: 5.7, bodyBattery: 27, stress: 44 } },
});
const ttc = state({}, { ttc: true }, seedDays);
const pick = (m) => G.guideFor(d23, ttc, { moment: m }).regulate.map((t) => t.id);
const eq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
ok(eq(pick('matin'), ['light-am', 'coffee-cap', 'breathe']), `matin tips (${pick('matin')})`);
ok(eq(pick('journee'), ['walk-lunch', 'nap', 'snack-plan']), `journée tips (${pick('journee')})`);
ok(eq(pick('soir'), ['bed-early', 'cool-room', 'screens']), `soir tips (${pick('soir')})`);
{
  const g = G.guideFor(d23, ttc, { moment: 'matin' });
  ok(g.dayLabel === 'J23 sur ~28', `dayLabel (${g.dayLabel})`);
  ok(g.nutrition.weight === undefined, 'TTC wait: no weight note');
  ok(g.nutrition.ttcNote && /alcool/i.test(g.nutrition.ttcNote), 'TTC note present');
  ok(!/\{cycleExtra\}/.test(g.nutrition.why), 'focus placeholder replaced');
  ok(g.nutrition.ideas.length === 3, '3 ideas');
  ok(g.nutrition.ideas.every((i) => i.kcal > 0 && i.protein >= 0 && i.foodId), 'ideas carry kcal / protein / foodId');
  ok(g.daysToPeriod === 6, `daysToPeriod (${g.daysToPeriod})`);
}
// A ticked pillar sinks to the bottom as done.
{
  const days = structuredClone(seedDays);
  days[d23].habits = { coffee: true };
  const r = G.guideFor(d23, state({}, { ttc: true }, days), { moment: 'matin', tips: 4 }).regulate;
  ok(r[r.length - 1].id === 'coffee-cap' && r[r.length - 1].done, 'done pillar last');
}
// Symptoms weigh in: cramps during the period → bouillotte in the evening, mobility during the day.
{
  const d2 = dayFor(2);
  const days = withStart({ [d2]: { date: d2, meals: [], workouts: [], cycle: { symptoms: ['crampes'] } } });
  ok(G.guideFor(d2, state({}, {}, days), { moment: 'soir' }).regulate[0].id === 'heat', 'crampes → bouillotte first');
  ok(G.guideFor(d2, state({}, {}, days), { moment: 'journee' }).regulate[0].id === 'mobility', 'crampes → mobilité first');
}
// Real extra kcal in the focus (not a hard-coded +100).
{
  const g = G.guideFor(dayFor(20), state({}, {}, withStart()), { moment: 'journee' });
  const m = g.nutrition.why.match(/\+(\d+) kcal/);
  ok(g.nutrition.cycleExtra > 0 ? m && +m[1] === g.nutrition.cycleExtra : !m, `luteal extra in text (${g.nutrition.cycleExtra}: ${g.nutrition.why})`);
}
// Evening: ideas fit the kcal left and come protein first.
{
  const g = G.guideFor(dayFor(20), state({}, {}, withStart()), { moment: 'soir', kcalLeft: 400 });
  ok(g.nutrition.ideas.every((i) => i.kcal <= 400), 'evening ideas ≤ kcal left');
  const pr = g.nutrition.ideas.map((i) => i.protein);
  ok(pr.every((v, i) => i === 0 || pr[i - 1] >= v), 'evening ideas protein first');
}
// Lavage: lavage-friendly ideas only (10 Oct is inside the fictional lavage).
{
  const d = '2026-10-10';
  const g = G.guideFor(d, state({}, {}, withStart()), { moment: 'matin' });
  const plate = G.PLATES[g.phase];
  const okIds = new Set(plate.ideas.filter((i) => i.lavageOk).map((i) => i.id));
  ok(g.conditions.lavage && g.nutrition.ideas.every((i) => okIds.has(i.id)), 'lavage ideas only');
}
// Late period + TTC: test tip, no weight talk.
{
  const g = G.guideFor(dayFor(31), state({}, { ttc: true }, withStart()), { moment: 'matin' });
  ok(g.regulate[0].id === 'test-am' && g.regulate[0].action === 'test', 'late + TTC → test first');
  ok(!g.nutrition.weight, 'late: no weight note');
  ok(/retard/.test(g.dayLabel), `late dayLabel (${g.dayLabel})`);
}
// Pregnancy: phase grossesse, pregnancy-safe ideas, no weight note, no TTC-only or key-session tip.
{
  const g = G.guideFor('2026-11-20', state({}, { pregnant: true, pregnantSince: '2026-11-01', ttc: true }, withStart()), { moment: 'journee', tips: 4 });
  ok(g.phase === 'grossesse' && g.dayLabel === '2 sem. et 5 j', `pregnancy label (${g.dayLabel})`);
  ok(!g.nutrition.weight && g.nutrition.cycleExtra === 0, 'pregnancy: no weight, no extra');
  ok(g.regulate.some((t) => t.id === 'preg-walk'), 'pregnancy walk tip');
  ok(!g.regulate.some((t) => ['key-am', 'no-pressure', 'no-sauna', 'test-am'].includes(t.id)), 'pregnancy: no TTC / key tips');
  ok(!WEIGHT.test(g.meaning), 'pregnancy meaning without weight talk');
}

// Exhaustive: every phase × moment × condition mix gives ≤ max tips with distinct pillars.
const MOMENTS = ['matin', 'journee', 'soir', null];
const BOOL = [false, true];
let combos = 0;
for (const ph of PHASES) for (const m of MOMENTS) for (const shortSleep of BOOL) for (const lowBattery of BOOL) for (const highStress of BOOL)
  for (const ttcOn of BOOL) for (const basketDay of BOOL) for (const symptoms of [[], ['crampes'], ['fringales'], ['humeur basse']]) for (const max of [2, 3, 4]) {
    const c = { shortSleep, lowBattery, highStress, lowMood: symptoms.includes('humeur basse'), symptoms, ttc: ttcOn && ph !== 'grossesse', pregnant: ph === 'grossesse', basketDay, lavage: false };
    const r = G.pickTips(ph, c, m, undefined, max);
    combos++;
    ok(r.length <= max, `≤ ${max} tips ${ph}/${m}`);
    ok(r.length >= Math.min(2, max), `≥ 2 tips ${ph}/${m} (${r.length})`);
    const keys = r.map((t) => t.habitKey ?? t.action ?? t.id);
    ok(new Set(keys).size === keys.length, `distinct pillars ${ph}/${m}`);
    ok(r.every((t) => t.text.length <= 90), 'text ≤ 90');
    if (ph === 'grossesse') ok(!r.some((t) => ['key-am', 'no-pressure', 'no-sauna', 'test-am'].includes(t.id)), 'pregnancy tips');
  }
// Ideas for every phase in every moment, pregnancy and lavage flags.
for (const ph of PHASES) for (const m of MOMENTS) for (const lavage of BOOL) {
  const c = { shortSleep: false, lowBattery: false, highStress: false, lowMood: false, symptoms: [], ttc: false, pregnant: ph === 'grossesse', basketDay: false, lavage };
  const ideas = G.pickIdeas(G.PLATES[ph], '2026-10-14', c, m, 3, 300);
  ok(ideas.length >= (m === 'soir' ? 1 : 3) && ideas.length <= 3, `ideas ${ph}/${m}/${lavage} (${ideas.length})`);
}

console.log(`${combos} tip combinations checked`);
if (fails) { console.log(`${fails} check(s) failed`); process.exit(1); }
console.log('check-cycle-guide: all good');
