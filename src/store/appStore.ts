/**
 * Zero-dependency app store on useSyncExternalStore. Hydration is synchronous from local storage, so the
 * first frame shows real data. Writes go to storage first, then notify. No network anywhere.
 */
import { useSyncExternalStore } from 'react';

import { checkinRepo, demoBackupRepo, initStorage, prefsRepo, timingRepo, wipeStorage } from '@/data/repos';
import { scenarioCheckins } from '@/domain/demo';
import { dateKey } from '@/domain/time';
import type { Checkin, DemoScenario, Prefs, Rating, Skipped, Training } from '@/domain/types';
import { cancelReminder, scheduleReminder } from '@/services/notifications';

export interface AppState {
  hydrated: boolean;
  prefs: Prefs;
  checkins: Checkin[];
  timing: number[];
}

type Listener = () => void;

let state: AppState = { hydrated: false, prefs: prefsRepo.get(), checkins: [], timing: [] };
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  emit();
}

export function getState(): AppState {
  return state;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function hydrate(): AppState {
  initStorage();
  state = { hydrated: true, prefs: prefsRepo.get(), checkins: checkinRepo.getAll(), timing: timingRepo.getAll() };
  emit();
  return state;
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export interface CheckinInput {
  fullness: Rating;
  energy: Rating;
  focus: Rating;
  training: Training;
  skipped: Skipped;
}

export const actions = {
  /** Consent recorded; the one daily reminder is scheduled when enabled. */
  async consent(reminderHour: number, reminderMinute: number, notificationsEnabled: boolean): Promise<void> {
    const prefs: Prefs = { ...state.prefs, consentedAt: new Date().toISOString(), reminderHour, reminderMinute, notificationsEnabled };
    setState({ prefs: prefsRepo.set(prefs) });
    if (notificationsEnabled) await scheduleReminder(reminderHour, reminderMinute);
  },

  async setReminderTime(hour: number, minute: number): Promise<void> {
    const prefs = prefsRepo.set({ ...state.prefs, reminderHour: hour, reminderMinute: minute });
    setState({ prefs });
    if (prefs.notificationsEnabled) await scheduleReminder(hour, minute);
  },

  async setNotificationsEnabled(enabled: boolean): Promise<boolean> {
    let ok = true;
    if (enabled) ok = (await scheduleReminder(state.prefs.reminderHour, state.prefs.reminderMinute)) !== null;
    else await cancelReminder();
    const prefs = prefsRepo.set({ ...state.prefs, notificationsEnabled: enabled && ok });
    setState({ prefs });
    return ok;
  },

  /** Save today's five answers. A second save the same day overwrites the first. */
  saveCheckin(input: CheckinInput, durationS: number | null, today: string = dateKey()): Checkin {
    const demo = state.prefs.demo !== 'live';
    const record: Checkin = { date: today, ...input, savedAt: new Date().toISOString(), durationS, ...(demo ? { isDemo: true as const } : {}) };
    const checkins = checkinRepo.upsert(record);
    const timing = durationS != null && !demo ? timingRepo.add(durationS) : state.timing;
    setState({ checkins, timing });
    return record;
  },

  /** Load a demo week (labelled, never exported) or return to live records. */
  loadDemo(scenario: DemoScenario, today: string = dateKey()): void {
    const current = state.prefs.demo;
    if (scenario === current) return;
    if (scenario === 'live') {
      const backup = demoBackupRepo.get() ?? [];
      demoBackupRepo.set(null);
      setState({ checkins: checkinRepo.replaceAll(backup), prefs: prefsRepo.set({ ...state.prefs, demo: 'live' }) });
      return;
    }
    if (current === 'live') demoBackupRepo.set(state.checkins);
    setState({ checkins: checkinRepo.replaceAll(scenarioCheckins(scenario, today)), prefs: prefsRepo.set({ ...state.prefs, demo: scenario }) });
  },

  /** Remove every stored key, cancel the reminder, return to the consent screen. */
  async deleteEverything(): Promise<void> {
    await cancelReminder();
    wipeStorage();
    setState({ prefs: prefsRepo.get(), checkins: [], timing: [] });
  },
};
