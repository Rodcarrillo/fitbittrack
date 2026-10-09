/**
 * FITBITRACK SCORES — Readiness, Sleep and Training Load.
 * These are FITBITRACK's own calculations from Fitbit data, not official Fitbit scores.
 */
import type { Exercise, HealthDataset, ISODate, SleepSession } from '../domain/types';
import { baselineAt, compare, type Comparison } from './baseline';
import { bedtimeMinutes, clamp, clockMinutes, mean, sd, nonNull, weekday } from './stats';

export type Tier = 'good' | 'fair' | 'low';
export const tierOf = (s: number): Tier => (s >= 67 ? 'good' : s >= 34 ? 'fair' : 'low');
export const tierLabel: Record<Tier, string> = { good: 'Good', fair: 'Fair', low: 'Low' };

/* ================= TRAINING LOAD ================= */

const ZONE_W = [1, 2, 3, 4, 5];

/** Zone-weighted minutes (Edwards TRIMP). Falls back to avg-HR estimate when zones are missing. */
export function sessionTrimp(e: Exercise, maxHr: number): number {
  if (e.zones) {
    const z = e.zones;
    return z.z1 * ZONE_W[0] + z.z2 * ZONE_W[1] + z.z3 * ZONE_W[2] + z.z4 * ZONE_W[3] + z.z5 * ZONE_W[4];
  }
  if (e.avgHr) {
    const pct = e.avgHr / maxHr;
    const w = pct < 0.6 ? 1 : pct < 0.7 ? 2 : pct < 0.8 ? 3 : pct < 0.9 ? 4 : 5;
    return e.durationMin * w;
  }
  return e.durationMin * 1.5;
}

/** Saturating 0–100 scale: ~45 min of mostly zone 2–3 work lands in the mid-70s. */
export const loadScoreFromTrimp = (trimp: number) => Math.round(100 * (1 - Math.exp(-trimp / 100)));

export type LoadLevel = 'Light' | 'Moderate' | 'High' | 'Peak';
export const loadLevel = (s: number): LoadLevel => (s < 30 ? 'Light' : s < 80 ? 'Moderate' : s < 92 ? 'High' : 'Peak');

export type SessionIntensity = 'easy' | 'moderate' | 'hard';
export const sessionIntensity = (trimp: number): SessionIntensity => (trimp < 60 ? 'easy' : trimp < 150 ? 'moderate' : 'hard');

export interface LoadResult {
  score: number;
  trimp: number;
  level: LoadLevel;
  sessions: Exercise[];
}

/* ================= SLEEP ================= */

export interface SleepResult {
  score: number;
  tier: Tier;
  session: SleepSession;
  needMin: number;
  components: { duration: number; stages: number | null; efficiency: number; consistency: number | null };
  bedtimeSdMin: number | null;
}

function sleepNeed(goal: number, prevAsleep: number[], prevLoad: number): number {
  const debt = mean(prevAsleep.slice(-3).map((a) => Math.max(0, goal - a)));
  const debtAdj = Number.isFinite(debt) ? clamp(debt * 0.35, 0, 30) : 0;
  const loadAdj = prevLoad >= 70 ? 10 : prevLoad >= 50 ? 5 : 0;
  return Math.round((goal + debtAdj + loadAdj) / 5) * 5;
}

/* ================= READINESS ================= */

export interface Contributor {
  key: 'hrv' | 'restingHr' | 'sleep' | 'load';
  label: string;
  /** % vs personal baseline, oriented so positive = helps readiness. */
  impactPct: number;
  sub: number;
  weight: number;
}

export interface ReadinessResult {
  score: number;
  tier: Tier;
  contributors: Contributor[];
  hrv: Comparison | null;
  restingHr: Comparison | null;
  acwr: number | null;
}

/* ================= ANALYSIS ================= */

export interface DayScores {
  date: ISODate;
  index: number;
  readiness: ReadinessResult | null;
  sleep: SleepResult | null;
  load: LoadResult;
}

export function computeAllScores(ds: HealthDataset): DayScores[] {
  const { days, profile } = ds;
  const sleepByDate = new Map(ds.sleep.map((s) => [s.date, s]));
  const exByDate = new Map<ISODate, Exercise[]>();
  for (const e of ds.exercises) {
    if (!exByDate.has(e.date)) exByDate.set(e.date, []);
    exByDate.get(e.date)!.push(e);
  }

  const hrvs = days.map((d) => (ds.availability.hrv ? d.hrv : null));
  const rhrs = days.map((d) => (ds.availability.restingHr ? d.restingHr : null));
  const asleepSeries = days.map((d) => sleepByDate.get(d.date)?.minutesAsleep ?? null);
  const bedSeries = days.map((d) => {
    const s = sleepByDate.get(d.date);
    return s ? bedtimeMinutes(s.start) : null;
  });

  // daily training load first (readiness depends on it)
  const trimps: number[] = [];
  const loads: LoadResult[] = days.map((d) => {
    const sessions = ds.availability.exercise ? exByDate.get(d.date) ?? [] : [];
    const trimp = sessions.reduce((a, e) => a + sessionTrimp(e, profile.maxHr), 0);
    trimps.push(trimp);
    const score = loadScoreFromTrimp(trimp);
    return { score, trimp, level: loadLevel(score), sessions };
  });

  return days.map((d, i) => {
    /* ---- sleep ---- */
    let sleep: SleepResult | null = null;
    const s = ds.availability.sleep ? sleepByDate.get(d.date) : undefined;
    if (s) {
      const need = sleepNeed(profile.sleepGoalMin, nonNull(asleepSeries.slice(Math.max(0, i - 3), i)), i > 0 ? loads[i - 1].score : 0);
      const ratio = s.minutesAsleep / need;
      const duration = clamp(100 - Math.max(0, 1 - ratio) * 320, 0, 100);
      let stages: number | null = null;
      if (s.stages && ds.availability.sleepStages) {
        const deepF = s.stages.deepMin / s.minutesAsleep;
        const remF = s.stages.remMin / s.minutesAsleep;
        stages = clamp(100 - Math.abs(deepF - 0.19) * 260 - Math.abs(remF - 0.22) * 220, 0, 100);
      }
      const eff = s.minutesAsleep / (s.minutesAsleep + s.minutesAwake);
      const efficiency = clamp(((eff - 0.8) / 0.16) * 100, 0, 100);
      const beds = nonNull(bedSeries.slice(Math.max(0, i - 6), i + 1));
      const bedSd = beds.length >= 4 ? sd(beds) : null;
      const consistency = bedSd != null ? clamp(100 - Math.max(0, bedSd - 15) * 1.4, 0, 100) : null;
      const parts: [number, number][] = [[duration, 0.5], [efficiency, 0.15]];
      if (stages != null) parts.push([stages, 0.2]);
      if (consistency != null) parts.push([consistency, 0.15]);
      const wsum = parts.reduce((a, [, w]) => a + w, 0);
      const score = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum);
      sleep = { score, tier: tierOf(score), session: s, needMin: need, components: { duration, stages, efficiency, consistency }, bedtimeSdMin: bedSd };
    }

    /* ---- readiness ---- */
    const hrvC = hrvs[i] != null ? compare(hrvs[i]!, baselineAt(hrvs, i, 'hrv')) : null;
    const rhrC = rhrs[i] != null ? compare(rhrs[i]!, baselineAt(rhrs, i, 'restingHr')) : null;
    const acute = mean(trimps.slice(Math.max(0, i - 7), i));
    const chronic = mean(trimps.slice(Math.max(0, i - 28), i));
    const acwr = i >= 14 && chronic > 0 ? acute / chronic : null;

    const contributors: Contributor[] = [];
    if (hrvC) contributors.push({ key: 'hrv', label: 'HRV', impactPct: hrvC.pct, sub: clamp(66 + hrvC.z * 17, 5, 99), weight: 0.35 });
    if (rhrC) contributors.push({ key: 'restingHr', label: 'Resting HR', impactPct: -rhrC.pct, sub: clamp(66 - rhrC.z * 14, 5, 99), weight: 0.2 });
    if (sleep) {
      const avgAsleep = mean(nonNull(asleepSeries.slice(Math.max(0, i - 30), i)));
      contributors.push({
        key: 'sleep',
        label: 'Sleep',
        impactPct: Number.isFinite(avgAsleep) ? ((sleep.session.minutesAsleep - avgAsleep) / avgAsleep) * 100 : 0,
        sub: sleep.score,
        weight: 0.3,
      });
    }
    if (acwr != null) {
      const sub = clamp(96 - Math.max(0, acwr - 1.05) * 110 - Math.max(0, 0.6 - acwr) * 40, 10, 99);
      contributors.push({ key: 'load', label: 'Recent Load', impactPct: -(acwr - 1) * 100 * 0.5, sub, weight: 0.15 });
    }

    let readiness: ReadinessResult | null = null;
    // Need at least one physiological signal to call it "readiness".
    if (hrvC || rhrC) {
      const w = contributors.reduce((a, c) => a + c.weight, 0);
      const score = Math.round(contributors.reduce((a, c) => a + c.sub * c.weight, 0) / w);
      readiness = { score, tier: tierOf(score), contributors, hrv: hrvC, restingHr: rhrC, acwr };
    }

    return { date: d.date, index: i, readiness, sleep, load: loads[i] };
  });
}

/* ================= TONIGHT ================= */

export function tonightPlan(ds: HealthDataset, scores: DayScores[]) {
  const today = scores[scores.length - 1];
  // Use wake times from nights that end on the same kind of day as tomorrow (workday vs weekend).
  const tomorrowWeekend = [0, 6].includes((weekday(today.date) + 1) % 7);
  const recentWakes = ds.sleep
    .slice(-28)
    .filter((s) => [0, 6].includes(weekday(s.date)) === tomorrowWeekend)
    .map((s) => clockMinutes(s.end));
  const sorted = [...recentWakes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 7 * 60 + 20;
  const wake = Math.round(median / 10) * 10;
  const debt = mean(ds.sleep.slice(-3).map((s) => Math.max(0, ds.profile.sleepGoalMin - s.minutesAsleep)));
  const need = Math.round((ds.profile.sleepGoalMin + (today.load.score >= 70 ? 10 : 0) + clamp((debt || 0) * 0.35, 0, 30)) / 5) * 5;
  const bed = wake - need - 15; // 15 min to fall asleep
  return { wakeMin: wake, bedMin: bed, needMin: need };
}
