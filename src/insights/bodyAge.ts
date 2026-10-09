/**
 * Fitbit Age — FITBITRACK's estimate of how old your habits and fitness markers "look",
 * compared with typical values for your age. It starts at your real age and adds or
 * subtracts years per factor. Each factor is capped so no single metric dominates, and
 * factors without enough data are skipped (never treated as zero).
 *
 * This is a motivational estimate, not a medical or biological-age test.
 */
import type { HealthDataset } from '../domain/types';
import type { Workout } from '../workouts/types';
import { addDays, clamp, mean, nonNull, sd } from '../calc/stats';
import { bedtimeMinutes } from '../calc/stats';

export interface AgeFactor {
  key: string;
  label: string;
  /** years added (+) or removed (−) */
  years: number;
  value: string;
  reference: string;
  tip: string;
}

export interface FitbitAge {
  age: number;
  realAge: number;
  delta: number;
  factors: AgeFactor[];
  skipped: string[];
  previous: number | null; // same estimate 90 days ago
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function estimate(ds: HealthDataset, workouts: Workout[], end: string, realAge: number): Omit<FitbitAge, 'previous'> {
  const start = addDays(end, -29);
  const days = ds.days.filter((d) => d.date >= start && d.date <= end);
  const sleeps = ds.sleep.filter((s) => s.date >= start && s.date <= end);
  const ex = ds.exercises.filter((e) => e.date >= start && e.date <= end && e.kind !== 'walk');
  const factors: AgeFactor[] = [];
  const skipped: string[] = [];
  const need = (n: number, arr: unknown[]) => arr.length >= n;

  // Cardio fitness (VO2 max): the strongest single marker of fitness-related aging.
  const vo2 = nonNull(days.map((d) => d.vo2max));
  if (need(7, vo2)) {
    const v = mean(vo2);
    const expected = 47 - 0.32 * (realAge - 25);
    factors.push({
      key: 'vo2',
      label: 'Cardio fitness',
      years: clamp(-(v - expected) * 0.55, -6, 6),
      value: `${v.toFixed(1)} VO₂ max`,
      reference: `typical for your age ≈ ${expected.toFixed(0)}`,
      tip: 'Two zone 2 sessions plus one interval session a week is the fastest way to raise VO₂ max.',
    });
  } else skipped.push('Cardio fitness');

  // Resting heart rate
  const rhr = nonNull(days.map((d) => d.restingHr));
  if (need(10, rhr)) {
    const v = mean(rhr);
    factors.push({
      key: 'rhr',
      label: 'Resting heart rate',
      years: clamp((v - 63) * 0.28, -4, 4),
      value: `${v.toFixed(0)} bpm`,
      reference: 'typical adult ≈ 63 bpm',
      tip: 'Regular aerobic work, good sleep and less alcohol tend to bring resting HR down.',
    });
  } else skipped.push('Resting heart rate');

  // HRV
  const hrv = nonNull(days.map((d) => d.hrv));
  if (need(10, hrv)) {
    const v = mean(hrv);
    const expected = 48 - 0.55 * (realAge - 25);
    factors.push({
      key: 'hrv',
      label: 'Heart rate variability',
      years: clamp(-(v / expected - 1) * 10, -3, 3),
      value: `${v.toFixed(0)} ms`,
      reference: `typical for your age ≈ ${expected.toFixed(0)} ms`,
      tip: 'Consistent sleep, hydration and managing stress are the biggest HRV levers.',
    });
  } else skipped.push('HRV');

  // Sleep duration + consistency
  if (need(10, sleeps)) {
    const avg = mean(sleeps.map((s) => s.minutesAsleep)) / 60;
    const durYears = avg >= 7 && avg <= 9 ? -0.8 : avg >= 6.5 ? 0 : avg >= 6 ? 0.8 : 1.8;
    factors.push({
      key: 'sleep',
      label: 'Sleep duration',
      years: durYears,
      value: `${Math.floor(avg)}h ${String(Math.round((avg % 1) * 60)).padStart(2, '0')}m avg`,
      reference: 'recommended 7–9 h',
      tip: 'Protect a 7–9 hour sleep window; even 30 extra minutes moves this factor.',
    });
    const bedSd = sd(sleeps.map((s) => bedtimeMinutes(s.start)));
    factors.push({
      key: 'consistency',
      label: 'Sleep consistency',
      years: bedSd <= 30 ? -0.6 : bedSd <= 45 ? 0 : bedSd <= 60 ? 0.6 : 1.2,
      value: `bedtime ±${Math.round(bedSd)} min`,
      reference: 'ideal within ±30 min',
      tip: 'Going to bed within the same 30-minute window, weekends included, helps most.',
    });
  } else skipped.push('Sleep');

  // Daily movement
  const steps = nonNull(days.map((d) => d.steps));
  if (need(10, steps)) {
    const v = mean(steps);
    factors.push({
      key: 'steps',
      label: 'Daily steps',
      years: v >= 10000 ? -1.5 : v >= 8000 ? -1 : v >= 6000 ? 0 : v >= 4000 ? 0.8 : 1.6,
      value: `${Math.round(v).toLocaleString('en-US')} / day`,
      reference: '8,000+ linked to lower risk',
      tip: 'A 10-minute walk after meals adds roughly 1,000 steps each time.',
    });
  } else skipped.push('Steps');

  // Weekly exercise minutes
  if (ds.availability.exercise) {
    const weekly = (ex.reduce((a, e) => a + e.durationMin, 0) / 30) * 7;
    factors.push({
      key: 'exercise',
      label: 'Weekly exercise',
      years: weekly >= 300 ? -1.8 : weekly >= 150 ? -1.2 : weekly >= 75 ? 0 : 1.2,
      value: `${Math.round(weekly)} min / week`,
      reference: '150–300 min recommended',
      tip: 'Aim for at least 150 minutes of moderate activity a week.',
    });
  } else skipped.push('Exercise');

  // Strength training (from FITBITRACK workouts)
  const strength = workouts.filter((w) => w.date >= start && w.date <= end).length;
  if (workouts.length) {
    const perWeek = (strength / 30) * 7;
    factors.push({
      key: 'strength',
      label: 'Strength training',
      years: perWeek >= 2 ? -0.8 : perWeek >= 1 ? -0.3 : 0.5,
      value: `${perWeek.toFixed(1)} sessions / week`,
      reference: '2+ per week recommended',
      tip: 'Two full-body strength sessions a week help preserve muscle as you age.',
    });
  }

  // Body composition (BMI from profile)
  const bmi = ds.profile.weightKg / (ds.profile.heightCm / 100) ** 2;
  if (Number.isFinite(bmi)) {
    factors.push({
      key: 'bmi',
      label: 'Body mass index',
      years: bmi < 18.5 ? 0.5 : bmi < 25 ? 0 : bmi < 30 ? 0.5 : 1.5,
      value: `BMI ${bmi.toFixed(1)}`,
      reference: 'healthy range 18.5–25',
      tip: 'BMI ignores muscle mass, so treat this one loosely if you lift.',
    });
  }

  const delta = factors.reduce((a, f) => a + f.years, 0);
  return {
    age: round1(clamp(realAge + delta, 18, realAge + 20)),
    realAge,
    delta: round1(delta),
    factors: factors.map((f) => ({ ...f, years: round1(f.years) })).sort((a, b) => a.years - b.years),
    skipped,
  };
}

export function fitbitAge(ds: HealthDataset, workouts: Workout[]): FitbitAge {
  const now = estimate(ds, workouts, ds.today, ds.profile.age);
  const earlier = ds.days.length > 120 ? estimate(ds, workouts.filter((w) => w.date <= addDays(ds.today, -90)), addDays(ds.today, -90), ds.profile.age) : null;
  return { ...now, previous: earlier ? earlier.age : null };
}
