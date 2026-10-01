# Cap Maldives — spec V1

Personal mobile web app (iPhone, opened from the home screen, no App Store) for one person.
All UI copy is in **French**, informal "tu", short and warm, never guilt-tripping.

## The user (no personal data in this public repo)
- Does sport **for pleasure**, dislikes forcing themself, restarting after a long break; plays **basketball**.
- Losing weight is the first priority; a half-ironman comes after. Cycle tracking matters (optional trying-to-conceive mode).
- Often eats **HelloFresh** meals (recipe cards show kcal + macros per portion). Has a smart scale and a Garmin watch (no sync in V1; automatic Garmin sync since V8).
- All personal values (weight, height, age, cycle dates, goals) are entered in the app at first launch and stay on the device.

## Timeline (all editable in the profile)
| Phase | Dates | Intent |
|---|---|---|
| Lavage | Thu 1 Oct → 21 Oct 2026 | Fast initial drop (mostly water/glycogen): less salt, sugar, alcohol; lots of water; protein at every meal; carbs ≤ ~100 g/day. **Never** diuretics or dehydration. |
| Perte progressive | 22 Oct → 13 Dec 2026 | Steady moderate deficit, protein high (1.8 g/kg). Milestone before the holidays; the long-term goal continues after. |
| Maldives | 14 → 28 Dec 2026 | Holidays: swim in the lagoon, walk, roughly maintenance. |
| Prépa half | 4 Jan → race (default 13 June 2027) | Specific half-ironman prep (1.9 km swim / 90 km bike / 21.1 km run). |

**Pré-prépa (1 Oct → 13 Dec)** is a *general triathlon preparation* for someone restarting from zero:
3–4 short, easy sessions a week + basket, building habit first, then volume. Swim technique, easy bike (indoor or outdoor), run-walk,
strength/core, mobility. Every session has a **"version mini"** (~15 min) for low-motivation days — doing the mini counts as done.

## Principles
- Low noise: each screen answers one question, most important number first, no clutter, no emoji.
- Honest: show real trend (7-day moving average), not daily noise; celebrate consistency (weeks active, sessions done) over perfection.
- Fast input: logging weight, a meal or a session must take < 10 s.

## Architecture (already in place — do not change without need)
- Vanilla TypeScript + Vite, built to one HTML file published as a claude.ai Artifact.
- `src/types.ts` data model · `src/store.ts` state & persistence (`store.state`, `store.getDay`, `store.updateDay`, `store.saveProfile`, `store.saveFavorites`, `store.weights()`, `store.weightOn()`, `uid()`)
- `src/lib/nutrition.ts` phases, calorie/protein targets, moving average, slope, planned weight curve
- `src/lib/ui.ts` DOM helpers (`h`, `s`, `openSheet`, `toast`, `field`, `segmented`, `bar`, `pickImage`, formatters, sport labels)
- `src/lib/ai.ts` Claude-from-the-page (`aiImagesAvailable`, `askJSON`, `askText`, `aiErrorMessage`) — may be unavailable: hide AI buttons then.
- `src/lib/dates.ts` local ISO date helpers (French formatting)
- `src/styles.css` design tokens + component classes (`card`, `stat`, `list-row`, `glyph`, `chip`, `btn`, `field`, `seg`, `bar`, `quote`, `day-nav`, `empty`, `chart`, `grid-2/3`, `row`, `stack`, `eyebrow`, `num`, `big-number`). Use tokens (`var(--accent)` …), never literal colors.
- Screens in `src/screens/*.ts` implement `Screen` from `src/screens/types.ts`: synchronous render into an empty root, re-called on every store change. Keep transient UI state in module variables. Never subscribe to the store inside a screen.

## Browser constraints (Artifact frame)
No `alert/confirm/prompt` (build confirmations in the page), no service worker, no push notifications, no camera API (use `<input type=file accept=image/*>` via `pickImage()`), no downloads via `<a download>`, no network fetch. localStorage works.
Notifications are done with an **iOS Shortcuts personal automation** (documented in `docs/NOTIFICATIONS.md` and shown in the settings screen).

## V2 additions
- **Weight goals**: `goalWeight`/`goalDate` = the *palier* (milestone) before the holidays; `finalGoalWeight` = long-term goal, reached afterwards at ~0.5 kg/week (`plannedWeight` handles both). Pace up to ~1 kg/week before the milestone is allowed, but calories never go below the floor, so any extra pace must come from movement (`paceBreakdown`).
- **Cycle** (`src/lib/cycle.ts`): cycle day, phase (règles, folliculaire, fenêtre fertile, lutéale, prémenstruel, retard), ovulation estimate (LH test overrides), phase advice for sport/food/weight with `kcalAdjust` and `intensityCap`. With short cycles the fertile window can start right after the period. **TTC mode** (trying to conceive): deficit capped, floor 1400 kcal, fertile window highlighted, alcohol/sauna tips in luteal phase, "test" prompt when late. **Pregnancy mode**: no deficit, pregnancy-safe sport note, consult midwife/doctor.
- **Équilibre** (lifestyle / cortisol): daily pillars checklist (`src/lib/habits.ts`), Garmin numbers typed by hand (`DayLog.wellbeing`: sleep, Body Battery, stress, resting HR, steps), cohérence cardiaque breathing timer, insights linking sleep/stress to weight trend and training. Never recommend supplements such as ashwagandha (not advised when trying to conceive or pregnant).
- **Privacy**: the repo is public. Never put the user's real values (weight, height, age, cycle dates, body composition) in code, docs, tests or examples. Data stays on the device (localStorage) with manual export/import backups.
- **Hosting**: GitHub Pages as an installable PWA (manifest, apple-touch-icon, offline service worker). No Claude runtime there: the `sample` AI features stay hidden automatically.
- Tabs: Aujourd'hui · Poids · Repas · Sport · Équilibre. Settings ("Plus") opens from a gear button in the Today and Équilibre headers (`ctx.go('settings')`).

## V3 additions
- **Plan start**: 1 Oct 2026 (lavage 1 → 21 Oct). Old profiles on 30 Sept are migrated in store.ts.
- **Food search** (no manual ingredient typing): bundled generic French foods (`src/lib/foods.ts`, average values per 100 g + common portions, offline) + Open Food Facts search and barcode lookup at runtime (CORS API, fr). Results → pick quantity (portion or grams) → Meal with `grams`, `foodId` / `offCode`, source 'aliment'. Recents and frequents first. The dev sandbox cannot reach OFF: mock it in tests.
- **Coach** (`src/lib/coach.ts`, rules-based, offline): contextual messages from the user's data (phase, cycle, sleep, stress, sessions, meals, slips). "J'ai craqué" sheet (`src/screens/slip.ts`): logs a Slip without judgement, answers with compassion + 3 concrete next steps (no compensation/restriction), patterns after several slips (cycle phase, short nights, stress, time of day). Morning and evening check-ins; weekly bilan on Sunday. Tone: like a kind human coach — warm, specific, never guilt, never "tu aurais dû".
- **Push notifications**: iOS PWA web push (iOS 16.4+, installed on home screen). A GitHub Actions cron (`.github/workflows/push.yml`) sends a content-less push at fixed slots (Europe/Paris) with the VAPID key and the user's subscription stored as repo secrets; the service worker shows the personalised message the app pre-computed into IndexedDB (`coachMessages`). No personal data ever leaves the phone.

## V6 additions
- **Automatic encrypted backup** (`src/lib/sync.ts`, Plus → Tes données): deleting the home-screen app wipes localStorage, so data can be pushed automatically (4 s debounce + when the app goes to the background) to a **secret gist on the user's own GitHub account**, using a token she creates (Gists read/write only). The data is encrypted on the phone (PBKDF2-SHA256 310 000 iterations → AES-GCM 256, fresh IV per upload); GitHub only stores ciphertext. Token and derived key stay in this browser's localStorage (never the password, never logged). Restore on a new install needs the token + backup password. If a newer backup from another device exists, auto-upload pauses and Plus offers "Restaurer". Manual export/import remains as a fallback; Today and Plus nudge weekly while the backup is off and no export was made.

## V7 — Progrès
- The "Poids" tab becomes **Progrès** (label only: the TabId stays `'weight'`, so navigation and the saved tab keep working): the overall follow-up, keeping everything the weight screen did (chart, palier / final goal, pace, composition and history, now folded).
- Period switch **Semaine / Mois / Depuis le début** (current Mon → today, 1st of the month → today, since `profile.startDate`). Week and month are compared with the same elapsed days of the previous week / month; no comparison chip when the previous period has no data for that card.
- `src/lib/stats.ts` (pure): weight (7-day average at start/end, delta, vs palier / final goal), nutrition (days logged, average kcal vs budget incl. sport bonus and cycle adjust, protein, days within budget, slips and top triggers), sport (sessions vs planned, minis, basket, minutes per sport, running totals and longest run), équilibre (pillars, sleep, nights < 6 h, stress, Body Battery, breathing), cycle per phase (weight vs the cycle's mean, energy, sessions, slips). Missing data is `null`, never 0 or NaN.
- Sections: LE MOT DU COACH (3 lines: biggest win, one honest observation, one focus; no weight-loss talk in pregnancy mode) · TON POIDS · TON ASSIETTE · TON SPORT · TON ÉQUILIBRE · TON CYCLE (key bubble, 2–3 info rows, chips, details and small bar charts in disclosures; friendly empty states).

## V7 — plan sportif (`src/data/plan.ts`)
The plan is regenerated from the profile **and the logged cycle** (period starts, flow days, positive LH tests), deterministic and memoized on those inputs plus today's date. Logging a new period recomputes it. Checked by `node scripts/check-plan.mjs` (fictional profiles only).

**Settings** (optional `Profile` fields, defaults in `PLAN_DEFAULTS`): `noSwimBefore` (3) / `noSwimAfter` (2) — Plus → Ton cycle ("Pas de piscine : X j avant, pendant, Y j après"); `runBaseMin` (30, "Tu cours facilement … min") and `sessionsPerWeek` (3, on top of basketball) — Profil. Basketball days come only from `profile.basketDays` (none when empty).

**1. Cycle first.** Phases come from the cycle forecast (`cycleModel`/`positionOn`: logged cycles, then cycles projected with the average length; also projected backwards before the first logged period). A period is at least `periodLength` days, longer when more flow days were logged (projected periods use the logged average).
| Phase | What the plan puts there |
|---|---|
| Règles | gentle only: very easy bike (≤ 40 min), walk (replaces the run), mobility (replaces strength or the swim). No intensity, no key session. |
| Folliculaire / fenêtre fertile | the week's **key session** (the run: longest run of the week, strides, then light tempo). Strength preferred here. |
| Lutéale | easy/moderate endurance, strength OK, no hard intensity. TTC: "période d'attente", moderate, drink, avoid overheating. |
| Prémenstruel (last 5 days) | easy and shorter (×0.8), mini welcome, strength 20 min. |
| Retard | easy/moderate only, no swim (the period can come any day). |
| Grossesse | no cycle windows, everything ≤ modéré, no running intensity, no key session, every "why" says "à valider avec ta sage-femme". |
Every session carries a `why` line tied to its day ("Phase folliculaire : énergie haute, c'est ta séance clé de la semaine.") and, when the plan changed something, a `note`.

**2. No swimming near periods.** No swim from `noSwimBefore` days before each period start (logged or projected), during it, until `noSwimAfter` days after it ends, on any logged bleeding day (+ `noSwimAfter`) and while late. A swim is moved to another allowed day of the week ("Piscine décalée…") or replaced by an easy outdoor ride (weekend) or stretching (weekday): "Pas de piscine autour des règles : on la remplace par…". On holiday, sea swimming follows the same window. Race day is fixed: it only gets a gentle note if it falls in the window.

**3. Strength ≤ 30 min** (20–30), functional for triathlon (squats, lunges, glute bridge, planks, back/shoulders with a band for swimming, calves/ankles for running), two alternating circuits with reps. With 3 sessions a week it is an optional add-on attached to the run (or swim) day; from 4 sessions it is one of them. One optional stretching moment per week (after basketball, on a period day or the day after basketball).

**4. Running**: continuous from the first week (no run-walk), starting at `runBaseMin` in Z2. The level grows ≤ 8 %/week, only after a normal week that really had a run; every 4th week is lighter (×0.8). Strides then light tempo only in the follicular/fertile phase, on a day that is neither a basket day nor the day after; the long run goes on the weekend when a free weekend day allows it.

**5. Volume & basketball**: exactly `sessionsPerWeek` non-optional sessions per full pré-prépa week (fewer in partial weeks), at most one per day except strength attached to a run/swim. No hard session (soutenu or key) on a basket day or the day after; the day after basketball gets easy sessions or rest/mobility. Placement is a small cost search per week (constraints above are hard rules; preferences: bike Saturday, swim Monday/Wednesday, key run Tuesday/Wednesday or Sunday, spacing).

**6. Bike**: outdoor road rides only (no home trainer), Saturday first, 45 min growing ~10 %/week to ~1 h 30 in December (then up to 3 h in the half prep). Mini for bad weather: 30 min brisk walk or 15 min stretching.

**7.** Every session has a "version mini" (~15 min); the mini counts as done.

**8. Blocks**: Reprise (first 3 weeks = lavage) → Fondations → Consolidation → Maldives (everything optional: sea swim outside the window, walks, mobility; basketball paused on holiday) → half prep Base → Construction → Spécifique → Affûtage → Course, with the same rules; `sessionsPerWeek` grows to 4 then 5 in the prep (never below the setting; doubles allowed there, never two hard sessions or the same sport on a day).

**9.** Ids are `${date}-${sport}`, unique per day. Screens: Sport shows per day the phase tag (estimate), a "piscine off" marker, basket/rest, a one-line week summary ("Cette semaine : 3 séances + basket · séance clé mardi (fenêtre fertile)"), and the `why` line in the session sheet (also on Today).

## V8 — Synchro Garmin
Garmin's official API is for businesses only, so a **GitHub Actions cron** (`.github/workflows/garmin.yml`, every 3 h from about 6 h to 23 h Paris, plus a manual run with `days`) runs `scripts/garmin/sync.py` with the maintained unofficial library **`garminconnect`** (0.3.x, native login, pinned in `scripts/garmin/requirements.txt`). Setup guide in French: `docs/GARMIN.md`.
- **Key**: Plus → Garmin Connect → « Générer ma clé Garmin »: a random 32-byte AES-GCM key (`src/lib/garmin-key.ts`, localStorage `cap-maldives:garminKey`). She copies it into the repo secret `GARMIN_SYNC_KEY`. The key also travels **inside the encrypted backup** (`secrets.garminKey` in the encrypted plaintext, `src/lib/sync.ts`) so a restore keeps the sync working; it is never in the plain JSON export.
- **Secrets**: `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `GARMIN_SYNC_KEY`, `GIST_TOKEN` (the same fine-grained token as the backup, Gists read/write). Missing secret → exit 0 with a notice.
- **Gist**: the script picks the most recent gist holding `cap-maldives-backup.json` (else one holding the Garmin file, else creates a secret gist « Pep’s — Garmin »). It only PATCHes its own files: `peps-garmin.enc.json` = `{app:'peps-garmin', v:1, updatedAt, iv, data}` with `data` = base64(AES-GCM(key, 12-byte IV, JSON), tag appended as WebCrypto expects) of `{days:{date:{sleepH, bodyBattery, stress, restingHr, steps}}, activities:[{id, date, time, type, minutes, distanceKm, avgHr, calories}], run:{at, from, to, days, activities}}`, merged with the previous file (last 60 days). `peps-garmin-auth.enc.json` holds the Garmin tokens, encrypted with the same key, so the script does not log in at every run (Garmin rate-limits logins from cloud IPs); expired tokens → login with email/password and the new tokens are stored.
- **Values**: sleep = Garmin sleep time of the night ending that day (h, 1 decimal); Body Battery at wake = the daily summary's `bodyBatteryAtWakeTime`, else the first reading after the end of sleep, else the highest reading before noon; stress = daily average (ignored when Garmin has too little data); resting HR; total steps; activities in the range (local start date/time).
- **Errors**: 429 / Cloudflare-style blocks / GitHub outages → warning and exit 0 (retried next run); wrong Garmin password, 2FA, invalid key, refused GitHub token → exit 1 (red run). **Public repo: logs only print counts** (« 3 jours, 4 activités ») and error kinds, never values, dates, names or Garmin error texts (library loggers are silenced).
- **App** (`src/lib/garmin.ts`): at start, when the backup becomes ready, back to the foreground and every 30 min while open (and « Synchroniser maintenant »), it downloads the file with the backup token, decrypts it on the phone and merges it in one `store.batch()`:
  - wellbeing fields filled with `wellbeing.source = 'garmin'` and `wellbeing.garmin` = values last imported; a field typed by hand (already there before the first import, changed in the Équilibre form, or cleared there) goes into `wellbeing.manual` and is never overwritten;
  - activities → `Workout` with `garminId`, `source: 'garmin'`, `time`, `avgHr`, `calories`, `distanceKm`; sport mapping running/treadmill/trail→run, cycling/road_biking/indoor_cycling…→bike, lap/open-water swimming→swim, basketball→basket, strength_training→strength, walking/hiking→walk, yoga/pilates/breathwork/stretching→mobility, else other. Imported once (ids remembered in `cap-maldives:garmin`, so a workout she deletes does not come back). A hand-logged workout of the same sport that day is **completed** (garminId, distance, HR) instead of duplicated. Linked (`plannedId`) to a planned session of the same sport that day that is not done yet;
  - pillars sommeil (≥ 7 h) and marche (≥ 8 000 pas) ticked when Garmin brings that value, never unticked. Nothing is ever deleted.
- **Plus → Garmin Connect**: status (« Dernière synchro : 09:12 · 3 jours · 2 activités », checked-on-phone time, what the last import added), « Synchroniser maintenant » (GitHub refreshes every ~3 h; link to run the workflow manually), the 4-step setup guide with copy buttons (backup active → key → 4 secrets with the secrets URL → first run), and an honest note (unofficial access, may break, use a Garmin password not used elsewhere, no 2FA). The manual Garmin form in Équilibre stays and shows Garmin's values.
- **Tests**: `node scripts/garmin/crypto-test.mjs` (Python ↔ WebCrypto round trip, fictional data).

## V10 — Revenir à moi
- 60-day guided journey (`src/data/journey.ts` content, `src/lib/journey.ts` logic, `src/screens/journey*.ts`, `src/screens/sunday-reset.ts`): 4 chapters of 15 days (Me poser · Mon énergie · Mes besoins · Moi, au-delà de maman).
- Daily, 5 min max: one morning check-in (energy + needs, merged with the coach mood), soft engagements (5 default rules, some auto-done from workouts/steps, water and pillars, synced both ways; a day is réussie at ≥ 80 %, 2 jokers per week, nothing ever resets), one journal prompt in the evening (chips + optional text, "Passer" allowed), phase-specific prompt variants.
- Chapter intro on day 1 and recap on day 15. Sunday reset in 5 steps (review, felt, prepare next week with cycle and sessions, mental load, a planned pleasure), saved on the Sunday's DayLog.
- Data lives in `Profile.journey`, `DayLog.journey`, `DayLog.journeyReset`: included in export and the encrypted backup. The coach only uses counts and need names, never quotes entries.
- Checks: `node scripts/check-journey.mjs`.
