# Sources

Every number NourishingX shows or uses to judge food has a source here. When code depends on one of these, its
comment points back to this page.

## Food energy and nutrients

**USDA FoodData Central, SR Legacy** (https://fdc.nal.usda.gov). Looked up through the FoodData Central API on
2026-10-23. Values per 100 g of the food as described. These are the reference points in the meal-analysis prompt
(`DEEP_SYSTEM` in `supabase/functions/_shared/meal-router.ts`).

| Food (FoodData Central description) | fdcId | kcal | Protein g | Carbohydrate g | Fat g |
|---|---|---|---|---|---|
| Apples, raw, without skin | 171689 | 48 | 0.27 | 12.8 | 0.13 |
| Bananas, raw | 173944 | 89 | 1.09 | 22.8 | 0.33 |
| Broccoli, cooked, boiled, drained, without salt | 169967 | 35 | 2.38 | 7.18 | 0.41 |
| Sweet potato, cooked, baked in skin, flesh, without salt | 168483 | 90 | 2.01 | 20.7 | 0.15 |
| Potatoes, baked, flesh and skin, without salt | 170093 | 93 | 2.5 | 21.2 | 0.13 |
| Rice, white, long-grain, regular, enriched, cooked | 168878 | 130 | 2.69 | 28.2 | 0.28 |
| Couscous, cooked | 169700 | 112 | 3.79 | 23.2 | 0.16 |
| Pasta, cooked, enriched, without added salt | 169737 | 158 | 5.8 | 30.9 | 0.93 |
| Chicken, broilers or fryers, breast, meat only, cooked, roasted | 171477 | 165 | 31 | 0 | 3.57 |
| Egg, white, raw, fresh | 172183 | 52 | 10.9 | 0.73 | 0.17 |

Oils are about 884 kcal per 100 g, the energy of pure fat (9 kcal/g, below); the validator rejects any food
denser than 900 kcal per 100 g.

**Energy factors.** 4 kcal per gram of protein and of carbohydrate, 9 per gram of fat: the general Atwater
factors that FoodData Central documents for most foods. Dietary fibre yields about 2 kcal per gram
(8 kJ/g; FAO, *Food energy – methods of analysis and conversion factors*, FAO Food and Nutrition Paper 77, 2003,
chapter 3). Because US Nutrition Facts labels count fibre inside total carbohydrate, the validator estimates
energy as 4·protein + 4·carbohydrate + 9·fat − 2·fibre.

**Food groups.** Fruits, vegetables, grains, protein foods and dairy are the five USDA MyPlate groups
(https://www.myplate.gov/eat-healthy/what-is-myplate). NourishingX adds fats and oils, sweets, drinks and mixed
dishes so every item on a dining-hall plate has a group.

## Photos used to test the AI

- **Nutrition5k** — Q. Thames, A. Karpur, W. Norris, F. Xia, L. Panait, T. Weyand, J. Sim, “Nutrition5k: Towards
  Automatic Nutritional Understanding of Generic Food”, CVPR 2021, pp. 8903-8911. Released under the Creative
  Commons 4.0 licence (CC BY 4.0). Dish metadata and overhead images from
  `gs://nutrition5k_dataset` (https://github.com/google-research-datasets/Nutrition5k).
- **Wikimedia Commons** — each photo's author, licence and page are listed in `scripts/eval/cases.json`:
  U.S. Department of Agriculture (public domain), Sean Biehle (CC BY-SA 2.0), Jukajuha (CC0),
  BrokenSphere (CC BY 3.0), Geoff Peters (CC BY 2.0), samuelfernandezrivera (CC0), abex (CC BY-SA 2.0),
  AdinaVoicu (CC0), Norbert Levajsics (CC0). The photos are downloaded when the test runs and are not copied
  into this repository.

## Claude models and prices

Model names and prices per million tokens come from Anthropic's model table as bundled in the claude-api skill
(cached 2026-10-06): Claude Haiku 5.5 $0.10 in / $0.50 out, Claude Opus 5.5 $4 / $20, Claude Fable 5.1 $10 / $50.
The project's API key confirmed all three models through `GET /v1/models` on 2026-10-23.
`PRICE_PER_MTOK` in `supabase/functions/_shared/meal-router.ts` uses these numbers to fill the `ai_usage` ledger.

## Supabase behaviour the security model relies on

- New tables are no longer exposed to the Data API automatically (Supabase changelog, 2026-04-28, enforced on all
  projects from 2026-10-30) — every migration here grants privileges explicitly.
- Anonymous users hold the `authenticated` Postgres role, so a policy that only says `to authenticated` would let
  any anonymous user in; every student policy also checks `(select auth.uid()) = user_id`.
- `user_metadata` can be edited by the user, so authorisation uses `app_metadata` only.
