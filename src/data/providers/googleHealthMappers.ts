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
/** Google APIs send int64 values as JSON strings ("372"); coerce everything numeric. */
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/* ---------- sleep ---------- */
export function mapSleep(points: GHSleepPoint[]): SleepSession[] {
  const all = points
    .filter((p) => p.sleep?.interval?.startTime && p.sleep.interval.endTime)
    .map((p) => {
      const s = p.sleep;
      const st = (type: string) => num(s.summary?.stagesSummary?.find((x) => String(x.type).toUpperCase().includes(type))?.minutes) ?? 0;
      const hasStages = (s.summary?.stagesSummary?.length ?? 0) > 0;
      const spanMin = Math.round((new Date(s.interval.endTime).getTime() - new Date(s.interval.startTime).getTime()) / 60000);
      const asleep = num(s.summary?.minutesAsleep) ?? (hasStages ? st('LIGHT') + st('DEEP') + st('REM') : spanMin);
      const awake = num(s.summary?.minutesAwake) ?? (hasStages ? st('AWAKE') : 0);
      return {
        main: s.metadata?.main,
        session: {
          date: civilDate(s.interval.endTime, s.interval.endUtcOffset),
          start: withOffset(s.interval.startTime, s.interval.startUtcOffset),
          end: withOffset(s.interval.endTime, s.interval.endUtcOffset),
          minutesAsleep: asleep,
          minutesAwake: awake,
          minutesInBed: num(s.summary?.minutesInSleepPeriod) ?? spanMin,
          stages: hasStages ? { deepMin: st('DEEP'), lightMin: st('LIGHT'), remMin: st('REM'), awakeMin: st('AWAKE') } : null,
        } as SleepSession,
      };
    });
  // One night per date: the main sleep if flagged, otherwise the longest (naps are dropped).
  const byDate = new Map<ISODate, { main?: boolean; session: SleepSession }>();
  for (const x of all) {
    const cur = byDate.get(x.session.date);
    const better = !cur || (x.main === true && cur.main !== true) || (x.main === cur.main && x.session.minutesAsleep > cur.session.minutesAsleep);
    if (better && !(cur?.main === true && x.main !== true)) byDate.set(x.session.date, x);
  }
  return [...byDate.values()].map((x) => x.session).sort((a, b) => a.date.localeCompare(b.date));
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
      calories: num(m.caloriesKcal),
      avgHr: num(m.averageHeartRateBeatsPerMinute),
      maxHr: num(m.maxHeartRateBeatsPerMinute),
      zones,
      distanceKm: num(m.distanceMillimeters) ? num(m.distanceMillimeters)! / 1e6 : null,
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
