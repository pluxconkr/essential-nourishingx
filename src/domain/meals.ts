/**
 * Meal-photo inputs for the rules (clauses C5 and C6; thresholds and sources in docs/thresholds.md).
 * Photos are optional, so only what was photographed counts: a day or a meal without a photo is not evidence
 * of anything. Several photos of the same meal add up to one meal; snack photos are not meals.
 */
import { addDays } from './time.ts';
import type { Checkin, MealLog } from './types.ts';

/** Photographed meals inside the 7-day window that ends on endDate. */
export function mealsIn(meals: readonly MealLog[], endDate: string): MealLog[] {
  const from = addDays(endDate, -6);
  return meals.filter((m) => m.date >= from && m.date <= endDate);
}

export interface MealThresholds {
  lowProtein_g: number;
  minMealsPerDay: number;
  lowCarb_g: number;
}

/** Main meals (one per date and slot) with their photographed protein and carbohydrate added up. */
function mainMeals(meals: readonly MealLog[]): { date: string; protein_g: number; carbs_g: number }[] {
  const bySlot = new Map<string, { date: string; protein_g: number; carbs_g: number }>();
  for (const m of meals) {
    if (m.meal === 'snack') continue;
    const key = `${m.date}|${m.meal}`;
    const prev = bySlot.get(key) ?? { date: m.date, protein_g: 0, carbs_g: 0 };
    bySlot.set(key, { date: m.date, protein_g: prev.protein_g + m.protein_g, carbs_g: prev.carbs_g + m.carbs_g });
  }
  return [...bySlot.values()];
}

/** `days` are the window's check-ins (heavy training comes from them); `meals` must already be windowed. */
export function deriveMeals(days: readonly Checkin[], meals: readonly MealLog[], th: MealThresholds) {
  const main = mainMeals(meals);
  const heavy = new Set(days.filter((d) => d.training === 'heavy').map((d) => d.date));
  const heavyDays = new Map<string, { n: number; carbs: number }>();
  for (const m of main) {
    if (!heavy.has(m.date)) continue;
    const d = heavyDays.get(m.date) ?? { n: 0, carbs: 0 };
    heavyDays.set(m.date, { n: d.n + 1, carbs: d.carbs + m.carbs_g });
  }
  const logged = [...heavyDays.values()].filter((d) => d.n >= th.minMealsPerDay);
  return {
    mealsLogged: main.length,
    lowProteinMeals: main.filter((m) => m.protein_g < th.lowProtein_g).length,
    heavyDaysLogged: logged.length,
    heavyDaysLowCarb: logged.filter((d) => d.carbs < th.lowCarb_g).length,
  };
}
