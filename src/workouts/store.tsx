import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveWorkout, ExerciseDef, Routine, Workout, WorkoutData, WorkoutExercise, WorkoutSet } from './types';
import { EXERCISE_LIBRARY } from './library';
import { ROTATION, seedData } from './seed';
import { detectPRs, done, intensityStars, matchFitbit, previousSets, uid } from './calc';
import { useApp, haptic } from '../state/store';
import { ApiError } from '../auth/session';
import { scoped } from '../auth/account';
import { useCloudSync } from '../data/cloudSync';
import { EMPTY_HEVY, hevyClient, hevyToWorkout, matchExercise, parseHevyCsv, workoutToHevy, type HevyEvent, type HevyState } from '../integrations/hevy';
import { fmtISO } from '../calc/stats';

/**
 * Workout persistence. A repository interface keeps storage swappable: localStorage here,
 * a server table (per user) in production. Active workouts autosave on every change so an
 * accidental close is fully recoverable.
 */
export interface WorkoutRepository {
  load(): WorkoutData | null;
  save(d: WorkoutData): void;
  loadActive(): ActiveWorkout | null;
  saveActive(a: ActiveWorkout | null): void;
}

// keys are per account (see auth/account.ts → scoped)
const SERVER_MODE = (import.meta as any).env?.VITE_DATA_PROVIDER === 'google';
const KEY = () => scoped('workouts:v1');
const ACTIVE_KEY = () => scoped('active-workout:v1');

export const localRepository: WorkoutRepository = {
  load() {
    try {
      const v = localStorage.getItem(KEY());
      return v ? (JSON.parse(v) as WorkoutData) : null;
    } catch {
      return null;
    }
  },
  save(d) {
    try {
      localStorage.setItem(KEY(), JSON.stringify(d));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  },
  loadActive() {
    try {
      const v = localStorage.getItem(ACTIVE_KEY());
      return v ? (JSON.parse(v) as ActiveWorkout) : null;
    } catch {
      return null;
    }
  },
  saveActive(a) {
    try {
      if (a) localStorage.setItem(ACTIVE_KEY(), JSON.stringify(a));
      else localStorage.removeItem(ACTIVE_KEY());
    } catch {
      /* ignore */
    }
  },
};

export type WorkoutView = 'home' | 'routines' | 'history' | 'exercises' | 'prs' | 'load';
export type WorkoutPage = { kind: 'routine'; id: string | null } | { kind: 'workout'; id: string } | { kind: 'exercise'; id: string } | { kind: 'hevy' };

export interface HevySyncResult {
  imported: number;
  removed: number;
  exported: number;
  skippedExercises: string[];
}

export interface PickerRequest {
  title: string;
  multi: boolean;
  onPick: (ids: string[]) => void;
}

interface Ctx {
  data: WorkoutData | null;
  defs: Map<string, ExerciseDef>;
  allExercises: ExerciseDef[];
  active: ActiveWorkout | null;
  summary: Workout | null;
  view: WorkoutView;
  setView: (v: WorkoutView) => void;
  page: WorkoutPage | null;
  openPage: (p: WorkoutPage | null) => void;
  picker: PickerRequest | null;
  openPicker: (p: PickerRequest | null) => void;
  rotation: string[];
  // active workout
  start: (routineId?: string) => void;
  update: (fn: (a: ActiveWorkout) => ActiveWorkout) => void;
  setValue: (exId: string, setId: string, field: 'weight' | 'reps', v: number | null) => void;
  toggleSet: (exId: string, setId: string) => boolean;
  addSet: (exId: string) => void;
  deleteSet: (exId: string, setId: string) => void;
  addExercises: (ids: string[]) => void;
  removeExercise: (exId: string) => void;
  moveExercise: (exId: string, dir: -1 | 1) => void;
  setExerciseNote: (exId: string, note: string) => void;
  setExerciseRest: (exId: string, sec: number) => void;
  adjustRest: (deltaSec: number) => void;
  skipRest: () => void;
  togglePause: () => void;
  setMinimized: (m: boolean) => void;
  discard: () => void;
  finish: () => Workout | null;
  saveSummary: (notes: string) => void;
  closeSummary: () => void;
  // library
  saveRoutine: (r: Routine) => void;
  deleteRoutine: (id: string) => void;
  deleteWorkout: (id: string) => void;
  createExercise: (d: Omit<ExerciseDef, 'id' | 'custom'>) => string;
  setExercisePref: (id: string, pref: { notes?: string; restSec?: number }) => void;
  elapsedSec: (a: ActiveWorkout, now: number) => number;
  // Hevy
  hevy: HevyState & { connectedAt?: string };
  hevyBusy: boolean;
  hevyError: string | null;
  connectHevy: (apiKey: string) => Promise<boolean>;
  disconnectHevy: () => Promise<void>;
  syncHevy: () => Promise<HevySyncResult | null>;
  /** Free path: import a Hevy CSV export. */
  importHevyCsv: (text: string) => { added: number; updated: number; newExercises: number };
  setHevyAutoExport: (on: boolean) => void;
}

const WCtx = createContext<Ctx | null>(null);

export function elapsedSec(a: ActiveWorkout, now: number) {
  const end = a.pausedAt ?? now;
  return Math.max(0, (end - new Date(a.startedAt).getTime() - a.pausedTotalMs) / 1000);
}

/** Pre-fill a new exercise from the last session (Hevy-style progressive overload). */
function buildExercise(exerciseId: string, sets: number, restSec: number, history: Workout[]): WorkoutExercise {
  const prev = previousSets(history, exerciseId);
  const n = Math.max(1, sets || prev.length || 3);
  return {
    id: uid(),
    exerciseId,
    restSec,
    sets: Array.from({ length: n }, (_, i) => {
      const p = prev[i] ?? prev[prev.length - 1];
      return { id: uid(), weight: p?.weight ?? null, reps: p?.reps ?? null, completed: false };
    }),
  };
}

export function WorkoutProvider({ children, repo = localRepository }: { children: React.ReactNode; repo?: WorkoutRepository }) {
  const { raw, setTab } = useApp();
  const [data, setData] = useState<WorkoutData | null>(() => repo.load());
  const [active, setActive] = useState<ActiveWorkout | null>(() => repo.loadActive());
  const [summary, setSummary] = useState<Workout | null>(null);
  const [view, setView] = useState<WorkoutView>('home');
  const [page, setPage] = useState<WorkoutPage | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const dataRef = useRef(data);
  dataRef.current = data;
  const [hevyBusy, setHevyBusy] = useState(false);
  const [hevyError, setHevyError] = useState<string | null>(null);

  // Seed once the health dataset is known (sample history only for sample data).
  useEffect(() => {
    if (!data && raw) {
      const d = seedData(SERVER_MODE ? null : raw);
      setData(d);
      repo.save(d);
    }
  }, [data, raw, repo]);

  // follow the account across devices when a FITBITRACK server is present
  useCloudSync<WorkoutData>('workouts', data, (v) => {
    dataRef.current = v;
    setData(v);
    repo.save(v);
  });

  const commit = useCallback(
    (fn: (d: WorkoutData) => WorkoutData) =>
      setData((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        repo.save(next);
        return next;
      }),
    [repo],
  );

  const allExercises = useMemo(() => {
    const prefs = data?.exercisePrefs ?? {};
    return [...EXERCISE_LIBRARY, ...(data?.customExercises ?? [])].map((e) => ({ ...e, ...prefs[e.id] }));
  }, [data]);
  const defs = useMemo(() => new Map(allExercises.map((e) => [e.id, e])), [allExercises]);

  const update = useCallback(
    (fn: (a: ActiveWorkout) => ActiveWorkout) => {
      const cur = activeRef.current;
      if (!cur) return;
      const next = fn(cur);
      activeRef.current = next;
      setActive(next);
      repo.saveActive(next); // autosave every change
    },
    [repo],
  );

  const mapEx = (exId: string, f: (e: WorkoutExercise) => WorkoutExercise) => update((a) => ({ ...a, exercises: a.exercises.map((e) => (e.id === exId ? f(e) : e)) }));

  const start = (routineId?: string) => {
    if (activeRef.current) {
      update((a) => ({ ...a, minimized: false }));
      return;
    }
    const history = data?.history ?? [];
    const routine = data?.routines.find((r) => r.id === routineId);
    const a: ActiveWorkout = {
      id: uid(),
      name: routine?.name ?? 'Workout',
      routineId: routine?.id,
      startedAt: new Date().toISOString(),
      pausedAt: null,
      pausedTotalMs: 0,
      exercises: (routine?.items ?? []).map((it) => buildExercise(it.exerciseId, it.sets, defs.get(it.exerciseId)?.restSec ?? it.restSec, history)),
      notes: routine?.notes,
      rest: null,
      minimized: false,
    };
    activeRef.current = a;
    setActive(a);
    repo.saveActive(a);
    setTab('train');
    haptic(15);
  };

  const setValue = (exId: string, setId: string, field: 'weight' | 'reps', v: number | null) =>
    mapEx(exId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, [field]: v } : s)) }));

  const toggleSet = (exId: string, setId: string): boolean => {
    const a = activeRef.current;
    if (!a) return false;
    const ex = a.exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (!ex || !set) return false;
    if (!set.completed && (set.reps == null || set.reps <= 0)) return false; // nothing to log yet
    const now = Date.now();
    const completing = !set.completed;
    update((cur) => {
      // rest actually taken since the previously completed set
      const allDone = cur.exercises.flatMap((e) => e.sets).filter((s) => s.completed && s.completedAt);
      const lastDone = allDone.sort((x, y) => (x.completedAt! < y.completedAt! ? 1 : -1))[0];
      const exercises = cur.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => {
          if (s.id === setId) return completing ? { ...s, completed: true, completedAt: new Date(now).toISOString() } : { ...s, completed: false, completedAt: undefined };
          if (completing && lastDone && s.id === lastDone.id && s.restSec == null) return { ...s, restSec: Math.round((now - new Date(lastDone.completedAt!).getTime()) / 1000) };
          return s;
        }),
      }));
      const isLastOverall = cur.exercises[cur.exercises.length - 1]?.id === exId && ex.sets[ex.sets.length - 1].id === setId;
      const rest = completing && !isLastOverall && ex.restSec > 0 ? { exerciseInstanceId: exId, setId, durationSec: ex.restSec, endsAt: now + ex.restSec * 1000 } : completing ? null : cur.rest;
      return { ...cur, exercises, rest };
    });
    haptic(completing ? 18 : 6);
    return true;
  };

  const addSet = (exId: string) =>
    mapEx(exId, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { id: uid(), weight: last?.weight ?? null, reps: last?.reps ?? null, completed: false }] };
    });

  const deleteSet = (exId: string, setId: string) => mapEx(exId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));

  const addExercises = (ids: string[]) =>
    update((a) => ({ ...a, exercises: [...a.exercises, ...ids.map((id) => buildExercise(id, 0, defs.get(id)?.restSec ?? 90, data?.history ?? []))] }));

  const removeExercise = (exId: string) => update((a) => ({ ...a, exercises: a.exercises.filter((e) => e.id !== exId), rest: a.rest?.exerciseInstanceId === exId ? null : a.rest }));

  const moveExercise = (exId: string, dir: -1 | 1) =>
    update((a) => {
      const i = a.exercises.findIndex((e) => e.id === exId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= a.exercises.length) return a;
      const list = [...a.exercises];
      [list[i], list[j]] = [list[j], list[i]];
      return { ...a, exercises: list };
    });

  const setExercisePref = (id: string, pref: { notes?: string; restSec?: number }) =>
    commit((d) => ({ ...d, exercisePrefs: { ...d.exercisePrefs, [id]: { ...d.exercisePrefs[id], ...pref } } }));

  const setExerciseNote = (exId: string, note: string) => mapEx(exId, (e) => ({ ...e, notes: note }));
  const setExerciseRest = (exId: string, sec: number) => {
    const ex = activeRef.current?.exercises.find((e) => e.id === exId);
    mapEx(exId, (e) => ({ ...e, restSec: sec }));
    if (ex) setExercisePref(ex.exerciseId, { restSec: sec }); // remember as this exercise's default
  };

  const adjustRest = (delta: number) =>
    update((a) => {
      if (!a.rest) return a;
      const endsAt = Math.max(Date.now() + 1000, a.rest.endsAt + delta * 1000);
      return { ...a, rest: { ...a.rest, endsAt, durationSec: Math.max(5, a.rest.durationSec + delta) } };
    });
  const skipRest = () => update((a) => ({ ...a, rest: null }));

  const togglePause = () =>
    update((a) => {
      if (a.pausedAt) {
        const pausedFor = Date.now() - a.pausedAt;
        return { ...a, pausedAt: null, pausedTotalMs: a.pausedTotalMs + pausedFor, rest: a.rest ? { ...a.rest, endsAt: a.rest.endsAt + pausedFor } : null };
      }
      return { ...a, pausedAt: Date.now() };
    });

  const setMinimized = (m: boolean) => update((a) => ({ ...a, minimized: m }));

  const discard = () => {
    activeRef.current = null;
    setActive(null);
    repo.saveActive(null);
  };

  const finish = (): Workout | null => {
    const a = activeRef.current;
    if (!a) return null;
    const history = data?.history ?? [];
    const now = Date.now();
    const durationSec = Math.round(elapsedSec(a, now));
    const exercises = a.exercises.map((e) => ({ ...e, sets: e.sets.filter(done) })).filter((e) => e.sets.length);
    const w: Workout = {
      id: a.id,
      name: a.name.trim() || 'Workout',
      routineId: a.routineId,
      date: fmtISO(new Date(a.startedAt)),
      startedAt: a.startedAt,
      endedAt: new Date(now).toISOString(),
      durationSec,
      exercises,
      notes: a.notes,
      prs: detectPRs(history, exercises),
    };
    w.intensity = intensityStars(history, w, matchFitbit(raw, w)?.avgHr);
    setSummary(w);
    update((cur) => ({ ...cur, rest: null, pausedAt: cur.pausedAt ?? now }));
    return w;
  };

  const saveSummary = (notes: string) => {
    if (!summary) return;
    const w = { ...summary, notes: notes.trim() || undefined };
    commit((d) => ({ ...d, history: [...d.history.filter((h) => h.id !== w.id), w].sort((x, y) => x.startedAt.localeCompare(y.startedAt)) }));
    setSummary(null);
    discard();
    setView('home');
    setPage({ kind: 'workout', id: w.id });
    haptic(25);
    if (dataRef.current?.hevy?.connected && dataRef.current.hevy.autoExport) setTimeout(() => syncHevy(), 50);
  };

  const closeSummary = () => {
    // back to the workout, un-pause
    setSummary(null);
    update((a) => (a.pausedAt ? { ...a, pausedAt: null, pausedTotalMs: a.pausedTotalMs + (Date.now() - a.pausedAt) } : a));
  };

  const saveRoutine = (r: Routine) =>
    commit((d) => {
      const exists = d.routines.some((x) => x.id === r.id);
      const next = { ...r, updatedAt: new Date().toISOString() };
      return { ...d, routines: exists ? d.routines.map((x) => (x.id === r.id ? next : x)) : [...d.routines, next] };
    });
  const deleteRoutine = (id: string) => commit((d) => ({ ...d, routines: d.routines.filter((r) => r.id !== id) }));
  const deleteWorkout = (id: string) => commit((d) => ({ ...d, history: d.history.filter((w) => w.id !== id) }));
  const createExercise = (e: Omit<ExerciseDef, 'id' | 'custom'>) => {
    const id = `custom-${uid()}`;
    commit((d) => ({ ...d, customExercises: [...d.customExercises, { ...e, id, custom: true }] }));
    return id;
  };

  /* ---------------- Hevy sync ---------------- */
  const hevyErr = (e: unknown) =>
    e instanceof ApiError && (e.status === 401 || e.status === 403)
      ? 'Hevy rejected the API key. Check it in Hevy → Settings → Developer (needs Hevy Pro).'
      : e instanceof ApiError && e.status === 429
        ? 'Hevy is rate-limiting requests. Try again in a minute.'
        : e instanceof ApiError && e.status === 502
          ? "The FITBITRACK server couldn't reach Hevy. On a free PythonAnywhere account, api.hevyapp.com has to be added to their allow-list first (see the setup guide)."
          : "Couldn't reach the FITBITRACK server. Hevy sync runs through the backend (see the setup guide).";

  const importHevyCsv = (text: string) => {
    const d0 = dataRef.current;
    if (!d0) throw new Error('Workouts are still loading. Try again in a second.');
    const parsed = parseHevyCsv(text);
    const customs = [...d0.customExercises];
    const known = [...allExercises, ...customs.filter((c) => !allExercises.some((a) => a.id === c.id))];
    let newExercises = 0;
    const resolve = (title: string) => {
      const m = matchExercise(title, known);
      if ('id' in m) return m.id;
      const def = { ...m.create, id: `custom-${uid()}`, custom: true };
      customs.push(def);
      known.push(def);
      newExercises++;
      return def.id;
    };
    // same workout already present (from an earlier import or the API) → replace instead of duplicating
    const sameAs = (w: Workout) => (h: Workout) => h.id === w.id || (h.source === 'hevy' && h.startedAt.slice(0, 16) === w.startedAt.slice(0, 16));
    let history = [...d0.history].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    let added = 0;
    let updated = 0;
    for (const hw of parsed) {
      const w = hevyToWorkout(hw, resolve, history);
      const exists = history.some(sameAs(w));
      history = [...history.filter((h) => !sameAs(w)(h)), w].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      if (exists) updated++;
      else added++;
    }
    const next = { ...d0, history, customExercises: customs };
    dataRef.current = next;
    setData(next);
    repo.save(next);
    return { added, updated, newExercises };
  };

  const syncHevy = async (): Promise<HevySyncResult | null> => {
    const d0 = dataRef.current;
    if (!d0?.hevy?.connected) return null;
    setHevyBusy(true);
    setHevyError(null);
    try {
      const st = d0.hevy;
      const startedAt = new Date().toISOString();
      const events: HevyEvent[] = st.lastSync ? await hevyClient.eventsSince(st.lastSync) : (await hevyClient.allWorkouts()).map((workout) => ({ type: 'updated' as const, workout }));
      let history = [...d0.history];
      const customs = [...d0.customExercises];
      const imported = { ...st.imported };
      const exported = { ...st.exported };
      const ourHevyIds = new Set(Object.values(exported));
      const known = [...allExercises, ...customs.filter((c) => !allExercises.some((a) => a.id === c.id))];
      const resolve = (title: string) => {
        const m = matchExercise(title, known);
        if ('id' in m) return m.id;
        const def = { ...m.create, id: `custom-${uid()}`, custom: true };
        customs.push(def);
        known.push(def);
        return def.id;
      };
      let added = 0;
      let removed = 0;
      for (const ev of events) {
        if (ev.type === 'deleted') {
          const before = history.length;
          history = history.filter((w) => w.hevyId !== ev.id);
          removed += before - history.length;
          delete imported[ev.id];
          continue;
        }
        if (ourHevyIds.has(ev.workout.id)) continue; // a workout we sent to Hevy: don't import it back
        const w = hevyToWorkout(ev.workout, resolve, history);
        history = [...history.filter((h) => h.id !== w.id), w];
        imported[ev.workout.id] = w.id;
        added++;
      }
      history.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

      // export FITBITRACK workouts finished after connecting
      let sent = 0;
      const skipped = new Set<string>();
      if (st.autoExport) {
        const pending = history.filter((w) => w.source !== 'hevy' && !exported[w.id] && st.connectedAt && w.endedAt > st.connectedAt);
        if (pending.length) {
          const templates = await hevyClient.templates();
          for (const w of pending) {
            const { body, skipped: sk } = workoutToHevy(w, defs, templates);
            sk.forEach((x) => skipped.add(x));
            if (!body.workout.exercises.length) continue;
            const res = await hevyClient.createWorkout(body);
            const created = Array.isArray(res.workout) ? res.workout[0] : res.workout;
            if (created?.id) {
              exported[w.id] = created.id;
              sent++;
            }
          }
        }
      }
      const next = { ...d0, history, customExercises: customs, hevy: { ...st, imported, exported, lastSync: startedAt } };
      dataRef.current = next;
      setData(next);
      repo.save(next);
      return { imported: added, removed, exported: sent, skippedExercises: [...skipped] };
    } catch (e) {
      setHevyError(hevyErr(e));
      return null;
    } finally {
      setHevyBusy(false);
    }
  };

  const connectHevy = async (apiKey: string) => {
    setHevyBusy(true);
    setHevyError(null);
    try {
      const r = await hevyClient.connect(apiKey.trim());
      const d0 = dataRef.current!;
      const next = { ...d0, hevy: { ...EMPTY_HEVY, ...(d0.hevy ?? {}), connected: true, username: r.username, connectedAt: new Date().toISOString() } };
      dataRef.current = next;
      setData(next);
      repo.save(next);
      setHevyBusy(false);
      await syncHevy();
      return true;
    } catch (e) {
      setHevyError(hevyErr(e));
      setHevyBusy(false);
      return false;
    }
  };

  const disconnectHevy = async () => {
    await hevyClient.disconnect().catch(() => {});
    commit((d) => ({ ...d, hevy: { ...EMPTY_HEVY } })); // imported workouts stay in history
  };

  const setHevyAutoExport = (on: boolean) => commit((d) => ({ ...d, hevy: { ...EMPTY_HEVY, ...(d.hevy ?? {}), autoExport: on } }));

  const value: Ctx = {
    data,
    defs,
    allExercises,
    active,
    summary,
    view,
    setView: (v) => {
      setView(v);
      setPage(null);
    },
    page,
    openPage: (p) => {
      setPage(p);
      window.scrollTo({ top: 0 });
    },
    picker,
    openPicker: setPicker,
    rotation: ROTATION,
    start,
    update,
    setValue,
    toggleSet,
    addSet,
    deleteSet,
    addExercises,
    removeExercise,
    moveExercise,
    setExerciseNote,
    setExerciseRest,
    adjustRest,
    skipRest,
    togglePause,
    setMinimized,
    discard,
    finish,
    saveSummary,
    closeSummary,
    saveRoutine,
    deleteRoutine,
    deleteWorkout,
    createExercise,
    setExercisePref,
    elapsedSec,
    hevy: data?.hevy ?? EMPTY_HEVY,
    hevyBusy,
    hevyError,
    connectHevy,
    disconnectHevy,
    syncHevy,
    importHevyCsv,
    setHevyAutoExport,
  };
  return <WCtx.Provider value={value}>{children}</WCtx.Provider>;
}

export const useWorkouts = () => {
  const c = useContext(WCtx);
  if (!c) throw new Error('useWorkouts must be used inside WorkoutProvider');
  return c;
};

/** Re-render on an interval (timers). */
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

export type { WorkoutSet };
