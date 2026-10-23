/**
 * Zero-dependency app store on useSyncExternalStore. Hydration is synchronous from local storage, so the
 * first frame shows real data. Writes go to storage first, then notify. The network is used only after
 * consent, through src/services/cloud.ts (check-in sync, meal photos); the phone works fully without it.
 */
import { useSyncExternalStore } from 'react';

import { checkinRepo, demoBackupRepo, initStorage, mealRepo, menuRepo, prefsRepo, syncQueueRepo, timingRepo, wipeStorage } from '@/data/repos';
import { scenarioCheckins } from '@/domain/demo';
import { addDays, dateKey } from '@/domain/time';
import type { Checkin, DemoScenario, Meal, MealRecord, MenuDay, Prefs, Rating, Skipped, Training } from '@/domain/types';
import { analyzeMeal as analyzeOnServer, connect, deleteCloudAccount, deleteMeal as deleteOnServer, fetchMeals, fetchMenus, uploadCheckins, type AnalyzeResult } from '@/services/cloud';
import { deleteExportFile } from '@/services/export';
import { cancelReminder, scheduleReminder } from '@/services/notifications';

export interface AppState {
  hydrated: boolean;
  prefs: Prefs;
  checkins: Checkin[];
  timing: number[];
  meals: MealRecord[];
  /** Menu days Dining Services entered, by key; empty means the bundled weekly table. */
  menus: Record<string, MenuDay>;
}

type Listener = () => void;

let state: AppState = { hydrated: false, prefs: prefsRepo.get(), checkins: [], timing: [], meals: [], menus: {} };
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
  state = { hydrated: true, prefs: prefsRepo.get(), checkins: checkinRepo.getAll(), timing: timingRepo.getAll(), meals: mealRepo.getAll(), menus: menuRepo.get() };
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

/** Meal photos older than this are not fetched; the rules read 7 days and the 30-day history at most. */
const MEAL_DAYS = 31;
let syncing: Promise<void> | null = null;

export const actions = {
  /** Consent recorded; the one daily reminder is scheduled when enabled. The switch only stays on if it was. */
  async consent(reminderHour: number, reminderMinute: number, notificationsEnabled: boolean): Promise<boolean> {
    const scheduled = notificationsEnabled ? (await scheduleReminder(reminderHour, reminderMinute)) !== null : false;
    const prefs: Prefs = { ...state.prefs, consentedAt: new Date().toISOString(), reminderHour, reminderMinute, notificationsEnabled: scheduled };
    setState({ prefs: prefsRepo.set(prefs) });
    void actions.sync();
    return scheduled || !notificationsEnabled;
  },

  async setReminderTime(hour: number, minute: number): Promise<boolean> {
    const ok = state.prefs.notificationsEnabled ? (await scheduleReminder(hour, minute)) !== null : true;
    const prefs = prefsRepo.set({ ...state.prefs, reminderHour: hour, reminderMinute: minute, notificationsEnabled: state.prefs.notificationsEnabled && ok });
    setState({ prefs });
    return ok;
  },

  async setNotificationsEnabled(enabled: boolean): Promise<boolean> {
    let ok = true;
    if (enabled) ok = (await scheduleReminder(state.prefs.reminderHour, state.prefs.reminderMinute)) !== null;
    else await cancelReminder();
    const prefs = prefsRepo.set({ ...state.prefs, notificationsEnabled: enabled && ok });
    setState({ prefs });
    return ok;
  },

  /** Save today's five answers. A second save the same day overwrites the first. Real check-ins queue for upload. */
  saveCheckin(input: CheckinInput, durationS: number | null, today: string = dateKey()): Checkin {
    const demo = state.prefs.demo !== 'live';
    const record: Checkin = { date: today, ...input, savedAt: new Date().toISOString(), durationS, ...(demo ? { isDemo: true as const } : {}) };
    const checkins = checkinRepo.upsert(record);
    const timing = durationS != null && !demo ? timingRepo.add(durationS) : state.timing;
    setState({ checkins, timing });
    if (!demo) {
      syncQueueRepo.add(today);
      void actions.sync();
    }
    return record;
  },

  /** Uploads queued check-ins, refreshes the student's meal analyses and today's menu. Safe to call any time; never throws. */
  sync(): Promise<void> {
    if (state.prefs.consentedAt === null) return Promise.resolve();
    syncing ??= (async () => {
      try {
        if (!(await connect())) return;
        const queued = new Set(syncQueueRepo.get());
        if (queued.size && state.prefs.demo === 'live') syncQueueRepo.remove(await uploadCheckins(state.checkins.filter((c) => queued.has(c.date))));
        const meals = await fetchMeals(addDays(dateKey(), -MEAL_DAYS));
        if (meals) setState({ meals: mealRepo.replaceAll(meals) });
        const menus = await fetchMenus([dateKey(), 'weekday', 'weekend']);
        if (menus) setState({ menus: menuRepo.replaceAll(menus) });
      } catch {
        /* offline: the queue stays for the next try */
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  },

  /** One meal photo, already resized on the phone. The result is kept as the student's own row. */
  async analyzeMeal(image: string, meal: Meal, day: string = dateKey()): Promise<AnalyzeResult> {
    const result = await analyzeOnServer({ image, mediaType: 'image/jpeg', meal, day });
    if (result.status === 'ok') setState({ meals: mealRepo.add(result.record) });
    return result;
  },

  /** Removes one analysed meal, on the server first so the next sync cannot bring it back. */
  async deleteMeal(id: string): Promise<boolean> {
    if (!(await deleteOnServer(id))) return false;
    setState({ meals: mealRepo.remove(id) });
    return true;
  },

  /** Load a demo week (labelled, never exported or uploaded) or return to live records. */
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

  /**
   * Remove the server account and its rows, then every stored key, the last export file and the reminder.
   * If the server cannot be reached nothing is deleted: wiping the phone first would lose the session needed
   * to delete the server copy later.
   */
  async deleteEverything(): Promise<'done' | 'offline'> {
    if (!(await deleteCloudAccount().catch(() => false))) return 'offline';
    await cancelReminder();
    deleteExportFile();
    wipeStorage();
    setState({ prefs: prefsRepo.get(), checkins: [], timing: [], meals: [], menus: {} });
    return 'done';
  },
};
