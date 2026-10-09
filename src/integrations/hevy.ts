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
  return { create: { name: title, muscle: guessMuscle(title), equipment: eq, restSec: 90 } };
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


/* ------------------------------------------------------------------ */
/*  Free path (no Hevy Pro): Hevy → Settings → Export & Import Data →  */
/*  Export Workouts gives a CSV. Parse it into HevyWorkout objects.    */
/* ------------------------------------------------------------------ */

const MUSCLE_WORDS: [RegExp, Muscle][] = [
  [/calf|calves/i, 'calves'],
  [/wrist|forearm|grip/i, 'forearms'],
  [/curl(?!.*leg)|bicep|hammer|preacher/i, 'biceps'],
  [/tricep|pushdown|skull|dip|overhead.*extension|kickback(?!.*glute)/i, 'triceps'],
  [/glute|hip thrust|abduct|bridge|kickback/i, 'glutes'],
  [/squat|leg|lunge|split|adduct|step up|deadlift|hyperextension|back extension/i, 'legs'],
  [/bench|chest|fly|dragonfly|push ?up|pec/i, 'chest'],
  [/row|pulldown|pull ?up|chin|lat |lats|shrug|face pull|pullover/i, 'back'],
  [/shoulder|lateral raise|press|reverse fly|rear delt|upright/i, 'shoulders'],
  [/crunch|plank|ab |abs|knee raise|leg raise|dead bug|rotation|twist|sit ?up/i, 'core'],
];
export function guessMuscle(title: string): Muscle {
  for (const [re, m] of MUSCLE_WORDS) if (re.test(title)) return m;
  return 'core';
}

/** RFC-4180-ish CSV parser (quotes, escaped quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "28 Sep 2026, 17:14" (Hevy export, local time) → ISO. Falls back to Date parsing for other formats. */
function hevyDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m && MONTHS[m[2].toLowerCase()] != null) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1], +m[4], +m[5]).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const numOrNull = (v: string | undefined) => {
  if (v == null || v.trim() === '') return null;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Hevy CSV export → workouts (ascending). Throws a readable Error if the file isn't a Hevy export. */
export function parseHevyCsv(text: string): HevyWorkout[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file is empty.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const need = ['title', 'start_time', 'end_time', 'exercise_title'];
  if (need.some((n) => col(n) < 0)) throw new Error("This doesn't look like a Hevy export (Settings → Export & Import Data → Export Workouts).");
  const get = (r: string[], name: string) => (col(name) >= 0 ? r[col(name)] ?? '' : '');

  const byKey = new Map<string, HevyWorkout>();
  for (const r of rows.slice(1)) {
    const start = hevyDate(get(r, 'start_time'));
    const end = hevyDate(get(r, 'end_time')) ?? start;
    const exTitle = get(r, 'exercise_title').trim();
    if (!start || !end || !exTitle) continue;
    const title = get(r, 'title').trim() || 'Hevy workout';
    const key = `${title}|${start}`;
    let w = byKey.get(key);
    if (!w) {
      // stable id from title + start time, so importing the same file twice doesn't duplicate
      let h = 0;
      for (const ch of key) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
      w = { id: `csv-${(h >>> 0).toString(36)}-${start.slice(0, 16)}`, title, description: get(r, 'description') || null, start_time: start, end_time: end, exercises: [] };
      byKey.set(key, w);
    }
    let ex = w.exercises[w.exercises.length - 1];
    if (!ex || ex.title !== exTitle) {
      ex = { index: w.exercises.length, title: exTitle, exercise_template_id: '', notes: get(r, 'exercise_notes') || null, sets: [] };
      w.exercises.push(ex);
    }
    ex.sets.push({
      index: ex.sets.length,
      type: (get(r, 'set_type') || 'normal') as HevySet['type'],
      weight_kg: numOrNull(get(r, 'weight_kg')),
      reps: numOrNull(get(r, 'reps')),
      duration_seconds: numOrNull(get(r, 'duration_seconds')),
      rpe: numOrNull(get(r, 'rpe')),
    } as HevySet);
  }
  const out = [...byKey.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!out.length) throw new Error('No workouts found in this file.');
  return out;
}
