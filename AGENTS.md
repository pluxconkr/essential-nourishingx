# NourishingX

Decisions: `docs/adr/0001-supabase-ai-pivot.md` (supersedes the Firebase, no-photo and no-calorie parts of `.omc/plans/nourishingx-v1-production-plan.md`). The spec `../docs/5_NewHampshire.HTM` is not in this repo.
Read current docs before writing code: Expo SDK 57 (https://docs.expo.dev/versions/v57.0.0/), Supabase (https://supabase.com/changelog.md + docs), Claude API (load the claude-api skill).

Rules:
- `src/domain` has no React/Expo imports and uses explicit `.ts` relative imports, because Edge Functions import it. `evaluateRules` exists once (`src/domain/rules.ts`) and is the only thing that decides a state word — phone, Edge Functions and the staff rule tester all call it.
- Balance: three state words plus "Not enough data", four evidence lines chosen by the firing clause, actions ≤ 3 from `assets/data/school.json`. No percentage, score, decimal or probability on the Balance screen.
- Meal photos are optional, go straight to the `analyze-meal` Edge Function and are never stored. Meal results may show calorie and macro estimates, always labelled as estimates; never targets, rankings, weight or good/bad food words.
- The disclaimer and the Health Center button are part of `Screen` on every student route; never remove them.
- No streaks, points, weight, body measurements, free text or names. Every student-facing string lives in `src/i18n/en.ts`; the forbidden-words test must pass.
- Claude is called only from Supabase Edge Functions through `supabase/functions/_shared/` (Haiku triage → Haiku / Opus / Fable). The key is a function secret; no client bundle may contain it. Every call writes `ai_usage`; the budget guard refuses calls past `AI_BUDGET_USD`.
- Every table has RLS and explicit grants. Students reach only their own rows (`(select auth.uid()) = user_id`). Staff (`app_metadata.role = 'staff'`) see only n ≥ 10 aggregates through `private` security-definer functions. Never authorize on `user_metadata`.
- Secrets live in `.env.local` (gitignored) and Supabase secrets; never print or commit them. Run CLI tools with `node --env-file=.env.local scripts/env-run.mjs <cmd>`.
- The student app works offline (the local store is the source of truth; sync is a queue); only meal analysis needs a connection. No indeterminate spinners — long work shows named steps.
- Only `src/ui/theme.ts` has type/colour literals. Demo and synthetic data are always labelled.
- Facts shown to students or staff (nutrition values, thresholds, guidance) carry a source in a code comment or `docs/sources.md`.
