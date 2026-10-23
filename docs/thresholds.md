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
| Low-protein meal (C5) | < 10 g protein in one photographed main meal | Teen RDA for protein is 46 g/day (girls) and 52 g/day (boys), ages 14–18 (National Academies DRI tables), about 15–17 g per meal over three meals; sport guidance is higher, 20–40 g per meal (ISSN position stand, Jäger et al. 2017). 10 g is well under both | defensible |
| Low-protein share (C5) | ≥ 3/4 of ≥ 4 photographed main meals | A pattern across most photographed meals, never one plate; four meals is the fewest that makes a share meaningful | defensible |
| Low-carbohydrate heavy day (C6) | < 60 g carbohydrate across ≥ 2 photographed main meals on a heavy-training day | The carbohydrate RDA for every age from 1 year is 130 g/day (DRI), about 43 g per meal; training athletes need far more (8–12 g/kg/day to fill glycogen, ISSN nutrient-timing stand, Kerksick et al. 2017). Two meals under 60 g together is clearly below even the non-athlete baseline | defensible |
| Low-carbohydrate days (C6) | ≥ 2 such days in 7 | Repeated, not a single day | defensible |

## `fullDelta` semantics
`mean(fullness of the last 3 present check-ins) − mean(fullness of up to 4 earlier present check-ins)`, 0 when either side is empty. Check-in based, not calendar based (the prototype's `derive`).

## Meal photos (C5, C6)
Meal photos are optional. The rules only read what was photographed: a meal or a day without a photo is never
evidence, several photos of one meal are added together, and snacks are not meals. Both clauses come after every
check-in clause and can only say **Watch** — a photo estimate is off by about 40 % on average
(`docs/ai-router.md`), too uncertain to say **Needs attention** on its own. Body weight is never collected, so the
per-kilogram targets in the sources are used only to show that the thresholds sit far below any athlete's need.

Sources:
- National Academies of Sciences, Engineering, and Medicine, *Dietary Reference Intakes: Recommended Dietary
  Allowances and Adequate Intakes, Total Water and Macronutrients* (protein RDA 14–18 y: 52 g/day males,
  46 g/day females; carbohydrate RDA 130 g/day).
- Jäger R, et al. International Society of Sports Nutrition Position Stand: protein and exercise.
  *J Int Soc Sports Nutr* 2017;14:20 (0.25 g/kg or 20–40 g per meal; 1.4–2.0 g/kg/day). PMID 28642676.
- Kerksick CM, et al. International Society of Sports Nutrition position stand: nutrient timing.
  *J Int Soc Sports Nutr* 2017;14:33 (8–12 g carbohydrate/kg/day maximises glycogen). PMID 28919842.
- Thomas DT, Erdman KA, Burke LM. American College of Sports Medicine Joint Position Statement: Nutrition and
  Athletic Performance. *Med Sci Sports Exerc* 2016;48(3):543-568. PMID 26891166 (context; refer athletes to a
  registered dietitian for a personal plan).

## Known property for clinician review
C3 (`fullDelta ≤ −1.0 and heavy ≥ 2`) can fire from a single very low fullness rating after six steady ones, so "no single bad day can produce a warning" does not hold for C3. The word is Watch, not Needs attention, and it improves after three steadier check-ins. Decide with the Health Center whether C3 should require two low days.
