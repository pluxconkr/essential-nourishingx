# NourishingX v1 — Production Plan (TypeScript + Expo)

**Status:** approved for execution by the owner on 2026-10-05 ("코드 좀 짜라"); implementation started the same day (student app, local-only mode — see Changelog). Revision 2 (rebuilt from the NourishingX document only). A second Critic pass returned REVISE; the fixes that affect the student app were applied in code (evidence by clause, hysteresis fold with carry and check-in-qualifying days, integer-only Balance copy, DAILY reminder without skip-after-save, word-boundary forbidden-words test with an allow-list). Items that concern the staff dashboard, Firebase sync and the weekly batch (B2, B5 hours, B8–B10, citation fixes) remain open in this document.
**Date:** 2026-10-05
**Single source:** `../docs/5_NewHampshire.HTM` — "NourishingX — Student Nutrition & Energy Check-in (New Hampshire) · CAC 2027 Prototype v0.9". Design tokens lines 14–55; student app markup ~380–520; staff dashboard markup 641–1240; handoff spec §1–§20 at 1287–1707; prototype rule engine and student screens (JavaScript) 1723–2152; dashboard mock data and rule tester 2153–2578. Every claim below cites that file by line; nothing is taken from other projects.
**Staffing assumption:** the spec's four roles (§18.5, line 1680) collapsed onto one developer full-time plus a part-time wording reviewer; the week-by-week rhythm at line 1689 is kept as the milestone skeleton.

---

## 0. Summary

1. **Expo + TypeScript, as the spec's own architecture asks** (§5 line 1365: "Client: React Native (Expo) — 3 screens"). The PWA fallback the spec floats (open question, line 1612) is rejected because push "is the habit driver" and Expo delivers notifications without a web-push dependency.
2. **One shared rules module is the load-bearing engineering decision** (§5: "Rules ~40 lines, shared module, runs client-side AND server-side — identical code path, so the app works offline and the dashboard agrees"). `src/domain/rules.ts` is imported by the phone, by the weekly batch and by the dashboard's rule tester; a test fails the build if a second state-producing function exists.
3. **Backend as the spec draws it: a BaaS with two collections and no custom service** (§5 "Why BaaS rather than a real backend"). Firebase is the default because §6 (line 1386) is written in Firestore terms; Supabase is the recorded alternative. The app also runs in a **local-only mode** when no backend is configured, because Phase 1 "runs entirely on synthetic data" (§15 line 1573) and §13 requires the check-in to write locally and the rules to run on the device.
4. **The reminder is a local daily notification, not a server push** (deviation D2). The spec's data model forbids collecting a device ID (line 1421–1424: "no device ID … There is no field to add them to"); a push token is a device identifier that would have to be stored server-side. A local notification satisfies every requirement at line 1172 (one per day, student-chosen time, no re-nudge, silent on failure) with nothing stored. Server functions drop from 1 to 0.
5. **AI in exactly one place, inside the weekly batch, cached** (§8 line 1467; prompt discipline line 1479: "The output is cached weekly, so the same week always reads the same way"). The batch aggregates with n ≥ 10 suppression inside the function (§9), makes one Claude call on the suppressed table, validates the paragraph in code (no causal verbs, no number absent from the table, a confidence word), and writes `aggregates/{week}.proseSummary`. The dashboard only reads. No public LLM endpoint exists.
6. **Design: the prototype's warm card system made production-grade** — paper `#faf6f0`, crimson `#9b1b30`, green `#3f7d52` (tokens lines 14–55), "does not look like a hospital app" (§13 line 1558), state words never colour-only, "This app does not diagnose any condition" pinned on every student screen next to the Health Center (§11 hard rules line 1519). §7 of this plan is the design spec and the audit list.
7. **Scope guard becomes tests**: the exclusion list (§3 line 1322), the six build counters (line 1217), the string rejection tests (§14 line 1562) and "no numbers on the Balance screen" (E4 line 1696) are each a failing test, not a reminder.

---

## 1. Requirements (what v1 must do)

Sources: §3 scope table (1311), §4 core flow (1337), §15 Phase 1 (1573), §19 backlog E1–E12 (1690), prototype screen notes `RES_NOTES` (1901).

### 1.1 Student app — three screens (§3 "In scope", line 1312)

| Screen | Behaviour (spec) | Prototype reference |
|---|---|---|
| **Home** | Today's dining-hall menu from the hand-maintained table with meal hours; 7-day averages; **one** recommended action chosen by state; today's check-in entry point as the primary action; week strip that "previews the state without explaining it". Must not look clinical — dining content leads, health framing stays quiet. | `RES_NOTES.home` 1901–1907, `renderHome` 1960–1991, markup 398–433 |
| **Quick Check-In** | Five taps, ~20 s: fullness 1–5, energy 1–5, focus 1–5, training none/light/moderate/heavy, skipped none/breakfast/lunch/dinner. Live timer visible. No free text, no optional extras. Saved as one anonymous record `{hash, 5 values, date}`; a second check-in the same day overwrites the first. | `RES_NOTES.checkin` 1908–1913, `startCheckin`/`renderCheckin`/`saveCheckin` 1993–2041, markup 433–482, data rule line 1110 |
| **Energy Balance** | One of three words (Stable / Watch / Needs attention) plus the honest fourth (Not enough data); four evidence lines; up to three actions from reviewed templates; "This is not a diagnosis" pinned with Health Center contact; escalation is a prompt to the student, never a report about them. No percentages, probabilities or condition names. | `RES_NOTES.balance` 1914–1921, `renderBalance` 2042–2093, Needs-attention wording 1027–1040 |

Supporting surfaces required by §11–§12 (not decision screens; the "Student screens 3" counter counts the tabs):

| Surface | Spec basis |
|---|---|
| **Consent** before first use — six plain sentences at a 7th-grade reading level, reminder-time choice, "I understand" / "Not now" | consent box 1121–1133; `openSheet('consent')` 2116–2131 |
| **Health Center** sheet — phone (tel:), hours, walk-in hours, adviser and coach lines, "Nothing you entered has been shared with any of them", export | `openSheet('health')` 2132–2149 |
| **Your data** — see every record, export CSV, delete everything in one action, reminder time, notifications toggle, check-in timing stats, demo scenarios | §12 "Student control: see, export, and delete everything, in the app, at any time" (1536); E2 "timing instrumentation" (1693) |
| **How this works** — the rules in plain words, the four evidence categories, "rules, not a model", what happens at each state from the student's side | state table 994–1004; "Where this comes from" block in `renderBalance` 2080–2086 |
| **Safety bar** on every student screen — disclaimer + Health Center button, never dismissable | hard rule 1520 ("pinned to every screen, always adjacent to Health Center contact information. Not a one-time splash"); markup ~489 |

### 1.2 Staff dashboard (§3 "Staff dashboard" rows; §15 Phase 1 names overview / menu / wellness / rules / data views)

| View (spec line) | Phase | Content |
|---|---|---|
| Weekly overview (641) | P1 | Participation, median check-in time, daily return rate, mean energy, breakfast skip rate; "This week, in prose" (the cached AI paragraph with model and generated-at labels); participation by group; energy by day of week; "What students actually reported"; "Reading this dashboard honestly" (714) |
| Menu performance (733) | P1 | Satisfaction-vs-waste scatter with the three quadrant readings; item table (ratings under 10 shown as "—", 771); "Actions Dining Services can take this week" and "Log a pilot" (773–808) |
| Aggregate states (957) | P1 | State counts, four-week trend as counts not rates, drivers by clause (969), "What a school can actually do with this" (976), "What happens at each state" (994), "The hardest design question" (1011), Needs-attention wording (1027) |
| Rule engine (1046) | P1 | The rule set with the firing clause highlighted, seven-input tester, threshold provenance table (1066) — the demo centrepiece (video 1:30–2:05, line 1640) |
| Data & consent (1092) | P1 | Stored document shape, retention, re-identification controls, consent text, approvals table (1136) |
| Menu table & reminder (1160, 1172) | P1 | Manual menu table (E6: "Four minutes a day is the target"), reminder policy card |
| Scope guard (1206) | P1 | Exclusion list with reasons (`SCOPE_ROWS` 2254), build counters (1217), weekly review questions (1233) |
| Pattern candidates (812) | **Stretch (M4)** | Pre-registered comparisons only, n ≥ 10, confidence as a word, suggested pilot; statistical guardrails table (844). The spec places this in Phase 3 (1577); it is cheap once aggregation exists and appears in the video script, so it is the cut line (D8) |
| What-if simulator (865) | **Stretch (M4)** | Transparent arithmetic on stated assumptions, ranges, the pilot card (908); "never shown to students" (865) |

### 1.3 Core flow (§4 line 1337) → code

1. **Reminder** — one local notification per day at the student's time: "Time for your 20-second check-in." (1174–1178). No second nudge; failure is silent.
2. **Check-in** — five answers → one local record keyed by date (overwrite) → sync to the backend when configured and consented.
3. **State** — rules over the trailing 7 days → `STABLE | WATCH | NEEDS_ATTENTION | NOT_ENOUGH_DATA` → 3-day hysteresis so the word does not flip daily (1352).
4. **Evidence and action** — "the clause that fired names its own inputs → exactly four evidence lines → up to three actions, chosen from pre-reviewed template sentences → 'This is not a diagnosis' + Health Center info pinned below" (1355–1358).
5. **Weekly dashboard** — aggregates by grade / training / week dropping every group with n < 10 → one LLM call → prose with a confidence word → Dining Services picks a pilot; Wellness sees counts only (1360–1362).

### 1.4 Hard rules (§11 line 1519) enforced by tests

- Three state words plus "Not enough data"; **no numbers, gauges, percentages, or colour-only encoding** on the Balance screen (1521; E4 1696 "No numbers anywhere on this screen"). Integer day counts inside evidence sentences and the phone number are the only numerals allowed (the spec's own Needs-attention wording at 1030 uses "5 days" and "3 days").
- Four evidence lines with every state word; a word without reasons is a verdict (1522).
- Actions are behaviours available in this dining hall today, capped at three (1523); no numeric targets ever (1456).
- Escalation is always "talk to a person" with a real phone number, never an automated report (1524); there is no code path from a state word to any adult (1008).
- Every student-facing string reviewed by the Health Center before the pilot; "if a clinician is uncomfortable with a sentence, the sentence loses" (1525).

### 1.5 Non-functional (§13 line 1551, §16 line 1581)

Check-in median < 25 s with an alarm at 30 s, timed weekly on a real phone (1552, 1584); offline-tolerant — local write, local rules (1553); one notification per day maximum (1554); WCAG 2.2 AA, state words never colour-only, 1–5 scales reachable by screen reader and keyboard (1555); card-based, crimson and green, warm (1556); reproducible — same seed, same dataset, same dashboard (1557); rules parity — a mismatch is a build failure (1558).

---

## 2. Architecture (spec §5 realised in TypeScript + Expo)

```
PHONE — Expo SDK 57 (React Native, TypeScript strict, expo-router)
  (tabs)/home · checkin · balance          + consent · health · data · how · privacy
       │ synchronous local store (expo-sqlite)      checkins · prefs · timing · reminder
       ▼
  src/domain/rules.ts   ← THE shared module (derive · evaluateRules · hysteresis · evidence · actions)
  expo-notifications    → one DAILY local notification at the chosen time
  sync (optional)       → Firebase Auth (anonymous) + Firestore `checkins/{uid}_{date}`
                           absent config = local-only mode, labelled on the Data screen

BACKEND — BaaS, no custom service (§5 "Why BaaS rather than a real backend")
  Firestore: checkins (1 doc/day/student), menus/{date} (manual table), aggregates/{week}
  Security rules: a client may write only its own uid docs; fields and ranges validated; no other fields accepted
  Scheduled functions: 0 (see D2)

WEEKLY BATCH — scripts/weekly-batch.ts, run by the team once a week (§5 "weekly batch, aggregates only")
  read checkins → HMAC(uid, TERM_SALT) → aggregate with n ≥ 10 suppression INSIDE the function (§9)
  → the ONE LLM call (Anthropic SDK) on the suppressed table → validate → aggregates/{week} incl. proseSummary
  Phase 1 input = the synthetic set (60 × 30, seed 2027) seeded by scripts/seed-synthetic.ts

DASHBOARD — the same Expo project, web target, route group /staff/* (§5 "Separate web app, staff auth, no student-level views")
  staff sign-in (email link, allow-list) → reads aggregates/{week} and menus only → rule tester imports src/domain/rules.ts
```

**Build counters** (`src/domain/counters.ts`, asserted by a test and shown on `/staff/scope`; spec table 1217–1231):

| Counter | Spec | Plan | Why |
|---|---|---|---|
| External APIs | 0 | 0 | menu is a hand-maintained table (1162) |
| Auth keys | 1 | 1 | one anonymous-auth project key |
| Server functions | 1 | **0** | reminder is local (D2); the batch is a script the team runs, not a deployed function |
| AI call sites | 1 | 1 | inside `weekly-batch.ts`; a grep test allows exactly one import of the Anthropic SDK |
| Rule lines | ~40 | ~40 | the clause block of `rules.ts` ≤ 60 lines including comments (test) |
| Student screens | 3 | 3 | the three tabs |

---

## 3. Key decisions (each tied to the spec)

### 3.1 Client: Expo (React Native) rather than PWA — spec open question (line 1612)
Push is the habit driver (1612); a local notification needs no web-push stack; the three screens are small. `expo-router` for file routes, `expo-sqlite` for the local write (§13 1553), `expo-notifications` for the daily reminder, `react-native-svg` for the week strip and dashboard charts, `expo-file-system` + `expo-sharing` for the CSV export, `@react-native-community/datetimepicker` for the reminder time, `zod` for every boundary (local store, Firestore payloads, batch output). Everything in the student app runs in Expo Go (local notifications are supported there in SDK 57; only remote push needs a development build — irrelevant under D2).

### 3.2 Backend: Firebase by default, Supabase as the alternative (§5 "Firebase / Supabase (BaaS)")
§6 is written as Firestore documents (`checkins/{autoId}`, `menus/{date}`, `aggregates/{week}`, 1386–1424). Firestore doc id `${uid}_${date}` makes "unique on (studentHash, date) — a second check-in overwrites the first" (1395) a property of the key. Security rules validate the five fields and ranges and reject any extra field — the code form of "There is no field to add them to" (1424). Supabase (Postgres unique constraint + CHECK + RLS) is equivalent; pick it if the school's IT prefers SQL (D1).

### 3.3 Reminder: local daily notification (D2) — reasons from the spec itself
Line 1172 wants exactly one reminder per student per day at a chosen time, no re-nudge, silent failure. A server push needs a per-device token stored server-side; §6 forbids a device ID (1421–1424). A local notification stores nothing anywhere. Trigger: `SchedulableTriggerInputTypes.DAILY {hour, minute}` (SDK 57 docs); exactly one scheduled identifier kept locally; rescheduled on time change; cancelled on consent withdrawal; cancelled for today after a save so a student who already checked in is not nudged. A response listener routes a tap to the Check-in tab. Alternative (spec-literal): Cloud Scheduler → Cloud Function → FCM; requires a dev build on Android and a `devices` collection.

### 3.4 Weekly batch in TypeScript (D3) — the spec says Python + Pandas (§5 1370, §18.5 1686)
The batch must compute state counts with the same rules the phone runs (§5 "identical code path"); a TypeScript batch imports `src/domain/rules.ts` directly, and the n ≥ 10 suppression "enforced in the aggregation function, not in the UI" (§9 1482, guardrails 847) becomes a unit-tested function next to the rules. The batch writes `assets/data/aggregates-2027.json` as a fixture; a Pandas notebook may replace it in Phase 2 if it reproduces the fixture on the same seed (values equal within 1e-9 after canonical sorting).

### 3.5 One LLM call site, in the batch, cached (§8 1467–1479)
No deployed endpoint: the paragraph is generated when the batch runs and stored in `aggregates/{week}.proseSummary` (the spec's own field, 1414). "Regenerate" on the dashboard is an operator action that re-runs the batch step. Model `claude-opus-5-5` via `PROSE_MODEL`; `output_config.effort: "low"`; structured output (zod schema `{paragraphs: string[], confidence: 'High'|'Medium'|'Low', why: string}`); `stop_reason === 'refusal'` → the template; no `temperature` (not accepted on this model). Validators in `src/domain/prose.ts`: ≤ 180 words; every number in the output appears in the display-formatted table; forbidden causal verbs (`cause`, `leads to`, `results in`, `due to`, `proves`, `improves health`, `diagnos*`, `RED-S`, `risk`); "participants", never "students". Any failure → `templateProse(table)` with the footnote "Written from a template · the AI summary was not available". Cost: one call per week.

### 3.6 Dashboard as the Expo web target (D4) — spec says "Separate web app"
Same project, route group `src/app/staff/*` built as the web target and deployed separately; the rule tester imports the same `rules.ts` (the parity argument, 1384). Staff auth: Firebase email-link sign-in against an allow-list in `staff/allowlist` (§5 "staff auth"); on native the staff routes are stubs that redirect home, so no staff code ships in the phone binary.

### 3.7 Hysteresis computed at read time — nothing persisted (§6 1406: "Nothing about a student's state is persisted")
The displayed word for day *d* is a pure function of the check-ins up to *d* (§5.3 of this plan). The firmer 3-day prompt (1004) is rendered inline whenever the streak is ≥ 3 — no "shown today" flag is stored, so no date-stamped record of a state exists.

### 3.8 Evidence chosen by the firing clause (§7 1452–1455; §4 1355)
"The clause that fired names its own inputs → exactly four evidence lines." The four lines are drawn from the spec's five categories (meals skipped · heavy training days · direction of fullness · low-energy or low-focus day count · check-in coverage), the firing clause's inputs first. The prototype's fixed four (1792–1804) would show a Watch from C4 (low focus) without mentioning focus; the spec text wins (D6).

### 3.9 `fullDelta` as the prototype computes it (D7)
Spec prose: "mean(fullness, last 3) − mean(fullness, prior 4)" (1434). Prototype `derive` (1751–1767): last 3 *present* check-ins versus up to 4 earlier *present* ones, 0 when either side is empty. The prototype is the executable reference the tester demonstrates; adopt it and document it in `docs/thresholds.md`.

### 3.10 No name, no schedule on the phone (D9)
The mock greets "Good afternoon, Dowan." and mentions "tennis at 4:30" (400–403). The data model has no field for a name or a schedule (1421–1424), so the greeting is time-of-day only and action copy says "after practice" generically. Note for Phase 2: §6 aggregates `byGrade` (1413) but the stored document has no grade; collecting an opt-in grade band at consent would be a data-model change the spec has not yet made (D11).

---

## 4. Repository layout

```
nourishingx/
├── app.json  eas.json  tsconfig.json (strict, @/* → src/*)  package.json  .env.example  .gitignore (.env, .omc/)
├── AGENTS.md  README.md (outline: Appendix C)
├── assets/
│   ├── data/ school.json           # Health Center phone/hours/walk-in, dining hours, action templates by clause, adviser/coach lines (§20 "local parts", 1711)
│   │         menu.json             # the hand-maintained table: {date → {meal → [{item, station, tags}]}, enteredBy, enteredAt} (§6 1398)
│   │         synthetic-2027.json   # generator output, committed (§10)
│   │         aggregates-2027.json  # batch output, committed (the dashboard's Phase-1 source)
│   │         patterns.json         # the pre-registered comparison list (§9 1484)
│   │         what-if.json          # assumptions/ranges/pilot cards (`SIMS` 2181)
│   └── images/ icon · splash · adaptive icon (crimson on paper)
├── docs/ QA.md  design.md  strings.md  thresholds.md  approvals.md  weekly-review.md  gap-analysis.md
├── scripts/ gen-synthetic.ts  weekly-batch.ts  seed-synthetic.ts  readability.ts
├── firebase/ firestore.rules  firestore.indexes.json
├── __tests__/ rules.test.ts  hysteresis.test.ts  evidence-actions.test.ts  synthetic.test.ts  aggregate.test.ts
│              prose.test.ts  strings.test.ts  readability.test.ts  counters.test.ts  boundary.test.ts
│              screens.test.tsx  staff-screens.test.tsx  store.test.ts  notifications.test.ts  firestore-rules.test.ts
└── src/
    ├── app/
    │   ├── _layout.tsx              # root Stack; consent gate (§5.2 of this plan)
    │   ├── (tabs)/ _layout.tsx  index.tsx (Home)  checkin.tsx  balance.tsx
    │   ├── consent.tsx  not-now.tsx  health.tsx (modal)  how.tsx (modal)  data.tsx  privacy.tsx  +not-found.tsx
    │   └── staff/ _layout.web.tsx  index.web.tsx  menu.web.tsx  wellness.web.tsx  rules.web.tsx  data.web.tsx
    │              ops.web.tsx  scope.web.tsx  patterns.web.tsx  what-if.web.tsx  sign-in.web.tsx
    │              _layout.tsx + one native stub per route (Redirect to '/')
    ├── domain/   types.ts  rules.ts  hysteresis.ts  evidence.ts  actions.ts  synthetic.ts  aggregate.ts
    │             confidence.ts  prose.ts  counters.ts  time.ts  demo.ts        # no React/Expo imports
    ├── data/     db.ts (expo-sqlite)  repos.ts (checkins, prefs, timing, reminder, menu)  registry.ts (every key)
    ├── services/ notifications.ts  sync.ts (Firestore; no-op when unconfigured)  export.ts  menuFeed.ts  demo.ts  staffAuth.ts
    ├── store/    appStore.ts  derived.ts
    ├── i18n/     en.ts  inventory.ts (id → audience, owner, reviewedOn, textHash)
    └── ui/       theme.ts  primitives.tsx  Screen.tsx (SafetyBar built in)  icons.tsx
                  checkin-widgets.tsx  balance-widgets.tsx  staff/*.tsx
```

Platform-specific route files (`*.web.tsx` + a native fallback) keep the dashboard out of the phone bundle; a CI step exports the iOS bundle and greps it for `staff/` symbols and the Anthropic SDK (both must be absent).

---

## 5. Data model

### 5.1 Firestore (§6 1386–1424, verbatim shape)

```ts
// checkins/{uid}_{date}   — one document per student per day
{ uid: string /* anonymous auth uid; the only identifier, opaque */, fullness: 1|2|3|4|5, energy: 1|2|3|4|5, focus: 1|2|3|4|5,
  training: 'none'|'light'|'moderate'|'heavy', skipped: 'none'|'breakfast'|'lunch'|'dinner', date: 'YYYY-MM-DD' }
// menus/{date}             — { breakfast: [{item, station, tags[]}], lunch: [...], dinner: [...], enteredBy: 'dining-services', enteredAt }
// aggregates/{week}        — byGrade[] (n ≥ 10 only), byTraining[], stateCounts{stable, watch, attention, nodata}, attentionStreak3Count,
//                            clauseCounts, menuStats[], patternCands[], proseSummary, proseMeta{model, generatedAt, source: 'model'|'template'}
// staff/allowlist          — { emails: string[] }   (dashboard sign-in)
```

`studentHash = HMAC(uid, TERM_SALT)` is computed **only in the batch** (the salt never reaches a phone or the dashboard); the raw `uid` is never exported, and the batch output contains only aggregates. Rotation (1396 "salt rotates each term") = a new salt per term; the anonymous account is re-created at term start. Retention (1114 "Raw check-ins for one term, then aggregated and the raw rows deleted") is a batch step `--purge-term`. Not collected anywhere: name, student ID, email, device ID, location, weight, calories, photos, free text, sleep (1421–1423) — the security rules reject unknown fields, so there is no field to add them to.

### 5.2 On the phone (`src/data/registry.ts` is the complete key list; a test asserts every `db.set` key literal is registered)

| Key | Value | Spec |
|---|---|---|
| `checkins` | `Checkin[]` unique on `date`, newest last | §13 local write (1553); overwrite rule (1110) |
| `prefs` | `{consentedAt, reminderHour, reminderMinute, notificationsEnabled, demoScenario}` | consent (1121); reminder time (1173) |
| `timing` | last 60 check-in durations in seconds | E2 "Instrument the duration from day one" (1693) |
| `reminder` | `{id, hour, minute}` of the one scheduled notification | line 1172 |
| `menuCache` | last fetched `menus/{date}` + fetchedAt | §6 menus |
| `demoBackup` | real `checkins` while a demo scenario is loaded | this plan §12 |
| `syncQueue` | dates not yet written to Firestore | §13 "syncs later" |
| `schemaVersion` | `1` | — |

"Delete everything" enumerates every key in the registry, removes them all, cancels the scheduled notification, deletes the student's Firestore documents when configured, and returns to consent; a test asserts the store is empty afterwards.

### 5.3 Synthetic dataset (§10 1491–1507)
`generate(seed = 2027)` → 60 students × 30 days, deterministic PRNG. Profiles: athlete 35 %, breakfast-skipper 30 %, new boarder 25 %, compliant reporter 60 % (5–7 check-ins/week); the remaining 40 % report 4–5 days/week so that windows stay describable, and **two designated sparse students** report 2–3 days/week so NOT_ENOUGH_DATA is visible (1505). Built-in structure: exam week days 15–19 (energy −0.4, focus −0.5, skipping +12 %), season start day 8, three students drifting to WATCH and one to NEEDS_ATTENTION (1502–1504). Also generated: `menuRatings` and weekly `wasteEstimates` per item (the dashboard's menu view needs them; the spec leaves their Phase-2 source open — D14). Test: regeneration deep-equals the committed fixture; week 4 shows ≥ 1 student in each state; flags are uncommon outside exam week (watch + attention ≤ 20 % of participants — "about 1 in 5", 1068).

---

## 6. Rule engine (§7 1427–1465; prototype 1741–1816)

### 6.1 Thresholds and clause order — verbatim from `TH` (1741–1750) and `evaluateRules` (1769–1779)

```ts
export const TH = { minCheckins: 4, b1_skipped: 5, b1_heavy: 3, b2_lowEnergy: 5, b2_fullDelta: -1.0,
  b3_skipped: 3, b3_heavy: 4, b3_fullDelta: -0.5, b3_energyMean: 2.2, c1_skipped: 3, c1_heavy: 4,
  c2_lowEnergy: 3, c2_skipped: 2, c3_fullDelta: -1.0, c3_heavy: 2, c4_lowFocus: 4, c4_skipped: 2 } as const;
// A: n < 4 → nodata · B1: skipped ≥ 5 ∧ heavy ≥ 3 · B2: lowEnergy ≥ 5 ∧ fullDelta ≤ −1.0
// B3: skipped ≥ 3 ∧ heavy ≥ 4 ∧ fullDelta ≤ −0.5 ∧ energyMean ≤ 2.2 · C1: skipped ≥ 3 ∧ heavy ≥ 4 ∧ fullDelta < 0
// C2: lowEnergy ≥ 3 ∧ skipped ≥ 2 · C3: fullDelta ≤ −1.0 ∧ heavy ≥ 2 · C4: lowFocus ≥ 4 ∧ skipped ≥ 2 · D: stable
```
First matching clause wins — "order is part of the spec" (1440). `derive` per the prototype (1751–1767), means rounded to 2 dp. `docs/thresholds.md` carries the provenance table (1066–1090: basis and status per threshold, "reasoned, not validated" 1465); a test fails if a `TH` value changes without the doc.

### 6.2 Evidence — four lines chosen by clause (D6)

Categories and the sentence templates (integers only, direction in words — E4 1696, Needs-attention wording 1030):

| Category | Template |
|---|---|
| meals skipped | "Skipped a meal on {n} of the last 7 days" / "No skipped meals this week" |
| heavy training days | "Heavy training on {n} day(s)" / "No heavy training days" |
| direction of fullness | "Fullness ratings went down across the week" / "stayed steady" / "went up" |
| low-energy or low-focus days | "Energy was low on {n} day(s)" **or** "Focus was low on {n} day(s)" — whichever the clause tested; energy when neither |
| check-in coverage | "{n} of 7 days checked in" |

`buildEvidence(d, clause)`: the inputs the clause tested come first (B1/C1: skipped, heavy, fullness; B2: energy, fullness; B3: skipped, heavy, fullness, energy; C2: energy, skipped; C3: fullness, heavy; C4: **focus**, skipped; D: skipped, heavy, fullness, energy), then the remaining categories in the table order until four. `nodata` renders the single callout "Check in a few more days and this will fill in." and no evidence (state table 996: "Nothing else"). Test: for every clause, every input it tests appears in its evidence categories; for every non-nodata `Derived`, exactly four lines; no template contains a decimal, `%`, `≥`, `≤` or `<`.

### 6.3 Actions — by clause from reviewed templates (§7 1456–1458, `ACTIONS` 1806–1815)
`actionsFor(clause, school)` returns ≤ 3 strings from `assets/data/school.json` keyed by clause (B* → attention set, C* → watch set, D → stable, A → nodata), so a new school changes the hall's behaviours without touching code (§20 1711). Test: length ≤ 3, every string present in the file, none contains a digit (no numeric targets, 1456).

### 6.4 Hysteresis — "may worsen immediately, may only improve after 3 consecutive days that qualify for the better state" (1448–1450)
Severity: stable 0 < watch 1 < attention 2; `nodata` outside the order. For each calendar day *d* in the last 30: `raw[d] = evaluateRules(derive(window(checkins, d)))`. Fold with `carry = {state, date}` (the last non-nodata displayed word) and `qualifying = 0`:
- `raw[d] = nodata` → display **Not enough data**; keep `carry`; `qualifying = 0`.
- else if no `carry`, or `carry.date` is more than 7 days before *d* (the window shares no data with it) → display `raw[d]`; `carry = raw[d]`.
- else if `severity(raw[d]) > severity(carry.state)` → display `raw[d]` (worsen immediately); `carry = raw[d]`; `qualifying = 0`.
- else if `severity(raw[d]) < severity(carry.state)` **and day *d* has a check-in** → `qualifying += 1`; when `qualifying = 3`, display the best state all three qualifying days reached (the max severity among them), set `carry`, reset `qualifying`; otherwise display `carry.state` with the footnote "Holding at {word} until three steadier days".
- else → display `carry.state`; `qualifying = 0` when `raw[d]` equals it.
A day without a check-in never counts as qualifying (a student cannot "improve" by not checking in while bad days age out). `attentionStreak` = consecutive displayed **attention** days ending today. Tests: the four `SCENARIOS` weeks (1818–1855) give watch / stable / attention / nodata; `attention, stable, stable, stable` displays `attention, attention, attention, stable`; `stable, attention` displays `stable, attention`; a sparse checker oscillating around n = 4 cannot flip from attention to stable without three qualifying check-in days; a single bad day never changes the word.

### 6.5 Parity (1384 "a state can never differ between the phone and the dashboard")
`balanceFor(checkins, today)` is the only exported entry point; the phone, the batch (`stateCounts`, `attentionStreak3Count`) and the dashboard tester call it or `evaluateRules`. Tests: a grep asserts a single definition; for ten synthetic students the batch's per-student intermediate equals the phone's `balanceFor` output.

---

## 7. Production design — the prototype made shippable

Audience: boarding students who must want to open it daily; register: a quiet, warm first-party utility, not a medical instrument (§13 1556; `RES_NOTES.home` 1903). Everything here becomes `docs/design.md` and is audited against screenshots before submission.

### 7.1 Rules every screen is checked against (derived from §11, §13 and the screen notes)

| Rule | Source |
|---|---|
| One job per screen: Home = today; Check-in = five answers; Balance = one word, four reasons, up to three actions | `RES_NOTES` 1901–1921 |
| One primary action per screen (filled crimson): Home "Start · 20 seconds", Check-in "Save", Balance none | mock `.btn` 1 primary per screen (markup 433–505) |
| Honesty is a footnote under the thing it qualifies: "Based on 6 check-ins in the last 7 days", "Menu from the dining hall's weekly table", "Demo · Watch week loaded" | `renderBalance` 2047; menu footnote 410; synthetic banner 633 |
| No numerals on Balance except integer day counts and the phone number; no `%`, score, gauge or trend arrow; Home averages are the student's own inputs, shown as "3.4 out of 5" | E4 1696; §11 1521 |
| State never by colour alone: dot + word; week-strip bars one neutral colour with hollow slots for missing days; evidence carries icons and words | 1555; deviation from the mock's per-day colouring (1976–1979), recorded as D5 |
| Not clinical: warm paper, rounded cards, crimson accent, soft-green suggestion, plain icons (fork, bolt, running figure), sentence case, no medical glyphs; red only for the Needs-attention word and card | 1556; `.menucard`/`.suggest` CSS 140–152 |
| The twenty seconds are visible: a real timer pill starts when Check-in opens (the product argument on camera, video 0:45–1:30 line 1636) | `.timer-pill` 1998–2007 |
| Demo adds exactly one footnote and the word "(demo)" in the saved toast; nothing else changes | — |
| Copy: sentence case; section headers are nouns ("Today's dining hall", "Why it says watch"); no exclamation marks; no streak or guilt language ("No check-in yesterday — that's fine, today counts." 1980) | §14 rejection tests 1566 |

### 7.2 Tokens (`src/ui/theme.ts` — the only file with colour and type literals)

Spec values (lines 14–55) with WCAG AA fixes computed for text on paper `#FAF6F0`:

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `paper` / `surface` / `surface2` / `line` | `#FAF6F0` / `#FFFFFF` / `#F1EBE2` / `#E8E1D6` | — | background, cards, fills, hairlines (lines 15–22) |
| `ink` | `#22201E` | ≈ 15:1 | titles, body |
| `ink2` | `#4F4A45` | ≈ 8:1 | secondary text |
| `ink3` | `#6B655E` | ≈ 5.3:1 | captions. The spec's `#8a837b` (line 21) is ≈ 3.5:1 and is used for decoration only |
| `crimson` (= tint) | `#9B1B30` | ≈ 7.5:1 | primary button, selected answers, tab tint, Needs-attention word (lines 25, 46) |
| `crimsonSoft` / `crimsonInk` | `#FBE9EC` / `#5E0D1C` | ink ≈ 11:1 on soft | Needs-attention card, timer pill (lines 27–28) |
| `green` | `#3F7D52` | ≈ 4.6:1 | Stable word (34 pt), done badge (lines 30, 44) |
| `greenSoft` / `greenInk` | `#E8F2EA` / `#22462D` | ink ≈ 9:1 on soft | suggestion card, action rows (lines 32–33) |
| `amber` | `#8A5A00` | ≈ 5.9:1 | Watch word as text. The spec's `#c48420` (line 45) is ≈ 3.2:1 and fails AA for text |
| `amberBar` / `amberSoft` | `#C48420` / `#FDF1DD` | bar only | Watch dot and bars beside their label |
| `grey` | `#98918A` | bar only | Not-enough-data dot (line 47); its text uses `ink2` |

Radii from line 49: `s 8`, `m 12`, `l 18`, `xl 26`. Shadows (lines 50–52) are dropped on the phone: flat surfaces with hairlines read as native. Fonts: system (SF Pro / Roboto, line 54); rounded system face for the three averages; tabular digits wherever numbers change. Type scale (platform text styles): `largeTitle 28/34 700`, `title 20/25 600`, `headline 17/22 600`, `body 17/22 400`, `subhead 15/20`, `footnote 13/18`, `caption 12/16`, `sectionLabel 13 uppercase`, plus `display 34/40 700` (state word), `score 28/32 600 rounded tabular` (averages), `scale 20/24 700` (1–5 buttons), `pill 13/16 700 tabular` (timer). Dynamic Type: body and footnotes scale with the system; `largeTitle`/`display`/`scale`/`pill` cap at 1.3–1.5×; the mock's 10–13 px labels (e.g. `.sect-label` 10.5 px, `.evrow span` 11 px) are not shipped — minimum text 13 pt. A grep test: zero `fontSize`/`fontWeight`/`lineHeight`/`letterSpacing` literals outside `theme.ts`.

### 7.3 Components

- **Screen** — paper background, large title, subtitle, optional demo footnote, scroll body, and the **SafetyBar** below the scroll view on every student route: footnote "This app does not diagnose any condition. It shows patterns in what you entered." + a 44 pt ghost **Health Center** button (→ `/health`). Not dismissable, not scrollable away (1520). At large text the footnote caps at 1.3× and the button keeps 44 pt.
- **MenuCard** — flat crimson surface, radius `l`; label "TODAY'S DINING HALL" in white at 78 %; meal and hours in `headline`; up to seven item lines in `subhead`; footnote derived from the data: "Entered by Dining Services this morning · 24 items" when `enteredAt` is today, otherwise "From the dining hall's weekly table". The gradient and decorative emoji of `.menucard` (140–143) are dropped. "No menu entered for today" is a defined state.
- **ScoreBox × 3** — `score` numeral in `ink` (never coloured by value — deviation from `renderHome` 1965), `sectionLabel`, caption in words: "out of 5", "steady", "lower than earlier in the week".
- **Suggestion** — soft-green card: label ("TODAY'S SUGGESTION" / "WHAT YOU COULD TRY"), `headline`, `subhead`, all in `greenInk`; exactly one on Home (`SUGGESTIONS` 1864–1869 with the schedule references removed).
- **WeekStrip** — seven columns; bar height = energy ÷ 5 of 44 pt in crimson at 70 %; missing day = hollow `surface2` slot with an `ink3` dashed outline (non-text contrast ≥ 3:1); day initials in `caption`; accessibility label per bar "Tuesday, energy 3 of 5" / "Wednesday, no check-in".
- **ScaleRow (1–5)** — five square targets ≥ 52 pt, `scale` numerals, `line` border; selected = crimson fill, white numeral; `accessibilityRole="radiogroup"`, items `radio` with `checked`; haptic on pick; hint in `footnote` ("1 = still hungry · 5 = very full", 445).
- **ChoiceRow (4 options)** — 48 pt chips with full labels "No / Light / Moderate / Heavy" and "No / Breakfast / Lunch / Dinner" (the mock's "Mod"/"Bkfst" at 2017–2023 are not shipped); wraps 2 × 2 above 1.3× text.
- **ProgressDots** — five 4 pt bars filling in crimson; label "3 of 5 answered".
- **TimerPill** — `crimsonSoft` pill, `pill` numerals "0:19"; starts on focus, stops on save; hidden from the screen reader while running; the saved toast carries the duration ("Saved in 19 s as one anonymous record. No name, no student ID." 2037).
- **StateWord** — 12 pt dot + `display` word; header role; label "Your 7-day energy balance: Watch".
- **EvidenceRow × 4** — 26 pt icon well on `surface2`, `headline` category, `subhead` sentence (§6.2 templates).
- **ActionRow ≤ 3** — soft-green row, numbered 22 pt green disc, `subhead` in `greenInk` (`.actionrow` CSS).
- **AttentionCard** — `crimsonSoft`, `crimsonInk` text, the wording at 1030–1034 with the phone as a `tel:` link, ghost "How to reach them" (→ `/health`), footnote "Nobody has been told about this. It is your call." (2075). Streak ≥ 3 switches to the firmer variant and adds "Open a message you can send" (prefilled SMS/mail, student-initiated — 1004).
- **Toast** — bottom, 2.6 s, polite live region.
- Dashboard: `Sidebar` (groups "Dining Services" / "Health & Wellness" / "How it works", 626–640), `Kpi` (value, label, footnote delta — 650–668), `BarRow` (label · track · tabular value — `barRow` 1889), `Scatter` (SVG, quadrant labels "keep as is / portion or side mismatch / review the recipe" — 736–744), `DataTable` (sortable; "—" for suppressed), `RuleCode` (mono block, firing line highlighted — `renderRuleCode` 2474), `Sliders` (seven inputs — `renderRuleSliders` 2504), permanent banner "Synthetic data · 60 simulated students × 30 days · no real student data exists in this build" (633).

### 7.4 Screen anatomy

**Home** — title "Good afternoon." · subtitle "Thursday 8 October · dinner 5:30–7:30 pm" · [demo footnote] → MenuCard → "Your 7-day average" with right footnote "6 of 7 days checked in" (1963) → ScoreBoxes → Suggestion → card "Today's check-in" (badge done / not yet; the five answers in words; or "No check-in yesterday — that's fine, today counts.") + primary **Start · 20 seconds** or ghost **Change today's answers** (1980–1986) → card "This week at a glance" (WeekStrip + footnote "Bars are your energy rating each day. Tap Balance for what changed and why." 419) + ghost **Open Energy Balance** → SafetyBar.

**Check-in** — header "Check-in" with TimerPill; subtitle "Thu 8 Oct · 5 taps and you're done" (436) → five cards: question (`title`) + widget + hint — fullness ("1 = still hungry · 5 = very full"), energy ("Right now, not this morning" 451), focus ("Think about your last class or study period" 457), training (no hint), skipped ("Nobody sees this but you. It is the single most useful input in the app." 468) → ProgressDots → sticky **Save** / **Save (2 left)** disabled (2025) → footnote "Saved as one anonymous record: five values and a date. No name, no student ID." (476) → SafetyBar. Pre-fills from today's record. Save → haptic → toast → Balance.

**Balance** — title "Energy Balance" · subtitle "Watch · 6 of 7 days" (2089) → state card: label "YOUR 7-DAY ENERGY BALANCE", StateWord, footnote "Based on 6 check-ins in the last 7 days", WeekStrip, footnote "Bars are your energy rating each day." or "Grey days are days without a check-in." (2055–2056), optional hysteresis footnote → "Why it says watch" + four EvidenceRows (2060) → "What you could try" / "Keep it up" + ActionRows (2066) → AttentionCard when attention → card "Where this comes from": "This word comes from a fixed set of rules, not a prediction. The rule that matched looks at skipped meals, heavy training and the direction of your fullness. The same rules run on your phone and on the school's side, so the answer is always identical." (student-side words for `CLAUSE_TEXT`; the threshold form at 1780–1790 lives only on `/staff/rules` and `/how`) + Cell "How this works" → ghost **Update today's check-in** (2087) → SafetyBar. `nodata`: StateWord "Not enough data" + the single callout.

**Consent** — "Before you start" / "What this app does with your answers" → the six sentences as rows with check icons (1124–1129; spec §12 says seven at 1547 — reconcile in the Health Center review, D13) → "Daily reminder" row (time picker, default 3:00 pm; footnote 1180) → primary **I understand** (requests notification permission when reminders are on) → ghost **Not now** (→ `/not-now`: "You can come back any time.") → footnote "Reviewed by the Health Center and a student advisory group · 7th-grade reading level" (1133).

**Your data / Health Center / How this works / Privacy** — grouped lists; Your data has the one red button **Delete everything** (confirm), export via the share sheet, the exact record shape (1095–1103), the never-collected list (1105–1106), timing stats, demo scenarios, sync status ("Local only · no school backend configured" or "Synced · 12 records").

### 7.5 States, motion, accessibility
States every student screen handles: first run · today not yet · today done · nodata · stable · watch · attention · attention ≥ 3 days · demo · notifications denied · local-only · Dynamic Type 200 % · VoiceOver/TalkBack. Motion: the state word rises in (200 ms) and the Save button enables — nothing else animates. Launch: synchronous read from SQLite so the first frame is the real Home; no spinners anywhere. Tabs: Home / Check-in / Balance with house, timer, scale icons (markup 494–498), tint crimson. Accessibility (1555): text ≥ 4.5:1 per §7.2; targets ≥ 44 pt; radio groups for scales; header roles; decorative icons hidden; live regions for toast and footnotes; no information by colour alone; the timer does not announce. Screenshot matrix for `docs/design.md`: (3 tabs + 5 sub-screens) × 4 scenarios × 2 text sizes = 64 shots.

---

## 8. Staff dashboard (web)

Sign-in: email link against `staff/allowlist` (`src/services/staffAuth.ts`); unauthenticated → `/staff/sign-in`. Data: `aggregates/{week}` and `menus/*` only — the staff bundle imports neither `src/data/repos.ts` nor the student store (boundary test); no student-level query exists (1011–1018 "Not hidden — not built", 1534). Views per §1.2 with the titles at `OPS_TITLES` 2268–2279. Rule tester: seven inputs (`TESTER` defaults 2473) → `evaluateRules` → word, clause, highlighted line, "Same function, same thresholds, same result as the student app" (2535). Menu editor (`/staff/ops`): add/edit/remove rows for a date, writes `menus/{date}` with `enteredBy`/`enteredAt`; the phone reads today's document when online and falls back to the bundled weekly template with the honest footnote; QA row: enter 24 items in ≤ 4 minutes (E6 1699). Pilot log (`/staff/menu`): `{change, group, length, metric, comparison, decideBy}` — the pilot card shape (908–916).

---

## 9. Weekly batch and the one AI call (`scripts/weekly-batch.ts`)

1. Read `checkins` for the term (Phase 1: the synthetic fixture via `--synthetic`); hash `uid` with `TERM_SALT`.
2. `aggregateWeek(dataset, week)` — `suppress()` drops any group with n < 10 **before** a row exists (§9 1482; guardrail 847); menu ratings < 10 → `satisfaction: null`; pattern candidates only from `patterns.json` (pre-registered, 1484); `confidence.ts`: High = holds across 4+ weeks and both halves, Medium = this period, Low = suggestive (831, 1485); calendar events joined (1487); `stateCounts` and `attentionStreak3Count` via `balanceFor` (1004 "flagged in the weekly total").
3. The one LLM call (§3.5) on the display-formatted table → validate → `proseSummary`, `proseMeta`; on any failure `templateProse()`.
4. Write `aggregates/{week}` to Firestore (and `assets/data/aggregates-2027.json` in Phase 1). `--purge-term` deletes raw rows after aggregation (1114).
Tests: suppression property over 200 random student subsets; the n = 6 "Grade 11 athletes" group (2179) is absent from output, not marked; validators reject causal verbs, foreign numbers, missing confidence, > 180 words; template output passes the same validators.

---

## 10. Wording operations (§14 1562–1571)

- `src/i18n/en.ts` typed catalog; `inventory.ts` rows `{audience: 'student'|'consent'|'notification'|'staff', owner, reviewedOn, textHash}` — "every student-facing string lives in one file with an ID, an owner, and a review date" (1565).
- Rejection tests as code (1566): forbidden list over student/consent/notification strings and `school.json` templates — (a) `diagnos*`, `RED-S`, `syndrome`, `disorder`, `risk`, `probability`, `%`; (b) `calorie`, `kcal`, `weight`, `BMI`, `/\b(eat|drink)\s+\d/`; (c) `body`, `fat`, `thin`, `skinny`; (d) `streak`, `chain`, `missed`, `lost`, `!`; (e) `prevent*`, `protect*`, `guarantee*`, `detect*`, `will improve`. A named allow-list holds the string IDs that must contain a forbidden word: the disclaimer ("does not diagnose", 1520) and consent sentence 6 (1129). Test: forbidden words appear only in allow-listed IDs.
- Reading level (1570): `scripts/readability.ts` (Flesch–Kincaid, syllable heuristic) — student copy ≤ grade 7.5, consent ≤ 8.5; approximate, stated as such in `docs/strings.md`.
- Week-7 review (1567): `docs/strings.md` is the printable inventory; a change to a string without a new `reviewedOn` fails the test (`textHash` mismatch) once `STRINGS_GATE=1` is set for M5.
- Templates, not generation (1569): every evidence and action sentence is in the catalog or `school.json`; nothing health-adjacent is generated at runtime.
- The LLM prompt is a reviewed string too (1479): `prose.system.v1` in `docs/strings.md` with its review log.

---

## 11. Privacy, consent, approvals (§12 1529–1550)

Consent gate before any write; "Not now" leaves the app usable only as the consent screen. Student control: Your data lists everything, exports CSV (`date,fullness,energy,focus,training,skipped`), deletes everything (§5.2). Health Center sharing only by the student's own export (1537; 2146). `docs/approvals.md` mirrors the table at 1136–1159 with statuses; the dashboard's Data view reads it. Firestore rules tests (emulator): a client cannot read another uid's documents, cannot write a sixth field, cannot write out-of-range values, cannot read `aggregates` without staff sign-in.

---

## 12. Demo scenarios and the reminder

- Scenarios `stable | watch | attention | sparse` load the four `SCENARIOS` weeks (1818–1855) dated to today with `isDemo`; real records are kept under `demoBackup` and restored by `live`; export is disabled during a demo with a footnote; deep links `nourishingx://?demo=watch`. The dashboard's "Load a … week" buttons (1058–1061) are the same scenarios on the tester.
- Reminder: `scheduleReminder(hour, minute)` cancels the stored id and schedules one `DAILY` trigger; after a save the notification for the rest of today is cancelled and re-armed at midnight; permission is requested on "I understand" (reminders on by default) and from the Your data toggle; a response listener opens Check-in. Copy: title "NourishingX", body "Time for your 20-second check-in." (2109–2110). Tests with the mocked module: exactly one pending trigger after any sequence of time changes; none after consent withdrawal; none pending for today after a save.

---

## 13. Testing and QA

| Layer | What | Gate |
|---|---|---|
| Domain unit | every clause boundary both sides; hysteresis cases of §6.4; evidence by clause (inputs present, exactly four, no decimals); actions ≤ 3 from `school.json` with no digits; `fullDelta` edges; synthetic reproducibility and demonstrable states; suppression property; confidence words; prose validators; template prose; counters | `npm test` |
| Strings | inventory completeness; forbidden words with allow-list; reading level; `textHash`/`reviewedOn` rule (gated) | `npm test` |
| Boundary | `src/domain` has no React/Expo imports; one definition of `evaluateRules`; student routes import nothing from `src/app/staff` or the Anthropic SDK; staff routes import nothing from the student store; no type literals outside `theme.ts`; iOS export bundle contains no `staff/` or SDK symbols | `npm test` + CI export step |
| Screens | Home / Check-in / Balance / Consent / Data / Health / How × {empty, stable, watch, attention, sparse} with the network mocked off: disclaimer and Health Center button on every student route; Save disabled until five answers; Balance renders no `/\d\.\d/`, `%`, `≥`, `≤`; attention card only in attention; staff `.web.tsx` render, native stubs redirect | `npm test` |
| Firestore rules | emulator tests listed in §11 | `npm run test:rules` |
| Device QA (`docs/QA.md`) | T1 cold start offline → Home from disk, no spinner; T2 zero network from the student app in airplane mode across every screen (proxy log screenshot); T3 check-in survives force-quit and reboot; T4 second check-in same day overwrites; T5 reminder fires once at the chosen time and not after a save; T6 **stopwatch: 10 students, median < 25 s, all < 30 s** (1584); T7 Dynamic Type accessibility-large; T8 VoiceOver/TalkBack completes a check-in; T9 Delete everything leaves an empty store and no pending notification; T10 menu editor: 24 items in ≤ 4 minutes | before M5 |
| Design audit (`docs/design.md`) | 64-shot matrix; type-literal grep = 0; contrast table checked; one primary action per screen | M5 |
| Weekly review (`docs/weekly-review.md`, questions at 1233–1246) | one row per build week: check-in still < 30 s; strings changed with review; exclusion list intact; every state traceable to a clause; AI still one call site; a clinician comfortable with every sentence | W1–W8 |

---

## 14. Milestones (§18.5 rhythm, line 1689; 1 developer)

| Milestone | Week | Deliverables | Done when |
|---|---|---|---|
| **M0 Scope lock** (E1) | 1 | Expo project; `theme.ts` per §7.2; `Screen` with SafetyBar; store + registry; `counters.ts` (declared values asserted; grep checks switch on in M3); `inventory.ts` + forbidden-words test; `school.json`, `menu.json`; `docs/{approvals,thresholds,strings,weekly-review}.md`; approvals requested (Health Center wording, Dean/IT data policy, 1541–1547) | typecheck/lint/test green; app boots to Consent in Expo Go; weekly-review row 1 written |
| **M1 Check-in + Home** (E2, E5, E7) | 2 | Consent gate; Check-in with timer, dots, overwrite, timing store; Home with MenuCard, averages, suggestion, week strip; Your data (list, export, delete); demo scenarios; local reminder with response listener | **Check-in timed < 25 s median by 5 people on a real phone** (W2 gate, 1683); T3–T5, T9; screens tests pass |
| **M2 Rules + Balance + synthetic** (E3, E4, E8) | 3–4 | `rules.ts`, `hysteresis.ts`, `evidence.ts`, `actions.ts` with per-clause tests (W3); Balance in all states, attention card, streak prompt, How this works; `synthetic.ts` + fixture + `aggregate.ts` with the suppression property (W4); `thresholds.md` | all §6 tests pass; four scenarios render the expected word; Balance renders no decimals; fixture reproducible |
| **M3 Dashboard core + batch + sync** (E6, E9, E10, E11) | 5–6 | Firebase project, rules + emulator tests, `sync.ts`, `seed-synthetic.ts`; staff sign-in; views overview, menu, wellness, rules tester, data, ops (menu editor), scope; `weekly-batch.ts` with the one LLM call, validators, template fallback; `aggregates-2027.json` | `/staff/*` render tests; rules tests; tester equals phone on the four scenarios; batch run writes aggregates with `source: 'model'` once live (`ANTHROPIC_API_KEY` set) and `'template'` without; T10 |
| **M4 Patterns + what-if — cut line** | 6 (remaining days) | `/staff/patterns`, `/staff/what-if` + pilot card | render tests; suppressed group absent |
| **M5 Wording review + submission** (E12) | 7–8 | W7 string review with the Health Center recorded (`STRINGS_GATE=1`); design audit and fixes; T1–T10 recorded; README (Appendix C); video per 18.2 with the stopwatch on camera; clean-clone test; `gap-analysis.md` (every spec row done / partial / deferred); EAS preview build | all gates green; QA table complete; video ≤ 3:00; clean clone boots |

Cut order if M2 or M3 overrun: M4 first; then the scatter becomes a table; then the menu editor becomes a read-only table with the JSON file edited by hand; the LLM step falls back to the template (the call site stays, behind `ANTHROPIC_API_KEY`). Week 8 is reserved for submission (1689).

---

## 15. Acceptance criteria (testable)

1. `npm run typecheck && npm run lint && npm test && npm run test:rules` green with no network; CI also runs `npm run gen -- --check` and the iOS export grep.
2. `evaluateRules` is defined once; the phone, the batch and the tester import it (boundary test).
3. The four `SCENARIOS` weeks (1818–1855) produce watch / stable / attention / nodata on the phone and on the tester (snapshot).
4. Every clause A, B1–B3, C1–C4, D has a boundary test on both sides of each threshold; `TH` equals lines 1741–1750.
5. For every clause, every input it tests appears in its evidence categories; for every non-nodata input exactly four lines; `nodata` renders zero lines and the callout.
6. Hysteresis: `attention, stable, stable, stable` → `attention, attention, attention, stable`; `stable, attention` → `stable, attention`; days without a check-in never count as qualifying; a `nodata` gap shorter than 7 days keeps the carried word; flips per synthetic student-week < 1 (1590).
7. No student route renders `/\d\.\d/`, `%`, `≥`, `≤`, or a forbidden word outside the allow-listed IDs; the disclaimer and the Health Center button render on every student route.
8. Save is disabled until five answers exist; two saves on one date leave one record with the second values.
9. Delete everything empties every registered key, cancels the notification and (when configured) deletes the uid's Firestore documents; T9 on device.
10. Exactly one pending `DAILY` trigger after any sequence of time changes; none after consent withdrawal; none for today after a save; a tap opens Check-in (unit with mocks; T5).
11. The student app makes zero network calls in local-only mode and only Firestore calls when configured (screens test with fetch spied; T2).
12. `generate(2027)` deep-equals the fixture; week 4 has ≥ 1 student in each state and exactly 2 sparse students; watch + attention ≤ 20 % of participants outside exam week.
13. No emitted aggregate group has n < 10 (property test); `menuStats.satisfaction` is null below 10 ratings; the n = 6 group at 2179 is absent.
14. Prose validators reject causal verbs, numbers absent from the table, missing confidence, > 180 words, "students" instead of "participants"; `proseMeta.source` records model vs template; the dashboard labels both.
15. Every student/consent/notification string has an inventory row; with `STRINGS_GATE=1`, `reviewedOn` is set and `textHash` matches.
16. Reading level: student copy ≤ 7.5, consent ≤ 8.5 (project script).
17. Zero type literals outside `theme.ts`; every text colour in §7.2 ≥ 4.5:1 on its surface (recorded in `docs/design.md`).
18. Counters file equals `{externalApis: 0, authKeys: 1, serverFunctions: 0, aiCallSites: 1, ruleLines: ≤ 60, studentScreens: 3}`; from M3 the grep checks confirm one Anthropic SDK import (in `scripts/`) and three tab files.
19. Firestore rules: cross-uid read denied; sixth field denied; out-of-range denied; `aggregates` read denied without staff sign-in.
20. T6: ten timed check-ins by students, median < 25 s, max < 30 s, raw numbers in `docs/QA.md`.
21. Clean clone: `npm install && npx expo start --go` boots the app; `npx expo start --web` serves `/staff` on the synthetic aggregates.

---

## 16. Risks and mitigations (§17 1596–1606 plus technical)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Scope creep — "the top project risk, not the technology" (1600) | exclusion list on `/staff/scope`, counters test, M4 the only stretch, week 8 frozen, weekly-review log |
| R2 | The habit does not hold (1601) | twenty-second ceiling instrumented from M1; W2 gate with five people; one notification; no guilt copy |
| R3 | A student reads the word as a diagnosis (1602) | pinned disclaimer, no numerals on Balance, clause in plain words, Health Center one tap away; W7 clinician review; 5–8 student interviews on wording (1674) |
| R4 | Thresholds are wrong (1603) | published provenance, tester, "reasoned, not validated" in README and video |
| R5 | The school says no (1604) | the submission runs on synthetic data and needs no approval; the pilot is the ask |
| R6 | Body-image harm (1605) | no weight/calories/photos/streaks/rankings; forbidden-words test; 7-day window only; raw list without judgement |
| R7 | Founder-story dependence (1606) | twenty seconds of the video, once |
| R8 | Local notification reliability (Android battery managers) | spec accepts silent failure (1177); Your data shows "Next reminder 3:00 pm"; T5 on both platforms |
| R9 | Backend not approved or not configured in time | local-only mode is first-class; the demo never depends on Firebase |
| R10 | Synthetic data mistaken for findings | permanent banner (633), "participants" footnotes, n everywhere, confidence as words, "hypotheses, not findings" (816) |
| R11 | Health Center requires an escalation path (open question 1, 1609) | settle first; the plan has no notify path, so a change is a new feature, not a toggle |
| R12 | One developer, eight weeks | cut order in §14; M4 and the scatter go first |

---

## 17. Verification steps (owner)

```bash
npm install
npm run typecheck && npm run lint && npm test
npm run gen -- --check                     # synthetic + aggregates fixtures unchanged
npm run test:rules                         # Firestore emulator rules tests
STRINGS_GATE=1 npm test -- strings         # M5+
npx expo start --go                        # Expo Go: Consent → Check-in (watch the pill) → Balance
npx expo start --web                       # http://localhost:8081/staff → sign-in → rules tester
npm run batch -- --synthetic --week 4      # writes aggregates; source: model | template
# device QA: docs/QA.md T1–T10; demo: nourishingx://?demo=watch | attention | sparse | stable
```

---

## 18. Open decisions (defaults applied)

| # | Decision | Default | Alternative |
|---|---|---|---|
| D1 | BaaS | Firebase (Firestore terms in §6) | Supabase (Postgres + RLS) |
| D2 | Reminder | Local `DAILY` notification; server functions 0 | Scheduled function → FCM (needs device tokens the data model forbids, dev build on Android) |
| D3 | Weekly batch language | TypeScript sharing `rules.ts` | Python/Pandas (spec literal); must reproduce the fixture |
| D4 | Dashboard | Expo web target `/staff/*` | Separate web app |
| D5 | Week-strip colouring | One neutral colour, hollow missing days | Prototype per-day colouring by energy |
| D6 | Evidence selection | By firing clause from the five spec categories | Prototype's fixed four |
| D7 | `fullDelta` | Check-in based (prototype) | Calendar based (spec prose) |
| D8 | Patterns + what-if in Phase 1 | Stretch (M4) | Phase 3 as the spec says |
| D9 | Greeting name / schedule | None | Local-only first name (no field exists for it) |
| D10 | Student history | 7-day window; raw list on Your data | 30-day view (body-image risk, 1614) |
| D11 | Grade for `byGrade` in Phase 2 | Open | Opt-in grade band at consent |
| D12 | Appearance | Light only | Dark mode |
| D13 | Consent sentence count | Six (prototype 1124–1129) | Seven (§12 1547) — decide in the Health Center review |
| D14 | Menu satisfaction source in Phase 2 | Open — synthetic in v1 | A sixth tap after Save (against the 20-second budget) or dining-hall comment cards |
| D15 | Menu gradient | Flat crimson card | Gradient as in the mock |

Open questions the spec lists for the first working session (1607–1616) that this plan does not decide: the Health Center's position on individual alerts (1609), who owns the menu table daily (1613), dorm vs team pilot cohort (1614), the single measured dining-hall change (1615), who reviews the LLM prompt and how often (1616).

---

## 19. Scope boundaries

### 19.1 Deferred to the approved pilot (Phase 2, 1575)
Real cohort writes; term-salt rotation and raw-row purge on real data; per-instance Health Center sharing; clinician threshold review against observed data; Pandas port if wanted.

### 19.2 Excluded (§3 1322–1335; re-checked weekly)
Community feed, points/coupons/streaks, friend recommendations, photo plate-waste estimation, sleep and weight input, calorie counting or numeric targets, menu API integration, student-visible simulator, chatbot / free-text health Q&A, individual alerts to staff — each on `/staff/scope` with its reason and "if someone asks" answer (`SCOPE_ROWS` 2254–2266).

---

## Appendix A — Spec surface → route

| Spec | Route |
|---|---|
| Home / Quick Check-In / Energy Balance | `/(tabs)/index` · `/(tabs)/checkin` · `/(tabs)/balance` |
| Consent sheet / "Not now" | `/consent` · `/not-now` |
| Health Center sheet | `/health` (modal) |
| Student-side rules explanation | `/how` (modal) |
| See / export / delete | `/data` |
| Weekly overview · Menu performance · Aggregate states · Rule engine · Data & consent · Menu table & reminder · Scope guard | `/staff` · `/staff/menu` · `/staff/wellness` · `/staff/rules` · `/staff/data` · `/staff/ops` · `/staff/scope` |
| Pattern candidates · What-if simulator | `/staff/patterns` · `/staff/what-if` (M4) |
| The one AI call | `scripts/weekly-batch.ts` (not a route) |

## Appendix B — Environment variables (`.env.example`)

```
# batch only (never shipped to a phone or a browser)
ANTHROPIC_API_KEY=
PROSE_MODEL=claude-opus-5-5
TERM_SALT=                                  # rotated each term; HMAC(uid, TERM_SALT) happens only here
FIREBASE_SERVICE_ACCOUNT_JSON=              # batch write access

# client (public by design; absent = local-only mode)
# EXPO_PUBLIC_FIREBASE_API_KEY=  EXPO_PUBLIC_FIREBASE_PROJECT_ID=  EXPO_PUBLIC_FIREBASE_APP_ID=  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
```

## Appendix C — README outline (§18.3 1656–1668)
Problem (founder's account in two sentences) · What it does (three screens, one dashboard, four sentences) · The safety design (three words, pinned disclaimer, rules not AI, no individual alerts) · Architecture (diagram + six counters 0 / 1 / 0 / 1 / ~40 / 3) · The rule engine (the ~40 lines, provenance, "reasoned, not validated") · Where AI is used (one call site in the weekly batch, prompt discipline, where it is absent) · Data model & privacy (document shape, never collected, n ≥ 10 inside the function) · Synthetic dataset (seed 2027, `npm run gen`) · What is real vs prototype (local-only mode, synthetic data, approvals outstanding) · Pilot plan (approvals, cohort, the one metric) · Team & roles · Setup from a clean clone · Acknowledgements.

## Appendix D — AGENTS.md for this repo (M0)

```
# NourishingX
Spec: ../docs/5_NewHampshire.HTM (the only source). Plan: .omc/plans/nourishingx-v1-production-plan.md. Design: docs/design.md. Strings: docs/strings.md.
Expo SDK 57: read https://docs.expo.dev/versions/v57.0.0/ for every API before writing code.
Rules: src/domain has no React/Expo imports. evaluateRules exists once (src/domain/rules.ts) and is shared by phone, batch and tester.
Three state words plus "Not enough data". No percentage, score, decimal or probability on any student screen. Four evidence lines chosen by the firing clause. Actions ≤ 3 from assets/data/school.json.
The disclaimer and the Health Center button are part of Screen; never remove them. No streaks, points, weight, calories, photos, free text, names.
Every student-facing string lives in src/i18n/en.ts with an inventory row; the forbidden-words test must pass.
The only AI call is in scripts/weekly-batch.ts; load the claude-api skill before touching it. No spinners. Offline is the default. Demo data is labelled. Only theme.ts has type/colour literals.
```

---

## Changelog

**Rev 1 (2026-10-05):** initial plan. Rejected in review: evidence ignored the firing clause; hysteresis fold lost memory across sparse gaps and let non-check-in days qualify; student copy contained decimals and threshold text; an unauthenticated LLM route; route guards unspecified; reminder permission/response handling missing; menu table not end-to-end; schedule too dense in week 5.
**Rev 2 (2026-10-05):** rebuilt from the NourishingX document only (all references to other projects removed). Backend per §5 (Firebase default, local-only mode); reminder local (D2) with the §6 device-ID argument; AI call moved into the weekly batch and cached in `aggregates.proseSummary`; evidence by clause with pinned integer-only templates; hysteresis redefined with carry and check-in-qualifying days; key registry and delete-by-enumeration; platform-specific staff routes; menu workflow and QA row; schedule rebalanced with a cut order; forbidden-words allow-list; citations corrected (TH 1741, SCENARIOS 1818, TESTER 2473, overwrite 1110, W2 gate 1683, banner 633, aggregates 1413, scope creep 1600, 3-day row 1004).
