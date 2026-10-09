/**
 * Strength-training domain. FITBITRACK owns this data (Fitbit doesn't record sets/reps/weight);
 * Fitbit sessions only enrich it with heart rate, calories and zone minutes.
 */
import type { ISODate } from '../domain/types';

export type Muscle = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'core' | 'calves' | 'forearms';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'smith' | 'other';

export interface ExerciseDef {
  id: string;
  name: string;
  muscle: Muscle;
  equipment: Equipment;
  /** default rest between sets, seconds (user-editable) */
  restSec: number;
  notes?: string;
  custom?: boolean;
}

export interface WorkoutSet {
  id: string;
  weight: number | null; // kg
  reps: number | null;
  completed: boolean;
  completedAt?: string; // ISO timestamp
  /** rest actually taken after this set, seconds */
  restSec?: number;
}

export interface WorkoutExercise {
  id: string; // instance id inside a workout
  exerciseId: string;
  notes?: string;
  restSec: number;
  sets: WorkoutSet[];
}

export interface PRHit {
  exerciseId: string;
  kind: 'weight' | 'e1rm' | 'volume' | 'reps';
  value: number;
  weight: number;
  reps: number;
}

export interface Workout {
  id: string;
  name: string;
  routineId?: string;
  date: ISODate;
  startedAt: string; // ISO
  endedAt: string; // ISO
  durationSec: number;
  exercises: WorkoutExercise[];
  notes?: string;
  prs: PRHit[];
  /** 1–5, from effort signals (volume vs usual, Fitbit HR when present) */
  intensity?: number;
  /** where the workout was logged */
  source?: 'fitbitrack' | 'hevy';
  hevyId?: string;
}

export interface RoutineItem {
  exerciseId: string;
  sets: number;
  restSec: number;
}

export interface Routine {
  id: string;
  name: string;
  notes?: string;
  items: RoutineItem[];
  updatedAt: string;
}

export interface RestTimer {
  exerciseInstanceId: string;
  setId: string;
  durationSec: number;
  endsAt: number; // epoch ms
}

export interface ActiveWorkout {
  id: string;
  name: string;
  routineId?: string;
  startedAt: string;
  /** epoch ms when paused, null when running */
  pausedAt: number | null;
  pausedTotalMs: number;
  exercises: WorkoutExercise[];
  notes?: string;
  rest: RestTimer | null;
  minimized: boolean;
}

export interface WorkoutData {
  version: 1;
  routines: Routine[];
  history: Workout[]; // ascending by startedAt
  customExercises: ExerciseDef[];
  /** per-exercise user overrides (notes, rest) for library exercises */
  exercisePrefs: Record<string, { notes?: string; restSec?: number }>;
  seeded: boolean;
  hevy?: import('../integrations/hevy').HevyState & { connectedAt?: string };
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
  calves: 'Calves',
  forearms: 'Forearms',
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  smith: 'Smith Machine',
  other: 'Other',
};
