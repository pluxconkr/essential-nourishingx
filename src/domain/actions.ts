/**
 * Actions: reviewed templates selected by clause, max 3, always behaviours available in this dining hall,
 * no numeric targets (spec §7). Templates live in assets/data/school.json so another school changes
 * the hall's behaviours without touching code (spec §20).
 */
import type { Clause, School, StateWord } from './types';

export const MAX_ACTIONS = 3;

export function actionsFor(clause: Clause, school: School): string[] {
  return (school.actionsByClause[clause] ?? []).slice(0, MAX_ACTIONS);
}

/** When hysteresis holds a worse word than today's clause, actions follow the word the student sees. */
export function actionsForState(state: StateWord, school: School): string[] {
  const clause: Clause = state === 'attention' ? 'B1' : state === 'watch' ? 'C1' : state === 'stable' ? 'D' : 'A';
  return actionsFor(clause, school);
}
