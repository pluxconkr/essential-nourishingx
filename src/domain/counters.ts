/**
 * The six build counters (spec "Build counters"). These six numbers are the technical argument;
 * any of them going up needs a reason that survives the weekly review.
 */
export const COUNTERS = {
  externalApis: 0,
  /** Client-side keys the phone ships. Phase 1 is local-only. */
  authKeys: 0,
  /** The reminder is a local notification; the weekly batch is a script, not a deployed function. */
  serverFunctions: 0,
  /** scripts/weekly-batch.ts, when built. */
  aiCallSites: 1,
  ruleLinesMax: 60,
  studentScreens: 3,
} as const;
