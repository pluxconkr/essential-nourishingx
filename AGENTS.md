# NourishingX

Spec: `../docs/5_NewHampshire.HTM` (the only source). Plan: `.omc/plans/nourishingx-v1-production-plan.md`.
Expo SDK 57: read https://docs.expo.dev/versions/v57.0.0/ for every API before writing code.

Rules:
- `src/domain` has no React/Expo imports. `evaluateRules` exists once (`src/domain/rules.ts`) and is the only thing that decides a state word.
- Three state words plus "Not enough data". No percentage, score, decimal or probability on the Balance screen. Four evidence lines chosen by the firing clause. Actions ≤ 3 from `assets/data/school.json`.
- The disclaimer and the Health Center button are part of `Screen`; never remove them.
- No streaks, points, weight, calories, photos, free text, names. Every student-facing string lives in `src/i18n/en.ts`; the forbidden-words test must pass.
- The only AI call is in `scripts/weekly-batch.ts` (not built yet). No spinners. Offline is the default. Demo data is labelled. Only `src/ui/theme.ts` has type/colour literals.
