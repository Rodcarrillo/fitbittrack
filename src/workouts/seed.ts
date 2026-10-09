/**
 * Starter routines + sample training history.
 * History is generated ONLY for the sample dataset, and lines up with the sample Fitbit
 * strength sessions (same day, start time and duration) so Fitbit enrichment is visible.
 * Real users start with routines and an empty history.
 */
import type { HealthDataset } from '../domain/types';
import type { Routine, Workout, WorkoutData, WorkoutExercise } from './types';
import { EXERCISE_LIBRARY } from './library';
import { detectPRs, intensityStars, matchFitbit } from './calc';

const R = (id: string, name: string, items: [string, number][], notes?: string): Routine => ({
  id,
  name,
  notes,
  updatedAt: new Date(0).toISOString(),
  items: items.map(([exerciseId, sets]) => ({ exerciseId, sets, restSec: EXERCISE_LIBRARY.find((e) => e.id === exerciseId)?.restSec ?? 90 })),
});

export const STARTER_ROUTINES: Routine[] = [
  R('upper', 'Upper Body', [['bench-press', 3], ['barbell-row', 3], ['db-shoulder-press', 3], ['lat-pulldown', 3], ['triceps-pushdown', 3]]),
  R('legs', 'Leg Day', [['squat', 4], ['rdl', 3], ['leg-press', 3], ['leg-curl', 3], ['standing-calf', 3]], 'Brace hard on squats. Full depth on leg press.'),
  R('push', 'Push', [['bench-press', 4], ['incline-db-press', 3], ['ohp', 3], ['lateral-raise', 3], ['triceps-pushdown', 3]]),
  R('pull', 'Pull', [['barbell-row', 4], ['lat-pulldown', 3], ['seated-row', 3], ['face-pull', 3], ['db-curl', 3], ['hammer-curl', 2]]),
  R('lower', 'Lower Body', [['front-squat', 3], ['rdl', 3], ['bulgarian-split', 3], ['leg-extension', 3], ['seated-calf', 3]]),
  R('full', 'Full Body', [['squat', 3], ['bench-press', 3], ['barbell-row', 3], ['ohp', 2], ['hanging-leg-raise', 3]]),
  R('chest-tri', 'Chest & Triceps', [['bench-press', 4], ['incline-bench', 3], ['chest-fly-cable', 3], ['close-grip-bench', 3], ['overhead-ext', 3]]),
];

/** The default weekly rotation used to suggest "today's workout". */
export const ROTATION = ['upper', 'legs', 'push', 'pull'];

/** Working weight at the start of the sample history (kg) and progress gain by the end. */
const START_KG: Record<string, [number, number, number]> = {
  // [start kg, gain fraction, rounding step]
  'bench-press': [62.5, 0.12, 2.5],
  'barbell-row': [55, 0.12, 2.5],
  'db-shoulder-press': [20, 0.12, 2],
  'lat-pulldown': [55, 0.1, 2.5],
  'triceps-pushdown': [25, 0.15, 2.5],
  squat: [92.5, 0.12, 2.5],
  rdl: [80, 0.12, 2.5],
  'leg-press': [160, 0.15, 5],
  'leg-curl': [40, 0.12, 2.5],
  'standing-calf': [60, 0.12, 5],
  'incline-db-press': [22, 0.12, 2],
  ohp: [40, 0.1, 2.5],
  'lateral-raise': [9, 0.15, 1],
  'seated-row': [55, 0.1, 2.5],
  'face-pull': [20, 0.15, 2.5],
  'db-curl': [12, 0.15, 1],
  'hammer-curl': [14, 0.12, 1],
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function seedData(ds: HealthDataset | null): WorkoutData {
  const base: WorkoutData = { version: 1, routines: STARTER_ROUTINES, history: [], customExercises: [], exercisePrefs: {}, seeded: true };
  if (!ds?.source.isSample) return base;

  const r = rng(42);
  const sessions = ds.exercises.filter((e) => e.kind === 'strength' && e.date < ds.today && e.date >= ds.days[Math.max(0, ds.days.length - 84)].date);
  const history: Workout[] = [];
  const routines = new Map(STARTER_ROUTINES.map((x) => [x.id, x]));

  sessions.forEach((fs, idx) => {
    const progress = idx / Math.max(1, sessions.length - 1);
    const routine = routines.get(ROTATION[idx % ROTATION.length])!;
    const start = new Date(fs.start).getTime();
    const durationSec = fs.durationMin * 60 + Math.round(r() * 240);
    const totalSets = routine.items.reduce((a, it) => a + it.sets, 0);
    let k = 0;
    const exercises: WorkoutExercise[] = routine.items.map((it, ei) => {
      const [kg0, gain, step] = START_KG[it.exerciseId] ?? [20, 0.1, 2.5];
      const target = kg0 * (1 + gain * progress + (r() - 0.5) * 0.03);
      const top = Math.max(step, Math.round(target / step) * step);
      const repsBase = 8 + Math.floor(r() * 3);
      return {
        id: `${fs.id}-e${ei}`,
        exerciseId: it.exerciseId,
        restSec: it.restSec,
        sets: Array.from({ length: it.sets }, (_, si) => {
          k++;
          const drop = si === it.sets - 1 && r() < 0.35 ? step : 0;
          return {
            id: `${fs.id}-e${ei}-s${si}`,
            weight: top - drop,
            reps: Math.max(5, repsBase - Math.floor(si * (0.6 + r() * 0.8)) + (drop ? 2 : 0)),
            completed: true,
            completedAt: new Date(start + (k / totalSets) * durationSec * 1000).toISOString(),
            restSec: it.restSec + Math.round((r() - 0.5) * 30),
          };
        }),
      };
    });
    const w: Workout = {
      id: `w-${fs.date}`,
      name: routine.name,
      routineId: routine.id,
      date: fs.date,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + durationSec * 1000).toISOString(),
      durationSec,
      exercises,
      prs: [],
    };
    w.prs = detectPRs(history, exercises);
    w.intensity = intensityStars(history, w, matchFitbit(ds, w)?.avgHr);
    history.push(w);
  });

  return { ...base, history };
}
