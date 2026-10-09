/**
 * Pure mapping functions: Google Health API (v4) payloads → FITBITRACK domain types.
 * Kept free of I/O so they can be unit-tested against recorded fixtures.
 *
 * Reference: https://developers.google.com/health/reference/rest
 *  - list:        GET  /v4/users/me/dataTypes/{type}/dataPoints?filter=...
 *  - dailyRollUp: POST /v4/users/me/dataTypes/{type}/dataPoints:dailyRollUp
 * Field names below follow the published sleep/steps examples. Daily-metric payload
 * shapes (resting HR, HRV, SpO2…) should be confirmed against live responses and
 * adjusted here only — nothing else in the app needs to change.
 */
import type { DailyMetrics, Exercise, HrZoneMinutes, ISODate, SleepSession, ActivityKind } from '../../domain/types';

/* ---------- raw shapes (subset) ---------- */
export interface GHInterval {
  startTime: string;
  endTime: string;
  startUtcOffset?: string;
  endUtcOffset?: string;
  civilStartTime?: string;
  civilEndTime?: string;
}

export interface GHSleepPoint {
  name: string;
  sleep: {
    interval: GHInterval;
    type?: string;
    metadata?: { stagesStatus?: string; processed?: boolean; main?: boolean };
    summary?: {
      minutesInSleepPeriod?: number;
      minutesAsleep?: number;
      minutesAwake?: number;
      stagesSummary?: { type: string; minutes: number; count?: number }[];
    };
  };
}

export interface GHDailyValuePoint {
  /** e.g. dailyRestingHeartRate / dailyHeartRateVariability … — value key varies by type */
  [key: string]: unknown;
}

export interface GHExercisePoint {
  name: string;
  exercise: {
    interval: GHInterval;
    exerciseType?: string;
    displayName?: string;
    activeDuration?: string; // "2700s"
    metricsSummary?: {
      caloriesKcal?: number;
      averageHeartRateBeatsPerMinute?: number;
      maxHeartRateBeatsPerMinute?: number;
      distanceMillimeters?: number;
      heartRateZoneDurations?: { zone: string; duration: string }[];
    };
  };
}

/* ---------- helpers ---------- */
const civilDate = (iso: string, offset?: string): ISODate => {
  // Convert UTC timestamp + "-21600s" style offset into the user's civil date.
  const t = new Date(iso).getTime();
  const off = offset ? parseInt(offset, 10) * 1000 : 0;
  return new Date(t + off).toISOString().slice(0, 10);
};

const withOffset = (iso: string, offset?: string) => {
  const secs = offset ? parseInt(offset, 10) : 0;
  const local = new Date(new Date(iso).getTime() + secs * 1000).toISOString().slice(0, 19);
  const sign = secs < 0 ? '-' : '+';
  const a = Math.abs(secs);
  return `${local}${sign}${String(Math.floor(a / 3600)).padStart(2, '0')}:${String((a % 3600) / 60).padStart(2, '0')}`;
};

const seconds = (d?: string) => (d ? parseFloat(d) : 0);

/* ---------- sleep ---------- */
export function mapSleep(points: GHSleepPoint[]): SleepSession[] {
  return points
    .filter((p) => p.sleep.metadata?.main !== false)
    .map((p) => {
      const s = p.sleep;
      const st = (type: string) => s.summary?.stagesSummary?.find((x) => x.type.toUpperCase().includes(type))?.minutes ?? 0;
      const hasStages = (s.summary?.stagesSummary?.length ?? 0) > 0;
      return {
        date: civilDate(s.interval.endTime, s.interval.endUtcOffset),
        start: withOffset(s.interval.startTime, s.interval.startUtcOffset),
        end: withOffset(s.interval.endTime, s.interval.endUtcOffset),
        minutesAsleep: s.summary?.minutesAsleep ?? 0,
        minutesAwake: s.summary?.minutesAwake ?? 0,
        minutesInBed: s.summary?.minutesInSleepPeriod ?? 0,
        stages: hasStages ? { deepMin: st('DEEP'), lightMin: st('LIGHT'), remMin: st('REM'), awakeMin: st('AWAKE') } : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- exercise ---------- */
const KIND_MAP: Record<string, ActivityKind> = {
  WEIGHTLIFTING: 'strength',
  STRENGTH_TRAINING: 'strength',
  BASKETBALL: 'basketball',
  SOCCER: 'football',
  FOOTBALL: 'football',
  RUNNING: 'run',
  WALKING: 'walk',
  BIKING: 'bike',
  CYCLING: 'bike',
  HIIT: 'hiit',
  YOGA: 'yoga',
};

export function mapExercise(points: GHExercisePoint[]): Exercise[] {
  return points.map((p) => {
    const e = p.exercise;
    const m = e.metricsSummary ?? {};
    const zd = (z: string) => Math.round(seconds(m.heartRateZoneDurations?.find((x) => x.zone.toUpperCase().includes(z))?.duration) / 60);
    const zones: HrZoneMinutes | null = m.heartRateZoneDurations?.length
      ? { z1: zd('1'), z2: zd('2'), z3: zd('3'), z4: zd('4'), z5: zd('5') }
      : null;
    const kind = KIND_MAP[(e.exerciseType ?? '').toUpperCase()] ?? 'hiit';
    return {
      id: p.name,
      date: civilDate(e.interval.startTime, e.interval.startUtcOffset),
      kind,
      name: e.displayName ?? kind,
      start: withOffset(e.interval.startTime, e.interval.startUtcOffset),
      durationMin: Math.round(seconds(e.activeDuration) / 60),
      calories: m.caloriesKcal ?? null,
      avgHr: m.averageHeartRateBeatsPerMinute ?? null,
      maxHr: m.maxHeartRateBeatsPerMinute ?? null,
      zones,
      distanceKm: m.distanceMillimeters ? m.distanceMillimeters / 1e6 : null,
    };
  });
}

/* ---------- daily metrics ---------- */
type DailySeries = Partial<Record<keyof Omit<DailyMetrics, 'date'>, Map<ISODate, number>>>;

/** Merge per-type daily series into DailyMetrics rows; missing values stay null (never 0). */
export function mergeDaily(dates: ISODate[], series: DailySeries): DailyMetrics[] {
  const get = (k: keyof DailySeries, d: ISODate) => series[k]?.get(d) ?? null;
  return dates.map((date) => ({
    date,
    restingHr: get('restingHr', date),
    hrv: get('hrv', date),
    respiratoryRate: get('respiratoryRate', date),
    spo2: get('spo2', date),
    skinTempDelta: get('skinTempDelta', date),
    steps: get('steps', date),
    calories: get('calories', date),
    weightKg: get('weightKg', date),
    vo2max: get('vo2max', date),
  }));
}

/** dailyRollUp → Map<date, number>, reading the first numeric leaf under `valuePath`. */
export function rollupToMap(rollupDataPoints: Record<string, any>[], valuePath: string[]): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  for (const p of rollupDataPoints) {
    const date = (p.civilStartTime ?? p.date ?? '').slice(0, 10);
    let v: any = p;
    for (const k of valuePath) v = v?.[k];
    const num = typeof v === 'string' ? parseFloat(v) : v;
    if (date && typeof num === 'number' && Number.isFinite(num)) out.set(date, num);
  }
  return out;
}
