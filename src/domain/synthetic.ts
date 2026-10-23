/**
 * The synthetic cohort (plan "generate(seed = 2027)"): 60 students × 30 days from a fixed seed, so the staff dashboard
 * has something to show before a pilot. Every row is stored with cohort = 'synthetic' and labelled on the dashboard;
 * nothing here is a real student.
 *
 * Shape from the plan: athletes 35 %, breakfast-skippers 30 %, new boarders 25 %; 60 % check in 5–7 days a week, the
 * rest 4–5 so their windows stay describable, and two sparse students 2–3 so "Not enough data" is visible; exam week
 * on days 15–19 (energy −0.4, focus −0.5, skipping +12 points); the season starts on day 8; three students drift to
 * Watch and one to Needs attention (their last seven days follow the demo weeks of the same name).
 * Not in the plan, so chosen here: new boarders feel a little less full and energetic for their first ten days, and
 * 40 % of students photograph about half of the main meals they eat. Meal photos use only the USDA anchor foods in
 * docs/sources.md (per 100 g, FoodData Central SR Legacy), so every synthetic estimate is built from cited values.
 */
import { SCENARIO_WEEKS } from './demo.ts';
import { addDays, weekday } from './time.ts';
import type { Confidence, Meal, MealItem, MealRecord, Rating, Skipped, Training } from './types.ts';

export const SYNTHETIC = { seed: 2027, students: 60, days: 30, examDays: [15, 19], seasonStartDay: 8 } as const;

export interface SyntheticCheckin {
  userId: string;
  day: string;
  fullness: Rating;
  energy: Rating;
  focus: Rating;
  training: Training;
  skipped: Skipped;
}

export interface SyntheticMeal {
  userId: string;
  day: string;
  meal: Meal;
  items: MealItem[];
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  groups: string[];
  difficulty: MealRecord['difficulty'];
  tier: MealRecord['tier'];
  confidence: Confidence;
}

export interface SyntheticProfile {
  athlete: boolean;
  skipper: boolean;
  newBoarder: boolean;
  /** Check-in days per week: 5–7 compliant, 4–5 the rest, 2–3 sparse. */
  daysPerWeek: number;
  drift: 'none' | 'watch' | 'attention';
  photographer: boolean;
}

/** mulberry32: a small, well-known seeded PRNG; the same seed always gives the same cohort. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic ids are recognisable: all zeros but the student number. */
const syntheticId = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;

// USDA FoodData Central SR Legacy, per 100 g: kcal, protein, carbohydrate, fat, fibre (docs/sources.md).
const FOOD = {
  apple: { name: 'Apple', fdc: [52, 0.26, 13.8, 0.17, 2.4], group: 'fruits' },
  banana: { name: 'Banana', fdc: [89, 1.09, 22.8, 0.33, 2.6], group: 'fruits' },
  broccoli: { name: 'Steamed broccoli', fdc: [35, 2.38, 7.18, 0.41, 3.3], group: 'vegetables' },
  sweetPotato: { name: 'Baked sweet potato', fdc: [90, 2.01, 20.7, 0.15, 3.3], group: 'vegetables' },
  potato: { name: 'Baked potato', fdc: [93, 2.5, 21.2, 0.13, 2.2], group: 'vegetables' },
  rice: { name: 'White rice', fdc: [130, 2.69, 28.2, 0.28, 0.4], group: 'grains' },
  couscous: { name: 'Couscous', fdc: [112, 3.79, 23.2, 0.16, 1.4], group: 'grains' },
  pasta: { name: 'Pasta', fdc: [158, 5.8, 30.9, 0.93, 1.8], group: 'grains' },
  chicken: { name: 'Roast chicken breast', fdc: [165, 31, 0, 3.57, 0], group: 'protein' },
  eggWhite: { name: 'Scrambled egg whites', fdc: [52, 10.9, 0.73, 0.17, 0], group: 'protein' },
  oil: { name: 'Cooking oil', fdc: [884, 0, 0, 100, 0], group: 'fats_oils' },
} as const;
type Food = keyof typeof FOOD;

/** Typical dining-hall plates of those foods, in grams. */
const PLATES: Record<Exclude<Meal, 'snack'>, [Food, number][][]> = {
  breakfast: [
    [['eggWhite', 100], ['potato', 120], ['oil', 8], ['banana', 118]],
    [['banana', 118], ['apple', 180]],
    [['eggWhite', 130], ['apple', 150]],
  ],
  lunch: [
    [['chicken', 120], ['rice', 180], ['broccoli', 90], ['oil', 6]],
    [['pasta', 200], ['broccoli', 80]],
    [['couscous', 160], ['chicken', 90], ['apple', 150]],
  ],
  dinner: [
    [['chicken', 140], ['sweetPotato', 180], ['broccoli', 100], ['oil', 8]],
    [['pasta', 250], ['chicken', 80]],
    [['rice', 200], ['broccoli', 120], ['eggWhite', 60], ['oil', 10]],
  ],
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const clampRating = (x: number): Rating => Math.min(5, Math.max(1, Math.round(x))) as Rating;

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function shuffled(rand: () => number, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Normal noise (Box–Muller) with the given spread. */
function noise(rand: () => number, sd: number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()) * sd;
}

function profiles(seed: number = SYNTHETIC.seed): SyntheticProfile[] {
  const rand = prng(seed);
  const n = SYNTHETIC.students;
  const take = (share: number) => new Set(shuffled(rand, n).slice(0, Math.round(share * n)));
  const athletes = take(0.35);
  const skippers = take(0.3);
  const boarders = take(0.25);
  const photographers = take(0.4);
  const order = shuffled(rand, n);
  const sparse = new Set(order.slice(0, 2));
  const compliant = new Set(order.slice(2, 2 + Math.round(0.6 * n)));
  // Drifters must have describable windows: compliant athletes (the watch and attention weeks are training weeks).
  const drifters = order.filter((i) => compliant.has(i) && athletes.has(i)).slice(0, 4);
  return Array.from({ length: n }, (_, i) => ({
    athlete: athletes.has(i),
    skipper: skippers.has(i),
    newBoarder: boarders.has(i),
    daysPerWeek: sparse.has(i) ? 2 + Math.floor(rand() * 2) : compliant.has(i) ? 5 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 2),
    drift: drifters[3] === i ? 'attention' : drifters.slice(0, 3).includes(i) ? 'watch' : 'none',
    photographer: photographers.has(i),
  }));
}

function training(rand: () => number, p: SyntheticProfile, day: number, wd: number): Training {
  if (!p.athlete) return rand() < 0.5 ? 'none' : rand() < 0.6 ? 'light' : 'moderate';
  const inSeason = day >= SYNTHETIC.seasonStartDay;
  if (wd === 1 || wd === 3 || wd === 5) return inSeason ? 'heavy' : 'moderate';
  if (wd === 2 || wd === 4) return inSeason ? 'moderate' : 'light';
  return wd === 6 ? 'light' : 'none';
}

function plate(rand: () => number, meal: Exclude<Meal, 'snack'>, scale: number): Omit<SyntheticMeal, 'userId' | 'day' | 'meal'> {
  const items: MealItem[] = pick(rand, PLATES[meal]).map(([food, grams]) => {
    const f = FOOD[food];
    const g = Math.round(grams * scale * (0.85 + rand() * 0.3));
    const [kcal, p, c, fat, fiber] = f.fdc.map((v) => (v * g) / 100);
    return { name: f.name, portion: `about ${g} g`, grams: g, kcal: Math.round(kcal), protein_g: r1(p), carbs_g: r1(c), fat_g: r1(fat), fiber_g: r1(fiber), group: f.group, confidence: 'medium' };
  });
  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g') => items.reduce((a, it) => a + it[k], 0);
  const kcal = Math.round(sum('kcal'));
  const roll = rand();
  // The router's own mix on real photos: easy → Haiku, medium and hard → Fable (docs/ai-router.md).
  const difficulty = roll < 0.45 ? 'easy' : roll < 0.85 ? 'medium' : 'hard';
  return {
    items,
    kcal,
    kcal_low: Math.round(kcal * 0.8),
    kcal_high: Math.round(kcal * 1.25),
    protein_g: r1(sum('protein_g')),
    carbs_g: r1(sum('carbs_g')),
    fat_g: r1(sum('fat_g')),
    fiber_g: r1(sum('fiber_g')),
    groups: [...new Set(items.map((it) => it.group))],
    difficulty,
    tier: difficulty === 'easy' ? 'haiku' : 'fable',
    confidence: difficulty === 'hard' ? 'low' : 'medium',
  };
}

/** The whole cohort for the 30 days ending on `today` (the school's local date). Deterministic for a seed. */
export function generate(today: string, seed: number = SYNTHETIC.seed): { checkins: SyntheticCheckin[]; meals: SyntheticMeal[]; profiles: SyntheticProfile[] } {
  const ps = profiles(seed);
  const rand = prng(seed + 1);
  const checkins: SyntheticCheckin[] = [];
  const meals: SyntheticMeal[] = [];
  const [examFrom, examTo] = SYNTHETIC.examDays;

  ps.forEach((p, i) => {
    const userId = syntheticId(i);
    const base = { fullness: 3.5 + rand() * 0.8, energy: 3.4 + rand() * 0.8, focus: 3.3 + rand() * 0.8 };
    // A fixed weekly pattern, so every rolling 7-day window holds exactly daysPerWeek check-ins.
    const offDays = new Set(shuffled(rand, 7).slice(0, 7 - p.daysPerWeek));
    for (let day = 1; day <= SYNTHETIC.days; day++) {
      const date = addDays(today, day - SYNTHETIC.days);
      const wd = weekday(date);
      const driftDay = p.drift !== 'none' ? day - (SYNTHETIC.days - 7) : 0; // 1..7 in the last week
      if (driftDay < 1 && offDays.has(wd)) continue;

      let c: SyntheticCheckin;
      if (driftDay >= 1) {
        const d = SCENARIO_WEEKS[p.drift as 'watch' | 'attention'][driftDay - 1];
        if (!d.has) continue;
        c = { userId, day: date, fullness: d.full, energy: d.energy, focus: d.focus, training: d.train, skipped: d.skip };
      } else {
        const exam = day >= examFrom && day <= examTo;
        const skipP = (p.skipper ? 0.35 : 0.05) + (exam ? 0.12 : 0);
        const skipped: Skipped = rand() < skipP ? (p.skipper || rand() < 0.6 ? 'breakfast' : pick(rand, ['lunch', 'dinner'] as const)) : 'none';
        const settling = p.newBoarder && day <= 10;
        const skip = skipped !== 'none';
        c = {
          userId,
          day: date,
          fullness: clampRating(base.fullness + noise(rand, 0.45) - (settling ? 0.3 : 0) - (skip ? 0.5 : 0)),
          energy: clampRating(base.energy + noise(rand, 0.45) - (exam ? 0.4 : 0) - (settling ? 0.2 : 0) - (skip ? 0.3 : 0)),
          focus: clampRating(base.focus + noise(rand, 0.45) - (exam ? 0.5 : 0)),
          training: training(rand, p, day, wd),
          skipped,
        };
      }
      checkins.push(c);

      if (!p.photographer) continue;
      for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
        if (c.skipped === meal || rand() >= 0.5) continue;
        meals.push({ userId, day: date, meal, ...plate(rand, meal, p.athlete ? 1.25 : 1) });
      }
    }
  });
  return { checkins, meals, profiles: ps };
}
