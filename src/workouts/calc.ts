import type { Exercise as FitbitExercise, HealthDataset, ISODate } from '../domain/types';
import type { ExerciseDef, Muscle, PRHit, Routine, Workout, WorkoutExercise, WorkoutSet } from './types';
import { addDays, fmtISO, mean, toDate } from '../calc/stats';

/* ---------------- basics ---------------- */

export const done = (s: WorkoutSet) => s.completed && s.reps != null && s.reps > 0;
export const setVolume = (s: WorkoutSet) => (done(s) ? (s.weight ?? 0) * (s.reps ?? 0) : 0);
/** Epley estimated 1-rep max. */
export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

export const exVolume = (e: WorkoutExercise) => e.sets.reduce((a, s) => a + setVolume(s), 0);
export const workoutVolume = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((a, e) => a + exVolume(e), 0);
export const workoutSets = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((a, e) => a + e.sets.filter(done).length, 0);
export const workoutReps = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((a, e) => a + e.sets.filter(done).reduce((b, s) => b + (s.reps ?? 0), 0), 0);

export const fmtKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(/\.0$/, ''));
export const fmtVolume = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;

export const fmtClockDuration = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export const fmtShortDuration = (sec: number) => {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------------- exercise history & records ---------------- */

export interface ExerciseSession {
  workout: Workout;
  entry: WorkoutExercise;
  sets: WorkoutSet[];
}

/** Sessions that include this exercise, newest first. */
export function exerciseSessions(history: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const w = history[i];
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      const sets = e.sets.filter(done);
      if (sets.length) out.push({ workout: w, entry: e, sets });
    }
  }
  return out;
}

export interface Records {
  weight: { weight: number; reps: number; date: ISODate } | null;
  e1rm: { value: number; weight: number; reps: number; date: ISODate } | null;
  volume: { value: number; weight: number; reps: number; date: ISODate } | null; // best single set
  reps: { reps: number; weight: number; date: ISODate } | null;
  sessionVolume: { value: number; date: ISODate } | null;
}

export function records(history: Workout[], exerciseId: string): Records {
  const r: Records = { weight: null, e1rm: null, volume: null, reps: null, sessionVolume: null };
  for (const s of exerciseSessions(history, exerciseId)) {
    const date = s.workout.date;
    let sv = 0;
    for (const set of s.sets) {
      const w = set.weight ?? 0;
      const reps = set.reps ?? 0;
      sv += w * reps;
      if (!r.weight || w > r.weight.weight || (w === r.weight.weight && reps > r.weight.reps)) r.weight = { weight: w, reps, date };
      const est = e1rm(w, reps);
      if (!r.e1rm || est > r.e1rm.value) r.e1rm = { value: est, weight: w, reps, date };
      if (!r.volume || w * reps > r.volume.value) r.volume = { value: w * reps, weight: w, reps, date };
      if (!r.reps || reps > r.reps.reps) r.reps = { reps, weight: w, date };
    }
    if (!r.sessionVolume || sv > r.sessionVolume.value) r.sessionVolume = { value: sv, date };
  }
  return r;
}

/** Previous session's completed sets for smart pre-filling. */
export function previousSets(history: Workout[], exerciseId: string): WorkoutSet[] {
  return exerciseSessions(history, exerciseId)[0]?.sets ?? [];
}

/** Does completing this set beat the stored records? Used for live PR badges and the summary. */
export function setBeatsRecords(rec: Records, set: WorkoutSet): PRHit['kind'][] {
  if (!done(set)) return [];
  const w = set.weight ?? 0;
  const r = set.reps ?? 0;
  const out: PRHit['kind'][] = [];
  if (!rec.weight) return w > 0 ? ['weight'] : [];
  if (w > rec.weight.weight) out.push('weight');
  if (w > 0 && rec.e1rm && e1rm(w, r) > rec.e1rm.value + 0.01) out.push('e1rm');
  if (w > 0 && rec.volume && w * r > rec.volume.value) out.push('volume');
  if (rec.reps && r > rec.reps.reps) out.push('reps');
  return out;
}

/** PRs set in a finished workout, compared with everything before it (one hit per kind per exercise). */
export function detectPRs(history: Workout[], exercises: WorkoutExercise[]): PRHit[] {
  const hits: PRHit[] = [];
  const seen = new Set<string>();
  for (const e of exercises) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    const rec = records(history, e.exerciseId);
    if (!rec.weight) continue; // first time doing it: a baseline, not a PR
    const best: Partial<Record<PRHit['kind'], PRHit>> = {};
    for (const s of e.sets.filter(done)) {
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      for (const k of setBeatsRecords(rec, s)) {
        const value = k === 'weight' ? w : k === 'e1rm' ? e1rm(w, r) : k === 'volume' ? w * r : r;
        if (!best[k] || value > best[k]!.value) best[k] = { exerciseId: e.exerciseId, kind: k, value, weight: w, reps: r };
      }
    }
    hits.push(...(Object.values(best) as PRHit[]));
  }
  return hits;
}

export const PR_LABEL: Record<PRHit['kind'], string> = {
  weight: 'Heaviest weight',
  e1rm: 'Best est. 1RM',
  volume: 'Best set volume',
  reps: 'Most reps',
};

/* ---------------- calendar stats ---------------- */

export const weekStart = (d: ISODate) => {
  const wd = (toDate(d).getDay() + 6) % 7; // Monday = 0
  return addDays(d, -wd);
};

export interface PeriodStats {
  workouts: number;
  durationSec: number;
  volume: number;
  sets: number;
  reps: number;
}

export function periodStats(history: Workout[], from: ISODate, to: ISODate): PeriodStats {
  const ws = history.filter((w) => w.date >= from && w.date <= to);
  return {
    workouts: ws.length,
    durationSec: ws.reduce((a, w) => a + w.durationSec, 0),
    volume: ws.reduce((a, w) => a + workoutVolume(w), 0),
    sets: ws.reduce((a, w) => a + workoutSets(w), 0),
    reps: ws.reduce((a, w) => a + workoutReps(w), 0),
  };
}

/** Consecutive weeks (ending this week, or last week if this one is still empty) with ≥1 workout. */
export function weekStreak(history: Workout[], today: ISODate): number {
  const weeks = new Set(history.map((w) => weekStart(w.date)));
  let cur = weekStart(today);
  if (!weeks.has(cur)) cur = addDays(cur, -7);
  let n = 0;
  while (weeks.has(cur)) {
    n++;
    cur = addDays(cur, -7);
  }
  return n;
}

export function weeklySeries(history: Workout[], today: ISODate, weeks: number) {
  const out: { week: ISODate; workouts: number; volume: number; durationSec: number }[] = [];
  let start = addDays(weekStart(today), -7 * (weeks - 1));
  for (let i = 0; i < weeks; i++) {
    const s = periodStats(history, start, addDays(start, 6));
    out.push({ week: start, workouts: s.workouts, volume: s.volume, durationSec: s.durationSec });
    start = addDays(start, 7);
  }
  return out;
}

export type MuscleGroup = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
const GROUP: Record<Muscle, MuscleGroup> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  shoulders: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  core: 'Core',
};

/** Share of completed sets per muscle group. */
export function muscleDistribution(history: Workout[], defs: Map<string, ExerciseDef>, from: ISODate) {
  const counts = new Map<MuscleGroup, number>();
  let total = 0;
  for (const w of history) {
    if (w.date < from) continue;
    for (const e of w.exercises) {
      const def = defs.get(e.exerciseId);
      if (!def) continue;
      const n = e.sets.filter(done).length;
      const g = GROUP[def.muscle];
      counts.set(g, (counts.get(g) ?? 0) + n);
      total += n;
    }
  }
  return [...counts.entries()].map(([group, n]) => ({ group, sets: n, pct: total ? (n / total) * 100 : 0 })).sort((a, b) => b.sets - a.sets);
}

/* ---------------- routines ---------------- */

export function estimateRoutineMin(r: Routine) {
  const sec = r.items.reduce((a, it) => a + it.sets * (40 + it.restSec) + 90, 0);
  return Math.round(sec / 60);
}

/** Next routine in rotation after the most recent logged one. */
export function suggestRoutine(routines: Routine[], history: Workout[], rotation: string[]): Routine | null {
  if (!routines.length) return null;
  const order = rotation.map((id) => routines.find((r) => r.id === id)).filter(Boolean) as Routine[];
  const list = order.length ? order : routines;
  const last = [...history].reverse().find((w) => w.routineId && list.some((r) => r.id === w.routineId));
  if (!last) return list[0];
  const i = list.findIndex((r) => r.id === last.routineId);
  return list[(i + 1) % list.length];
}

/* ---------------- intensity ---------------- */

export function intensityStars(history: Workout[], w: { exercises: WorkoutExercise[]; routineId?: string; durationSec: number }, avgHr?: number | null): number {
  const comparable = history.filter((h) => (w.routineId ? h.routineId === w.routineId : true)).slice(-8);
  const base = mean(comparable.map(workoutVolume));
  const vol = workoutVolume(w);
  let stars = 3;
  if (Number.isFinite(base) && base > 0) {
    const ratio = vol / base;
    if (ratio > 1.2) stars += 2;
    else if (ratio > 1.05) stars += 1;
    else if (ratio < 0.75) stars -= 2;
    else if (ratio < 0.9) stars -= 1;
  }
  if (avgHr != null) stars += avgHr >= 145 ? 1 : avgHr < 115 ? -1 : 0;
  return Math.max(1, Math.min(5, stars));
}

/* ---------------- Fitbit enrichment ---------------- */

export interface FitbitMatch {
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  azm: number | null;
  name: string;
}

/**
 * Pair a FITBITRACK workout with the Fitbit session recorded at the same time.
 * Fitbit stays the source for heart rate / calories; sets & weights stay FITBITRACK's.
 */
export function matchFitbit(ds: HealthDataset | null, w: Pick<Workout, 'date' | 'startedAt' | 'durationSec'>): FitbitMatch | null {
  if (!ds || !ds.availability.exercise) return null;
  const start = new Date(w.startedAt).getTime();
  const end = start + w.durationSec * 1000;
  let best: FitbitExercise | null = null;
  let bestGap = Infinity;
  for (const e of ds.exercises) {
    if (e.date !== w.date || e.kind === 'walk' || e.kind === 'yoga') continue;
    const s = new Date(e.start).getTime();
    const eEnd = s + e.durationMin * 60000;
    const overlap = Math.min(end, eEnd) - Math.max(start, s);
    const gap = Math.abs(s - start);
    if ((overlap > 0 || gap < 45 * 60000) && gap < bestGap) {
      best = e;
      bestGap = gap;
    }
  }
  if (!best) return null;
  const z = best.zones;
  return {
    name: best.name,
    avgHr: best.avgHr,
    maxHr: best.maxHr,
    calories: best.calories,
    azm: z ? z.z3 + 2 * (z.z4 + z.z5) + Math.round(z.z2 * 0.5) : null,
  };
}

export const todayISO = () => fmtISO(new Date());
