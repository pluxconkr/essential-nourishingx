# Rule thresholds — provenance

The thresholds in `src/domain/rules.ts` (`TH`) are **reasoned, not clinically validated**. Validation requires a clinician's review and a real cohort — that is what the pilot is for. Changing any value here requires changing this file in the same commit.

| Threshold | Value | Basis | Status |
|---|---|---|---|
| Minimum check-ins (A) | 4 in 7 days | Below this the window is not describable; the app says so instead of guessing | defensible |
| Skipped meals (B1) | ≥ 5 in 7 days with heavy training ≥ 3 | Chosen so the flag is uncommon in the synthetic set (about 1 in 5), reviewed against meal-skipping frequency in RED-S screening literature | needs clinician review |
| Heavy training days (B1/B3/C1) | ≥ 3 / ≥ 4 | Matches a typical in-season practice week at a boarding school | needs coach input |
| Falling fullness (B2/B3/C1/C3) | −1.0 / −0.5 / < 0 | Direction of change matters more than level; the last 3 check-ins vs the prior 4 is the smallest window that is not noise | defensible |
| Low energy (B2/C2) | energy ≤ 2 on ≥ 5 / ≥ 3 days | Bottom two points of the scale, repeated — not a single bad day | defensible |
| Low focus (C4) | focus ≤ 2 on ≥ 4 days with skipped ≥ 2 | As above, for focus | defensible |
| Mean energy (B3) | ≤ 2.2 | Combined-threshold clause; only fires with three other conditions | needs clinician review |
| Hysteresis | 3 qualifying check-in days before improving | Prevents daily flip-flopping, which destroys trust in the word | defensible |

## `fullDelta` semantics
`mean(fullness of the last 3 present check-ins) − mean(fullness of up to 4 earlier present check-ins)`, 0 when either side is empty. Check-in based, not calendar based (the prototype's `derive`).

## Known property for clinician review
C3 (`fullDelta ≤ −1.0 and heavy ≥ 2`) can fire from a single very low fullness rating after six steady ones, so "no single bad day can produce a warning" does not hold for C3. The word is Watch, not Needs attention, and it improves after three steadier check-ins. Decide with the Health Center whether C3 should require two low days.
