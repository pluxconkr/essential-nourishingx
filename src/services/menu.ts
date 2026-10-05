/**
 * The hand-maintained menu table (spec §6 menus). Phase 1 ships a weekday / weekend template bundled with the app;
 * the Home footnote says so honestly. Zero external APIs.
 */
import menuJson from '@/assets/data/menu.json';
import { weekday } from '@/domain/time';
import type { MenuDay, MenuItem } from '@/domain/types';

export type Meal = 'breakfast' | 'lunch' | 'dinner';

interface MenuFile {
  source: string;
  enteredBy: string;
  enteredAt: string;
  days: Record<string, MenuDay>;
}

const menu = menuJson as unknown as MenuFile;

export function mealFor(hour: number): Meal {
  if (hour < 10) return 'breakfast';
  if (hour < 14) return 'lunch';
  return 'dinner';
}

export interface TodayMenu {
  meal: Meal;
  items: MenuItem[];
  totalItems: number;
  /** 'today' when Dining Services entered this date; 'template' for the bundled weekly table. */
  source: 'today' | 'template';
}

export function menuForToday(dateKey: string, hour: number): TodayMenu | null {
  const wd = weekday(dateKey);
  const day = menu.days[dateKey] ?? menu.days[wd === 0 || wd === 6 ? 'weekend' : 'weekday'];
  if (!day) return null;
  const meal = mealFor(hour);
  return {
    meal,
    items: day[meal],
    totalItems: day.breakfast.length + day.lunch.length + day.dinner.length,
    source: menu.days[dateKey] ? 'today' : 'template',
  };
}
