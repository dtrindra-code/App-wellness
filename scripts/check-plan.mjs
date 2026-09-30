// Sanity checks for the training plan engine (src/data/plan.ts) on fictional profiles.
// Usage: node scripts/check-plan.mjs   (exits 1 when an assertion fails)
// No personal data: every profile and date below is made up.
import { buildSync } from 'esbuild';

const out = buildSync({ entryPoints: ['src/data/plan.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
const plan = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

// ---------- date helpers (UTC, independent from the app) ----------
const D = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const add = (s, n) => iso(D(s) + n * 86400000);
const diff = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const wd = (s) => (new Date(D(s)).getUTCDay() + 6) % 7;
const mod = (a, n) => ((a % n) + n) % n;

const BASE = {
  onboarded: true, sex: 'f', age: 34, heightCm: 165, startWeight: 70, startDate: '2026-10-01', goalWeight: 64,
  finalGoalWeight: 60, goalDate: '2026-12-13', lavageEnd: '2026-10-21', vacationStart: '2026-12-14', vacationEnd: '2026-12-28',
  prepStart: '2027-01-04', raceDate: '2027-06-13', raceName: 'Half test', activity: 1.3, basketDays: [],
  cycle: { tracking: true, avgLength: 28, periodLength: 5, lutealLength: 14, ttc: false, pregnant: false },
};
const TUE_THU_SAT = [1, 3, 5];

function daysWith(starts, flow = {}) {
  const days = {};
  for (const s of starts) days[s] = { date: s, meals: [], workouts: [], cycle: { period: 'start' } };
  for (const [s, n] of Object.entries(flow)) for (let i = 1; i < n; i++) { const d = add(s, i); days[d] = { date: d, meals: [], workouts: [], cycle: { period: 'flow' } }; }
  return days;
}

/** name, profile patch, logged starts, as-of date, independent model? */
const CASES = [
  { name: 'C25 6/10 basket M/J/S', len: 25, starts: ['2026-10-06'], basket: TUE_THU_SAT },
  { name: 'C25 6/10 sans basket', len: 25, starts: ['2026-10-06'], basket: [] },
  { name: 'C25 20/10 basket M/J/S TTC', len: 25, starts: ['2026-09-27'], basket: TUE_THU_SAT, ttc: true },
  { name: 'C25 2 règles notées (gap 25) + 7 j de flux', len: 25, starts: ['2026-09-11', '2026-10-06'], flow: { '2026-10-06': 7 }, basket: TUE_THU_SAT, pl: 7 },
  { name: 'C28 1/10 basket M/J/S', len: 28, starts: ['2026-10-01'], basket: TUE_THU_SAT },
  { name: 'C28 12/10 sans basket TTC', len: 28, starts: ['2026-09-14'], basket: [], ttc: true },
  { name: 'C28 25/9 basket M/J/S, 4 séances, base 25 min', len: 28, starts: ['2026-09-25'], basket: TUE_THU_SAT, patch: { sessionsPerWeek: 4, runBaseMin: 25 } },
  { name: 'C28 7/10 basket L/Me, piscine 4 j avant / 3 j après', len: 28, starts: ['2026-10-07'], basket: [0, 2], patch: { noSwimBefore: 4, noSwimAfter: 3 } },
  { name: 'C28 retard (règles attendues 6/10, as-of 6/10)', len: 28, starts: ['2026-09-05'], basket: TUE_THU_SAT, asOf: '2026-10-06', modelFree: true },
  { name: 'Grossesse, basket M/J/S', len: 28, starts: ['2026-09-20'], basket: TUE_THU_SAT, pregnant: true },
];

const FROM = '2026-10-01';
const TO = '2027-06-13';
const RUNWALK = /course-marche|run-walk|min de marche\s*\)|\/\s*\d+\s*min(ute)?s?\s+de marche|marcher \d+ min|alterne(r)? course et marche/i;

let failures = 0;
const results = [];

for (const c of CASES) {
  const profile = {
    ...BASE, basketDays: c.basket, ...(c.patch ?? {}),
    cycle: { ...BASE.cycle, avgLength: c.len, ttc: !!c.ttc, pregnant: !!c.pregnant },
  };
  const days = daysWith(c.starts, c.flow);
  const asOf = c.asOf ?? '2026-09-30';
  const weeks = plan.planWeeks(profile, days, asOf);
  const set = plan.planSettings(profile);
  const N = set.noSwimBefore, M = set.noSwimAfter, P = c.pl ?? 5, L = c.len;
  const S0 = c.starts[c.starts.length - 1];
  const errs = [];
  const fail = (m) => { if (errs.length < 8) errs.push(m); };

  // Independent model (single projection from the last logged start).
  const indepDay = (d) => mod(diff(S0, d), L) + 1;
  const indepNoSwim = (d) => {
    const day = indepDay(d);
    return day <= P + M || day > L - N;
  };
  const indepPhase = (d) => {
    const day = indepDay(d);
    if (day <= P) return 'regles';
    if (day > L - 5) return 'premenstruel';
    const ov = L - 14 + 1; // cycle day of ovulation (next period − luteal length)
    if (day >= ov - 5 && day <= ov + 1) return 'fertile';
    if (day < ov - 5) return 'folliculaire';
    return 'luteale';
  };
  const phaseOf = (d) => (c.pregnant ? null : c.modelFree ? plan.planDay(d, profile, days, asOf).phase : indepPhase(d));
  const noSwimOf = (d) => (c.pregnant ? false : c.modelFree ? plan.planDay(d, profile, days, asOf).noSwim : indepNoSwim(d));

  const all = weeks.flatMap((w) => w.sessions).filter((s) => s.date >= FROM && s.date <= TO);
  const ids = new Set();
  let swims = 0, keys = 0;
  for (const s of all) {
    if (ids.has(s.id)) fail(`id en double ${s.id}`);
    ids.add(s.id);
    if (s.id !== `${s.date}-${s.sport}`) fail(`id ${s.id} ≠ date-sport`);
    const ph = phaseOf(s.date);
    const race = s.sport === 'other' && s.date === profile.raceDate;
    if (s.sport === 'swim') { swims++; if (noSwimOf(s.date)) fail(`piscine dans la fenêtre : ${s.date} (${ph})`); }
    if (s.sport === 'strength' && s.minutes > 30) fail(`renfo > 30 min : ${s.id} ${s.minutes}`);
    const hard = s.intensity === 'soutenu' || s.key;
    if (s.key) keys++;
    if (!race && hard && (ph === 'regles' || ph === 'premenstruel' || ph === 'retard')) fail(`séance dure en ${ph} : ${s.id}`);
    if (s.key && ph && ph !== 'folliculaire' && ph !== 'fertile') fail(`séance clé hors folliculaire/fertile : ${s.id} (${ph})`);
    if (c.pregnant && (s.intensity === 'soutenu' || s.key) && !race) fail(`grossesse : séance dure ${s.id}`);
    if (c.pregnant && !race && !/sage-femme/.test(s.why ?? '')) fail(`grossesse : pas de note sage-femme ${s.id}`);
    const b = profile.basketDays;
    const onHoliday = s.date >= profile.vacationStart && s.date <= profile.vacationEnd;
    if (!race && !onHoliday && hard && (b.includes(wd(s.date)) || b.includes(wd(add(s.date, -1))))) fail(`séance dure jour/lendemain de basket : ${s.id}`);
    if (RUNWALK.test(`${s.title} ${s.details} ${s.mini ?? ''}`)) fail(`course-marche : ${s.id}`);
    if (!race && !s.why) fail(`pas de "why" : ${s.id}`);
    if (!race && !s.mini) fail(`pas de mini : ${s.id}`);
  }
  // Exactly sessionsPerWeek required sessions per full pre-prep week.
  let fullWeeks = 0;
  for (const w of weeks) {
    const sun = add(w.start, 6);
    if (w.start < profile.startDate || sun >= profile.vacationStart) continue;
    fullWeeks++;
    const req = w.sessions.filter((s) => !s.optional).length;
    if (req !== set.sessionsPerWeek) fail(`semaine ${w.start} : ${req} séances au lieu de ${set.sessionsPerWeek}`);
  }
  // Prep weeks: at least the setting, at most 5 (or the setting).
  for (const w of weeks) {
    if (w.start < profile.prepStart || add(w.start, 6) >= profile.raceDate) continue;
    const req = w.sessions.filter((s) => !s.optional).length;
    if (req < set.sessionsPerWeek) fail(`prépa ${w.start} : ${req} < ${set.sessionsPerWeek}`);
  }
  const firstRun = all.find((s) => s.sport === 'run');
  if (!firstRun || firstRun.minutes < set.runBaseMin * 0.75 || firstRun.minutes > set.runBaseMin * 1.1) fail(`1re course ${firstRun?.minutes} min vs base ${set.runBaseMin}`);
  // Determinism: same input, same output.
  const again = JSON.stringify(plan.planWeeks({ ...profile }, { ...days }, asOf));
  if (again !== JSON.stringify(weeks)) fail('non déterministe');

  if (errs.length) failures++;
  results.push({ name: c.name, ok: !errs.length, sessions: all.length, swims, keys, fullWeeks, firstRun: firstRun?.minutes, errs });
}

// Recompute when a new period is logged: the plan must change.
{
  const profile = { ...BASE, basketDays: TUE_THU_SAT, cycle: { ...BASE.cycle, avgLength: 25 } };
  const a = JSON.stringify(plan.planWeeks(profile, daysWith(['2026-10-06']), '2026-10-20'));
  const b = JSON.stringify(plan.planWeeks(profile, daysWith(['2026-10-06', '2026-10-27']), '2026-10-27'));
  const ok = a !== b;
  if (!ok) failures++;
  results.push({ name: 'Nouvelles règles notées → plan recalculé', ok, sessions: '-', swims: '-', keys: '-', fullWeeks: '-', firstRun: '-', errs: ok ? [] : ['plan identique'] });
}

console.log('\nASSERTIONS (2026-10-01 → 2027-06-13)');
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name.padEnd(52)} séances ${String(r.sessions).padStart(3)} · nages ${String(r.swims).padStart(3)} · clés ${String(r.keys).padStart(2)} · sem. pleines ${r.fullWeeks} · 1re course ${r.firstRun} min`);
  for (const e of r.errs) console.log('       - ' + e);
}

// ---------- readable table ----------
{
  const profile = { ...BASE, basketDays: TUE_THU_SAT, cycle: { ...BASE.cycle, avgLength: 25 } };
  const days = daysWith(['2026-10-06']);
  const asOf = '2026-09-30';
  const weeks = plan.planWeeks(profile, days, asOf).slice(0, 5);
  const DN = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  console.log('\nPLAN — cycle 25 j, règles le 6 oct. 2026, basket mar/jeu/sam (5 premières semaines, la 1re est partielle)');
  for (const w of weeks) {
    console.log(`\nSemaine ${w.index} (${w.start}) — ${plan.weekSummary(w, profile, days, asOf)}`);
    for (let i = 0; i < 7; i++) {
      const d = add(w.start, i);
      if (d < profile.startDate) continue;
      const pd = plan.planDay(d, profile, days, asOf);
      const tag = `${DN[i]} ${d.slice(5)} ${(pd.phase ? plan.PHASE_SHORT[pd.phase] : '-').padEnd(10)}${pd.noSwim ? ' piscine off' : '            '}${pd.basket ? ' BASKET' : '       '}`;
      const ss = w.sessions.filter((s) => s.date === d);
      if (!ss.length) { console.log(`  ${tag} | ${pd.basket ? '' : 'repos'}`); continue; }
      ss.forEach((s, j) => console.log(`  ${j ? ' '.repeat(tag.length) : tag} | ${s.title} · ${s.minutes} min · ${s.intensity}${s.key ? ' · CLÉ' : ''}${s.optional ? ' · optionnelle' : ''}${s.note ? ` · [${s.note}]` : ''}`));
    }
  }
}

console.log(failures ? `\n${failures} cas en échec` : '\nToutes les assertions passent.');
process.exit(failures ? 1 : 0);
