/**
 * Heart rate for a Hevy workout, measured by the Fitbit that was on your wrist.
 * You start the workout only in Hevy; FITBITRACK asks Google Health for the heart-rate
 * samples between the workout's start and end, and derives avg / max / zones / calories.
 * Finished workouts are cached on the device so each one is fetched once.
 */
import { useEffect, useState } from 'react';
import { api } from '../auth/session';
import { scoped } from '../auth/account';
import { SERVER_MODE } from '../data/cloudSync';
import type { HealthDataset, HrZoneMinutes } from '../domain/types';
import { matchFitbit } from './calc';
import type { Workout } from './types';

export interface HrWindow {
  points: number;
  avg?: number;
  max?: number;
  coveredMin?: number;
  zones?: HrZoneMinutes;
  series?: [number, number][];
  error?: string;
}

export interface WorkoutHeart {
  status: 'loading' | 'ok' | 'none' | 'error';
  avg: number | null;
  max: number | null;
  kcal: number | null;
  kcalEstimated: boolean;
  zones: HrZoneMinutes | null;
  series: [number, number][];
  source: 'heart-rate' | 'fitbit-exercise' | null;
  note?: string;
}

const KEY = (id: string) => scoped(`hr:v1:${id}`);
const readCache = (id: string): HrWindow | null => {
  try {
    const v = localStorage.getItem(KEY(id));
    return v ? (JSON.parse(v) as HrWindow) : null;
  } catch {
    return null;
  }
};
const writeCache = (id: string, v: HrWindow) => {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

const inflight = new Map<string, Promise<HrWindow>>();
export function fetchHrWindow(w: Pick<Workout, 'id' | 'startedAt' | 'endedAt'>, maxHr: number): Promise<HrWindow> {
  const cached = readCache(w.id);
  if (cached) return Promise.resolve(cached);
  if (!inflight.has(w.id)) {
    const p = api<HrWindow>(`/api/hr-window?${new URLSearchParams({ start: w.startedAt, end: w.endedAt, maxHr: String(maxHr) })}`)
      .then((r) => {
        // only cache when the workout is well over (Fitbit may still be syncing for a while)
        const old = Date.now() - new Date(w.endedAt).getTime() > 3 * 3600_000;
        if (old && !r.error) writeCache(w.id, r);
        return r;
      })
      .finally(() => inflight.delete(w.id));
    inflight.set(w.id, p);
  }
  return inflight.get(w.id)!;
}

/** Keytel et al. (2005) heart-rate → energy estimate, used when Fitbit has no session of its own. */
export function kcalFromHr(avg: number, minutes: number, ageY: number, weightKg: number) {
  const perMin = (-55.0969 + 0.6309 * avg + 0.1988 * weightKg + 0.2017 * ageY) / 4.184;
  return Math.max(0, Math.round(perMin * minutes));
}

export function useWorkoutHeart(w: Workout | null, ds: HealthDataset | null): WorkoutHeart {
  const empty: WorkoutHeart = { status: 'none', avg: null, max: null, kcal: null, kcalEstimated: false, zones: null, series: [], source: null };
  const [hr, setHr] = useState<HrWindow | null | 'loading' | 'error'>(() => (w ? readCache(w.id) ?? 'loading' : null));
  const maxHr = ds?.profile.maxHr || 190;
  useEffect(() => {
    if (!w || !SERVER_MODE || !ds || ds.source.isSample) return;
    let alive = true;
    const c = readCache(w.id);
    if (c) {
      setHr(c);
      return;
    }
    setHr('loading');
    fetchHrWindow(w, maxHr)
      .then((r) => alive && setHr(r))
      .catch(() => alive && setHr('error'));
    return () => {
      alive = false;
    };
  }, [w?.id, ds?.source.fetchedAt]);

  if (!w || !ds) return empty;
  const fb = matchFitbit(ds, w);
  const minutes = w.durationSec / 60;
  const age = ds.profile.age || 30;
  const weight = ds.profile.weightKg > 0 ? ds.profile.weightKg : 75;

  if (hr && typeof hr === 'object' && hr.points > 0 && hr.avg) {
    const est = kcalFromHr(hr.avg, minutes, age, weight);
    return {
      status: 'ok',
      avg: hr.avg,
      max: hr.max ?? null,
      kcal: fb?.calories ?? est,
      kcalEstimated: fb?.calories == null,
      zones: hr.zones ?? null,
      series: hr.series ?? [],
      source: 'heart-rate',
      note: hr.coveredMin != null && hr.coveredMin < minutes * 0.6 ? `Fitbit recorded ${hr.coveredMin} of ${Math.round(minutes)} min` : undefined,
    };
  }
  if (fb && (fb.avgHr || fb.calories)) {
    return { status: 'ok', avg: fb.avgHr, max: fb.maxHr, kcal: fb.calories, kcalEstimated: false, zones: null, series: [], source: 'fitbit-exercise' };
  }
  if (hr === 'loading') return { ...empty, status: 'loading' };
  if (hr === 'error' || (hr && typeof hr === 'object' && hr.error))
    return { ...empty, status: 'error', note: hr && typeof hr === 'object' && hr.error === 'no_permission' ? 'Reconnect Google Health to allow heart rate' : undefined };
  return empty;
}
