/**
 * Hevy ↔ FITBITRACK sync (Train section only).
 *
 * Hevy's public API (https://api.hevyapp.com, header `api-key`, requires Hevy Pro) is called
 * through the FITBITRACK backend so the user's API key is stored encrypted server-side and
 * never lives in the browser. Endpoints used:
 *   GET  /v1/user/info                       connection test
 *   GET  /v1/workouts?page&pageSize          initial import
 *   GET  /v1/workouts/events?since&page      incremental sync (updated / deleted)
 *   GET  /v1/exercise_templates?page         map exercise names ↔ template ids
 *   POST /v1/workouts                        export a FITBITRACK workout to Hevy
 */
import { api } from '../auth/session';
import type { Equipment, ExerciseDef, Muscle, Workout, WorkoutExercise } from '../workouts/types';
import { detectPRs, uid } from '../workouts/calc';
import { fmtISO } from '../calc/stats';

/* ---------------- Hevy shapes (subset) ---------------- */
export interface HevySet {
  index?: number;
  type?: 'normal' | 'warmup' | 'dropset' | 'failure';
  weight_kg: number | null;
  reps: number | null;
  duration_seconds?: number | null;
  rpe?: number | null;
}
export interface HevyExercise {
  index?: number;
  title: string;
  exercise_template_id: string;
  notes?: string | null;
  sets: HevySet[];
}
export interface HevyWorkout {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  updated_at?: string;
  exercises: HevyExercise[];
}
export interface HevyTemplate {
  id: string;
  title: string;
  type?: string;
  primary_muscle_group?: string;
  equipment?: string;
}
export type HevyEvent = { type: 'updated'; workout: HevyWorkout } | { type: 'deleted'; id: string; deleted_at?: string };

export interface HevyState {
  connected: boolean;
  username?: string;
  lastSync?: string;
  autoExport: boolean;
  /** hevy workout id → local workout id */
  imported: Record<string, string>;
  /** local workout id → hevy workout id */
  exported: Record<string, string>;
}

export const EMPTY_HEVY: HevyState = { connected: false, autoExport: true, imported: {}, exported: {} };

/* ---------------- client (via FITBITRACK backend) ---------------- */
export const hevyClient = {
  connect: (apiKey: string) => api<{ username: string }>('/api/hevy/connect', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  disconnect: () => api('/api/hevy/disconnect', { method: 'POST' }),
  async allWorkouts(): Promise<HevyWorkout[]> {
    const out: HevyWorkout[] = [];
    for (let page = 1; page < 200; page++) {
      const r = await api<{ page: number; page_count: number; workouts: HevyWorkout[] }>(`/api/hevy/v1/workouts?page=${page}&pageSize=10`);
      out.push(...r.workouts);
      if (page >= r.page_count) break;
    }
    return out;
  },
  async eventsSince(since: string): Promise<HevyEvent[]> {
    const out: HevyEvent[] = [];
    for (let page = 1; page < 200; page++) {
      const r = await api<{ page: number; page_count: number; events: HevyEvent[] }>(`/api/hevy/v1/workouts/events?since=${encodeURIComponent(since)}&page=${page}&pageSize=10`);
      out.push(...r.events);
      if (page >= r.page_count) break;
    }
    return out;
  },
  async templates(): Promise<HevyTemplate[]> {
    const out: HevyTemplate[] = [];
    for (let page = 1; page < 100; page++) {
      const r = await api<{ page: number; page_count: number; exercise_templates: HevyTemplate[] }>(`/api/hevy/v1/exercise_templates?page=${page}&pageSize=100`);
      out.push(...r.exercise_templates);
      if (page >= r.page_count) break;
    }
    return out;
  },
  createWorkout: (body: unknown) => api<{ workout: HevyWorkout[] | HevyWorkout }>('/api/hevy/v1/workouts', { method: 'POST', body: JSON.stringify(body) }),
};

/* ---------------- mapping ---------------- */

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const EQUIP_FROM_HEVY: Record<string, Equipment> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  none: 'bodyweight',
  bodyweight: 'bodyweight',
  'smith machine': 'smith',
};

/** "Bench Press (Barbell)" → equipment from the parenthesis, if present. */
function equipmentFromTitle(title: string): Equipment {
  const m = title.match(/\(([^)]+)\)/);
  return (m && EQUIP_FROM_HEVY[m[1].toLowerCase()]) || 'other';
}

const MUSCLE_FROM_HEVY: Record<string, Muscle> = {
  chest: 'chest',
  lats: 'back',
  upper_back: 'back',
  lower_back: 'back',
  traps: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'glutes',
  abductors: 'glutes',
  adductors: 'legs',
  abdominals: 'core',
  calves: 'calves',
  forearms: 'forearms',
};

/** Find the FITBITRACK exercise for a Hevy title, or describe a custom one to create. */
export function matchExercise(title: string, defs: ExerciseDef[]): { id: string } | { create: Omit<ExerciseDef, 'id' | 'custom'> } {
  const n = norm(title);
  const eq = equipmentFromTitle(title);
  const exact = defs.find((d) => norm(d.name) === n && (eq === 'other' || d.equipment === eq)) ?? defs.find((d) => norm(d.name) === n);
  if (exact) return { id: exact.id };
  return { create: { name: title, muscle: 'core', equipment: eq, restSec: 90 } };
}

export function hevyToWorkout(h: HevyWorkout, resolve: (title: string) => string, history: Workout[]): Workout {
  const start = new Date(h.start_time);
  const end = new Date(h.end_time);
  const exercises: WorkoutExercise[] = h.exercises.map((e) => ({
    id: uid(),
    exerciseId: resolve(e.title),
    notes: e.notes ?? undefined,
    restSec: 90,
    sets: e.sets
      .filter((s) => s.type !== 'warmup')
      .map((s) => ({ id: uid(), weight: s.weight_kg ?? 0, reps: s.reps ?? (s.duration_seconds ?? null), completed: true, completedAt: h.end_time })),
  }));
  const prior = history.filter((w) => w.startedAt < h.start_time);
  return {
    id: `hevy-${h.id}`,
    name: h.title || 'Hevy workout',
    date: fmtISO(start),
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationSec: Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)),
    exercises,
    notes: h.description ?? undefined,
    prs: detectPRs(prior, exercises),
    source: 'hevy',
    hevyId: h.id,
  };
}

/** FITBITRACK workout → POST /v1/workouts body. Exercises Hevy doesn't know are skipped and reported. */
export function workoutToHevy(w: Workout, defs: Map<string, ExerciseDef>, templates: HevyTemplate[]) {
  const byName = new Map(templates.map((t) => [norm(t.title), t]));
  const skipped: string[] = [];
  const exercises = w.exercises.flatMap((e) => {
    const def = defs.get(e.exerciseId);
    const t = def ? byName.get(norm(def.name)) : undefined;
    if (!t) {
      skipped.push(def?.name ?? e.exerciseId);
      return [];
    }
    return [{ exercise_template_id: t.id, notes: e.notes ?? null, sets: e.sets.map((s) => ({ type: 'normal', weight_kg: s.weight, reps: s.reps })) }];
  });
  return {
    body: { workout: { title: w.name, description: w.notes ?? null, start_time: w.startedAt, end_time: w.endedAt, is_private: false, exercises } },
    skipped,
  };
}
