/**
 * Domain types. Plain JSON-serialisable data; no React / Expo imports here.
 * The stored record is exactly the spec's document: five values and a date (spec §6).
 */

export type Rating = 1 | 2 | 3 | 4 | 5;
export type Training = 'none' | 'light' | 'moderate' | 'heavy';
export type Skipped = 'none' | 'breakfast' | 'lunch' | 'dinner';

/** All a student ever sees: three words plus the honest fourth. */
export type StateWord = 'stable' | 'watch' | 'attention' | 'nodata';

/** Rule clauses, in evaluation order (spec §7). */
export type Clause = 'A' | 'B1' | 'B2' | 'B3' | 'C1' | 'C2' | 'C3' | 'C4' | 'D';

export interface Checkin {
  /** Local calendar day, YYYY-MM-DD. One record per day; a second save overwrites. */
  date: string;
  fullness: Rating;
  energy: Rating;
  focus: Rating;
  training: Training;
  skipped: Skipped;
  savedAt: string;
  /** Seconds from opening the Check-in screen to Save; kept on the phone only. */
  durationS: number | null;
  /** Set on records loaded by a demo scenario; never exported, never synced. */
  isDemo?: true;
}

export const RATINGS: readonly Rating[] = [1, 2, 3, 4, 5];
export const TRAININGS: readonly Training[] = ['none', 'light', 'moderate', 'heavy'];
export const SKIPPEDS: readonly Skipped[] = ['none', 'breakfast', 'lunch', 'dinner'];

/** Derived inputs over the trailing 7 days (spec §7). */
export interface Derived {
  n: number;
  skipped: number;
  heavyDays: number;
  lowEnergyDays: number;
  lowFocusDays: number;
  fullDelta: number;
  energyMean: number;
  focusMean: number;
  fullMean: number;
}

export type EvidenceCategory = 'skipped' | 'training' | 'fullness' | 'energy' | 'focus';

export interface Evidence {
  category: EvidenceCategory;
  /** Integer day count where the category has one. */
  count: number;
  direction?: 'down' | 'steady' | 'up';
}

export interface DayState {
  date: string;
  hasCheckin: boolean;
  raw: StateWord;
  clause: Clause;
  /** The word the student sees after hysteresis. */
  shown: StateWord;
  /** true when the shown word is being held at a worse state than raw. */
  held: boolean;
}

export interface Balance {
  date: string;
  /** Displayed word (after hysteresis). */
  state: StateWord;
  raw: StateWord;
  clause: Clause;
  held: boolean;
  derived: Derived;
  window: (Checkin | null)[];
  evidence: Evidence[];
  actions: string[];
  /** Consecutive displayed 'attention' days ending today. */
  attentionStreak: number;
}

export type DemoScenario = 'live' | 'stable' | 'watch' | 'attention' | 'sparse';

export interface Prefs {
  consentedAt: string | null;
  reminderHour: number;
  reminderMinute: number;
  notificationsEnabled: boolean;
  demo: DemoScenario;
}

export interface MenuItem {
  item: string;
  station: string;
  tags: string[];
}

export interface MenuDay {
  breakfast: MenuItem[];
  lunch: MenuItem[];
  dinner: MenuItem[];
}

export interface School {
  name: string;
  healthCenter: { phone: string; phoneDisplay: string; hours: string; walkIn: string };
  dining: { breakfast: string; lunch: string; dinner: string };
  /** Reviewed action templates, by clause; ≤ 3 each; behaviours available in this hall; no numbers. */
  actionsByClause: Record<Clause, string[]>;
}
