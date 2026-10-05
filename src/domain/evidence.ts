/**
 * Evidence: exactly four lines, chosen by the clause that fired (spec §7: "the clause that fired names its own inputs").
 * Categories come from the spec's list — meals skipped · heavy training days · direction of fullness · low-energy or
 * low-focus day count. Coverage ("n of 7 days") is shown on the state card itself.
 * Output is structured data with integer counts only; the sentences are reviewed templates in src/i18n/en.ts.
 */
import type { Clause, Derived, Evidence, EvidenceCategory } from './types';

/** The inputs each clause tests, in the order the clause reads them. */
export const CLAUSE_INPUTS: Record<Clause, EvidenceCategory[]> = {
  A: [],
  B1: ['skipped', 'training'],
  B2: ['energy', 'fullness'],
  B3: ['skipped', 'training', 'fullness', 'energy'],
  C1: ['skipped', 'training', 'fullness'],
  C2: ['energy', 'skipped'],
  C3: ['fullness', 'training'],
  C4: ['focus', 'skipped'],
  D: ['skipped', 'training', 'fullness', 'energy'],
};

const FILL_ORDER: EvidenceCategory[] = ['skipped', 'training', 'fullness', 'energy'];

export function evidenceCategories(clause: Clause): EvidenceCategory[] {
  const out: EvidenceCategory[] = [...CLAUSE_INPUTS[clause]];
  const hasLowDays = out.includes('energy') || out.includes('focus');
  for (const c of FILL_ORDER) {
    if (out.length >= 4) break;
    if (out.includes(c)) continue;
    // energy and focus share the "low-day count" slot; never show both
    if (c === 'energy' && hasLowDays) continue;
    out.push(c);
  }
  return out.slice(0, 4);
}

function one(category: EvidenceCategory, d: Derived): Evidence {
  switch (category) {
    case 'skipped':
      return { category, count: d.skipped };
    case 'training':
      return { category, count: d.heavyDays };
    case 'fullness':
      return { category, count: 0, direction: d.fullDelta < 0 ? 'down' : d.fullDelta > 0 ? 'up' : 'steady' };
    case 'energy':
      return { category, count: d.lowEnergyDays };
    case 'focus':
      return { category, count: d.lowFocusDays };
  }
}

/** Four lines for any clause except A (nodata), which shows a single callout and no evidence. */
export function buildEvidence(d: Derived, clause: Clause): Evidence[] {
  if (clause === 'A') return [];
  return evidenceCategories(clause).map((c) => one(c, d));
}
