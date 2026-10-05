/**
 * THE rule engine (spec §7). ~40 lines of fixed thresholds; the only thing that decides a state word.
 * Shared by the phone, the weekly batch and the dashboard's rule tester — a second implementation is a build failure.
 * Thresholds are reasoned, not clinically validated; provenance in docs/thresholds.md.
 */
import { addDays } from './time';
import type { Checkin, Clause, Derived, StateWord } from './types';

export const TH = {
  minCheckins: 4,
  b1_skipped: 5, b1_heavy: 3,
  b2_lowEnergy: 5, b2_fullDelta: -1.0,
  b3_skipped: 3, b3_heavy: 4, b3_fullDelta: -0.5, b3_energyMean: 2.2,
  c1_skipped: 3, c1_heavy: 4,
  c2_lowEnergy: 3, c2_skipped: 2,
  c3_fullDelta: -1.0, c3_heavy: 2,
  c4_lowFocus: 4, c4_skipped: 2,
} as const;

/** Seven slots, oldest first, ending on `endDate`; null where there is no check-in. */
export function windowFor(checkins: readonly Checkin[], endDate: string): (Checkin | null)[] {
  const byDate = new Map(checkins.map((c) => [c.date, c] as const));
  const out: (Checkin | null)[] = [];
  for (let i = 6; i >= 0; i--) out.push(byDate.get(addDays(endDate, -i)) ?? null);
  return out;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Derived inputs over the trailing 7 days. fullDelta compares the last 3 present check-ins with up to 4 earlier present ones (prototype semantics). */
export function derive(window: readonly (Checkin | null)[]): Derived {
  const e = window.filter((d): d is Checkin => d !== null);
  const fulls = e.map((d) => d.fullness);
  const last3 = fulls.slice(-3);
  const prior4 = fulls.slice(0, Math.max(0, fulls.length - 3)).slice(-4);
  return {
    n: e.length,
    skipped: e.filter((d) => d.skipped !== 'none').length,
    heavyDays: e.filter((d) => d.training === 'heavy').length,
    lowEnergyDays: e.filter((d) => d.energy <= 2).length,
    lowFocusDays: e.filter((d) => d.focus <= 2).length,
    fullDelta: last3.length && prior4.length ? round2(mean(last3) - mean(prior4)) : 0,
    energyMean: round2(mean(e.map((d) => d.energy))),
    focusMean: round2(mean(e.map((d) => d.focus))),
    fullMean: round2(mean(fulls)),
  };
}

/** First matching clause wins — order is part of the spec. */
export function evaluateRules(i: Derived): { state: StateWord; clause: Clause } {
  if (i.n < TH.minCheckins) return { state: 'nodata', clause: 'A' };
  if (i.skipped >= TH.b1_skipped && i.heavyDays >= TH.b1_heavy) return { state: 'attention', clause: 'B1' };
  if (i.lowEnergyDays >= TH.b2_lowEnergy && i.fullDelta <= TH.b2_fullDelta) return { state: 'attention', clause: 'B2' };
  if (i.skipped >= TH.b3_skipped && i.heavyDays >= TH.b3_heavy && i.fullDelta <= TH.b3_fullDelta && i.energyMean <= TH.b3_energyMean) return { state: 'attention', clause: 'B3' };
  if (i.skipped >= TH.c1_skipped && i.heavyDays >= TH.c1_heavy && i.fullDelta < 0) return { state: 'watch', clause: 'C1' };
  if (i.lowEnergyDays >= TH.c2_lowEnergy && i.skipped >= TH.c2_skipped) return { state: 'watch', clause: 'C2' };
  if (i.fullDelta <= TH.c3_fullDelta && i.heavyDays >= TH.c3_heavy) return { state: 'watch', clause: 'C3' };
  if (i.lowFocusDays >= TH.c4_lowFocus && i.skipped >= TH.c4_skipped) return { state: 'watch', clause: 'C4' };
  return { state: 'stable', clause: 'D' };
}

/** Severity order for hysteresis; nodata sits outside it. */
export const SEVERITY: Record<Exclude<StateWord, 'nodata'>, number> = { stable: 0, watch: 1, attention: 2 };
