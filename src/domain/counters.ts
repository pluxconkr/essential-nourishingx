/**
 * The six build counters (spec "Build counters"). These six numbers are the technical argument;
 * any of them going up needs a reason that survives the weekly review. FIRST_BUILD is the plan's local-only build;
 * COUNTERS is the build after ADR 0001 (Supabase + AI meal photos), checked against the code by
 * __tests__/counters.test.ts and shown with its reasons on /staff/scope.
 */
export const FIRST_BUILD = { externalApis: 0, authKeys: 0, serverFunctions: 0, aiCallSites: 1, ruleLinesMax: 60, studentScreens: 3 } as const;

export const COUNTERS = {
  /** Supabase (database, auth, functions) and the Claude API, which only Supabase functions call. */
  externalApis: 2,
  /** The Supabase publishable key: public by design and limited by RLS. The phone ships no other key. */
  authKeys: 1,
  /** analyze-meal, delete-me and weekly-report under supabase/functions. */
  serverFunctions: 3,
  /** triage, deep and writeProse in supabase/functions/_shared/claude.ts, the only file that imports the SDK. */
  aiCallSites: 3,
  ruleLinesMax: 60,
  /** The three tabs; the meal photo opens as a sheet from Home. */
  studentScreens: 3,
} as const;
