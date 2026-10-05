# NourishingX

Student nutrition & energy check-in for boarding-school students. Twenty seconds a day → one honest word about the week. Congressional App Challenge 2027 · New Hampshire.

**One claim.** A boarding student can under-fuel for weeks without noticing, and the school's data stops at meal-swipe counts. NourishingX asks five questions a day (fullness, energy, focus, training, skipped meal) and turns seven days of answers into one of three words — Stable, Watch, Needs attention — with four lines of evidence and up to three things to try in this dining hall. No percentages, no diagnosis, no alerts about anyone.

## What it does (Phase 1 — this build)

| Screen | What it shows |
|---|---|
| **Home** | Today's dining-hall menu, your 7-day averages (your own inputs), one suggestion, the check-in entry point, the week strip |
| **Check-in** | Five taps with a live timer. Saved as one anonymous record. A second save the same day overwrites the first |
| **Balance** | One word, four reasons chosen by the rule that fired, up to three actions, the Health Center one tap away. "This app does not diagnose any condition" is pinned to every screen |
| Your data | Every record, export CSV, delete everything, the daily reminder time, check-in timing, demo weeks |

Everything runs on this phone. No account, no server, no network. The reminder is a local daily notification at the time you chose — one per day, never two.

## The safety design

- Three words plus "Not enough data". No number on the Balance screen except integer day counts and the phone number.
- Four evidence lines always, generated from the same clause that chose the word — they cannot disagree with it.
- Rules, not a model: `src/domain/rules.ts` is ~40 lines of fixed thresholds (provenance in `docs/thresholds.md`). A state may worsen immediately but only improves after three steadier check-ins (`src/domain/hysteresis.ts`).
- Escalation is a prompt to the student with a real phone number. There is no code path from a state word to any adult.
- Strings are a reviewed artefact: `src/i18n/en.ts` + `src/i18n/inventory.ts`; `__tests__/strings.test.ts` rejects diagnosis, calorie/weight, body, guilt and promise language.

Build counters: External APIs 0 · Auth keys 0 · Server functions 0 · AI call sites 1 (the weekly batch, not yet built) · Rule lines ~40 · Student screens 3.

## Run it

```bash
npm install
npx expo start --go      # press i / a — everything works in Expo Go
```

## Verify

```bash
npm run typecheck
npm run lint
npm test                 # rules per clause, hysteresis, evidence/actions, strings, counters, store
```

## Where AI is (and is not)

Nowhere in the student app. The spec's one AI call site — turning the weekly aggregate table into a paragraph for Dining Services — belongs to the staff dashboard's weekly batch, which is the next build step. Every state word a student sees comes from `evaluateRules`.

## Layout

```
src/app/        expo-router screens: (tabs)/{index,checkin,balance}, consent, not-now, health, how, data, privacy
src/domain/     pure logic: types, time, rules, evidence, actions, hysteresis, balance, demo, counters
src/data/       expo-sqlite kv store, key registry, validated repos
src/services/   local notification, CSV export, menu table
src/store/      useSyncExternalStore store + derived hooks
src/ui/         theme tokens, primitives, Screen (with SafetyBar), check-in and balance widgets
src/i18n/       string catalog + inventory
assets/data/    school.json (Health Center, dining hours, action templates), menu.json (weekly table)
```

Spec: `../docs/5_NewHampshire.HTM`. Plan: `.omc/plans/nourishingx-v1-production-plan.md`.
