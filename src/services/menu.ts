/**
 * The hand-maintained menu table (spec §6 menus). Dining Services enters days on the staff dashboard
 * (Supabase menu_days, cached on the phone by sync); without them the weekday / weekend template bundled with
 * the app is used and the Home footnote says so honestly.
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

/** The weekday and weekend templates (and any dated days) bundled with the app. */
export const bundledDays: Readonly<Record<string, MenuDay>> = menu.days;

/** The template a date falls back to. */
export function templateKey(dateKey: string): 'weekday' | 'weekend' {
  const wd = weekday(dateKey);
  return wd === 0 || wd === 6 ? 'weekend' : 'weekday';
}

export const itemCount = (d: MenuDay) => d.breakfast.length + d.lunch.length + d.dinner.length;

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

/** `entered` holds the menu days Dining Services entered on the dashboard; they win over the bundled table. */
export function menuForToday(dateKey: string, hour: number, entered: Record<string, MenuDay> = {}): TodayMenu | null {
  const template = templateKey(dateKey);
  const dated = entered[dateKey] ?? bundledDays[dateKey];
  const day = dated ?? entered[template] ?? bundledDays[template];
  if (!day) return null;
  const meal = mealFor(hour);
  return {
    meal,
    items: day[meal],
    totalItems: itemCount(day),
    source: dated ? 'today' : 'template',
  };
}
