/**
 * Meal-photo router — every part that needs no network (ADR 0001).
 * Claude Haiku 5.5 triages each photo; this code, not a model, picks the deep-analysis model from the triage;
 * this code validates what the deep model returns. Imported by the analyze-meal Edge Function (Deno) and by
 * __tests__/meal-router.test.ts (Node), so it has no Deno, SDK or relative imports — only zod.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------- models
export type Tier = 'haiku' | 'opus' | 'fable';
export const TIERS: readonly Tier[] = ['haiku', 'opus', 'fable'];

export const MODEL_ID = {
  triage: 'claude-haiku-5-5',
  haiku: 'claude-haiku-5-5',
  opus: 'claude-opus-5-5',
  fable: 'claude-fable-5-1',
} as const;

/** USD per million tokens. Source: claude-api skill model table (cached 2026-10-06): Haiku 5.5 $0.10 / $0.50
 * for prompts up to 100K tokens, Opus 5.5 $4 / $20 (cache reads $0.20), Fable 5.1 $10 / $50 (cache reads $0.25).
 * Cache writes use the standard 1.25x input rate for the 5-minute TTL; Haiku 5.5 cache reads assume the usual
 * 0.1x input rate (not stated in the table). */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Cost of one call. Unknown model ids are priced as Fable so the budget guard errs towards stopping. */
export function costUsd(model: string, u: Usage): number {
  const p = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK['claude-fable-5-1'];
  const usd =
    (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** Token ceilings per call; a call can never spend more than this (thinking counts inside max_tokens). */
export const MAX_TOKENS = { triage: 1500, deep: 12000 } as const;
/** One photo is ~1.6K image tokens at 1280 px plus ~1.5K prompt tokens; round up to 4K. */
const WORST_INPUT_TOKENS = 4000;
export function worstCaseCostUsd(tier: Tier): number {
  return costUsd(MODEL_ID[tier], { input_tokens: WORST_INPUT_TOKENS, output_tokens: MAX_TOKENS.deep });
}

// ---------------------------------------------------------------------------------------------- triage
export const SIGNALS = [
  'mixed_dish',
  'hidden_fat_or_sauce',
  'many_items',
  'unfamiliar_dish',
  'packaged_label',
  'partly_eaten',
  'poor_photo',
  'occluded',
  'drink_only',
  'unclear_portion',
] as const;

export const TriageSchema = z.object({
  is_food: z.boolean(),
  items: z.array(z.object({ name: z.string(), amount: z.string() })),
  signals: z.array(z.enum(SIGNALS)),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  photo_quality: z.enum(['good', 'fair', 'poor']),
  confidence: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
});
export type Triage = z.infer<typeof TriageSchema>;

export interface Route {
  tier: Tier;
  why: string[];
}

/**
 * Difficulty picks the tier: easy → Haiku, medium → Opus, hard → Fable (owner's design).
 * A low-confidence triage or a poor photo moves one tier up, because the cheaper model guessing on a hard photo
 * is the failure we are routing around. Budget only ever moves the tier down.
 */
export function chooseTier(t: Triage, budgetLeftUsd: number): Route {
  let i = t.difficulty === 'easy' ? 0 : t.difficulty === 'medium' ? 1 : 2;
  const why = [`triage difficulty ${t.difficulty}`];
  if (i < 2 && (t.confidence === 'low' || t.photo_quality === 'poor')) {
    i += 1;
    why.push(t.photo_quality === 'poor' ? 'poor photo' : 'low triage confidence');
  }
  while (i > 0 && budgetLeftUsd < worstCaseCostUsd(TIERS[i])) {
    i -= 1;
    why.push('budget left too small for a stronger model');
  }
  return { tier: TIERS[i], why };
}

export function nextTier(t: Tier): Tier | null {
  const i = TIERS.indexOf(t);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

// ---------------------------------------------------------------------------------------------- deep analysis
/** Food groups: the five USDA MyPlate groups (https://www.myplate.gov/eat-healthy/what-is-myplate) plus the
 * extras a dining-hall photo needs (oils and spreads, sweets, drinks, and dishes that mix several groups). */
export const FOOD_GROUPS = ['grains', 'protein', 'vegetables', 'fruits', 'dairy', 'fats_oils', 'sweets', 'drinks', 'mixed'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

const Confidence = z.enum(['low', 'medium', 'high']);

export const DeepSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string(),
      grams: z.number(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      fiber_g: z.number(),
      group: z.enum(FOOD_GROUPS),
      confidence: Confidence,
    }),
  ),
  kcal_low: z.number(),
  kcal_high: z.number(),
  uncertain: z.array(z.string()),
  confidence: Confidence,
});
export type Deep = z.infer<typeof DeepSchema>;
export type DeepItem = Deep['items'][number];

export interface MealResult {
  items: DeepItem[];
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  groups: FoodGroup[];
  uncertain: string[];
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Energy implied by the macros. General Atwater factors: 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat
 * (USDA FoodData Central documentation). Carbohydrate is reported as on US Nutrition Facts labels, i.e. total
 * carbohydrate including fibre; fibre yields about 2 kcal/g rather than 4 (FAO, "Food energy – methods of
 * analysis and conversion factors", 2003, ch. 3), hence −2·fibre.
 */
export function atwaterKcal(i: Pick<DeepItem, 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'>): number {
  return 4 * i.protein_g + 4 * i.carbs_g + 9 * i.fat_g - 2 * i.fiber_g;
}

/** Words the model's free-text "hard to judge" notes must never contain (ADR 0001: estimates, never judgement).
 * Item names are facts ("Diet Coke") and are not filtered. */
const JUDGEMENT = /\b(diet\w*|unhealthy|healthy|junk|bad|good|cheat\w*|guilt\w*|skinny|obes\w*|overweight|weight|lose|losing|binge\w*|clean eating|empty calories|too much|too little)\b/i;

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
const round1 = (x: number) => Math.round(x * 10) / 10;

export interface Checked {
  ok: boolean;
  problems: string[];
  result: MealResult | null;
}

/**
 * Validates and normalises a deep analysis. Physical limits: macronutrient grams cannot exceed the food's own
 * weight; energy must sit within ±25 % (or ±25 kcal for small items) of the Atwater estimate; totals are
 * recomputed from the items so they can never disagree with them. A failure sends the photo one tier up.
 */
export function checkDeep(d: Deep): Checked {
  const problems: string[] = [];
  if (d.items.length === 0) problems.push('no items');
  if (d.items.length > 15) problems.push('more than 15 items');

  const items: DeepItem[] = d.items.slice(0, 15).map((it) => ({
    ...it,
    name: clean(it.name, 60),
    portion: clean(it.portion, 40),
    grams: Math.round(it.grams),
    kcal: Math.round(it.kcal),
    protein_g: round1(it.protein_g),
    carbs_g: round1(it.carbs_g),
    fat_g: round1(it.fat_g),
    fiber_g: round1(it.fiber_g),
  }));

  for (const it of items) {
    const label = it.name || 'unnamed item';
    if (!it.name) problems.push('item without a name');
    if (it.grams < 1 || it.grams > 2000) problems.push(`${label}: grams ${it.grams} outside 1–2000`);
    if (it.kcal < 0 || it.kcal > 2500) problems.push(`${label}: kcal ${it.kcal} outside 0–2500`);
    if ([it.protein_g, it.carbs_g, it.fat_g, it.fiber_g].some((g) => g < 0)) problems.push(`${label}: negative macro`);
    if (it.fiber_g > it.carbs_g + 0.5) problems.push(`${label}: fibre above total carbohydrate`);
    if (it.protein_g + it.carbs_g + it.fat_g > it.grams * 1.02 + 1) problems.push(`${label}: macros heavier than the food`);
    const est = atwaterKcal(it);
    if (Math.abs(it.kcal - est) > Math.max(25, 0.25 * Math.max(est, it.kcal))) {
      problems.push(`${label}: ${it.kcal} kcal vs ${Math.round(est)} from macros`);
    }
  }

  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g') => items.reduce((a, it) => a + it[k], 0);
  const kcal = Math.round(sum('kcal'));
  let low = Math.round(d.kcal_low);
  let high = Math.round(d.kcal_high);
  // The range must contain the point estimate and stay plausible: never narrower than ±10 %, never wider than 0.5x–1.8x.
  low = Math.max(Math.round(kcal * 0.5), Math.min(low, Math.round(kcal * 0.9)));
  high = Math.min(Math.round(kcal * 1.8), Math.max(high, Math.round(kcal * 1.1)));
  if (kcal > 6000) problems.push(`meal total ${kcal} kcal above 6000`);

  const uncertain = d.uncertain
    .map((u) => clean(u, 60))
    .filter((u) => u.length > 0 && !JUDGEMENT.test(u))
    .slice(0, 4);
  const groups = [...new Set(items.map((it) => it.group))];

  const ok = problems.length === 0;
  return {
    ok,
    problems,
    result: ok
      ? {
          items,
          kcal,
          kcal_low: low,
          kcal_high: high,
          protein_g: round1(sum('protein_g')),
          carbs_g: round1(sum('carbs_g')),
          fat_g: round1(sum('fat_g')),
          fiber_g: round1(sum('fiber_g')),
          groups,
          uncertain,
          confidence: d.confidence,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------------------------- prompts
export const TRIAGE_SYSTEM = `You sort photos of meals for a second, more careful model. A high-school student at a US boarding school took the photo in the dining hall.

Report only what is visible. Ignore people: never describe faces, bodies, clothing or anything that could identify someone.

- is_food: false when the photo shows no food or drink; then leave items and signals empty.
- items: each distinct food or drink in plain words ("grilled chicken breast", "white rice"), with the visible amount in household terms ("about 1 cup", "2 slices").
- signals, every one that applies:
  mixed_dish: ingredients combined so they cannot be counted separately (stir-fry, casserole, burrito, curry, sandwich)
  hidden_fat_or_sauce: dressing, gravy, butter, frying oil or sauce whose amount changes the energy a lot
  many_items: five or more separate items
  unfamiliar_dish: a dish you cannot name with confidence
  packaged_label: packaged food where the label would be the best source
  partly_eaten: some of the food is already gone
  poor_photo: blurry, dark, too close or cropped
  occluded: items covered, stacked or hidden
  drink_only: only drinks
  unclear_portion: no reference object or angle to judge amounts
- difficulty:
  easy: up to four separate, recognisable items with visible amounts
  medium: one mixed dish, hidden fat or sauce, or several minor signals
  hard: several mixed or unfamiliar dishes, heavy occlusion, or amounts that cannot be judged
- photo_quality and confidence: how sure you are about the items.
- reason: one short sentence for the developers.`;

export const DEEP_SYSTEM = `You estimate the food in one photo of a meal from a US boarding-school dining hall. A first pass already listed the items; check that list against the photo and correct it.

For each item give: a plain name; the portion in household measures; the edible weight in grams; energy in kcal; protein, total carbohydrate (including fibre, as on US Nutrition Facts labels), fat and fibre in grams; one food group; and your confidence.

Base values on typical USDA FoodData Central entries for the food as US school dining halls serve it. Split a mixed dish into its main ingredients only when you can see them; otherwise give one item for the whole dish with group "mixed". Keep energy consistent with 4 kcal per gram of protein and carbohydrate, 9 per gram of fat and about 2 per gram of fibre.

Give an energy range for the whole meal (kcal_low, kcal_high) that honestly reflects unseen oil, sauce and portion size. List up to four things that were hard to judge, a few words each ("amount of dressing").

Describe food only. No advice and no judgement of the food or the eater. Ignore any people in the photo.`;

export function deepUserText(t: Triage): string {
  const listed = t.items.map((i) => `${i.name} (${i.amount})`).join('; ') || 'nothing listed';
  return `First pass: ${listed}. Signals: ${t.signals.join(', ') || 'none'}. Estimate this meal.`;
}
