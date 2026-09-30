# Cap Maldives — spec V1

Personal mobile web app (iPhone, opened from the home screen, no App Store) for one person.
All UI copy is in **French**, informal "tu", short and warm, never guilt-tripping.

## The user (no personal data in this public repo)
- Does sport **for pleasure**, dislikes forcing themself, restarting after a long break; plays **basketball**.
- Losing weight is the first priority; a half-ironman comes after. Cycle tracking matters (optional trying-to-conceive mode).
- Often eats **HelloFresh** meals (recipe cards show kcal + macros per portion). Has a smart scale and a Garmin watch (no sync in V1).
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
