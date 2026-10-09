/**
 * FITBITRACK domain model.
 * Everything the UI touches is expressed in these provider-agnostic types.
 * Providers (mock, Google Health API, Health Connect…) map their raw payloads into them.
 */

export type ISODate = string; // "2026-10-07" (civil date, user's local time)
export type ISODateTime = string; // "2026-10-07T07:20:00-06:00"

/** Metrics that may or may not be available from a given source / permission set. */
export type MetricKey =
  | 'sleep'
  | 'sleepStages'
  | 'restingHr'
  | 'hrv'
  | 'respiratoryRate'
  | 'spo2'
  | 'skinTemp'
  | 'steps'
  | 'calories'
  | 'exercise'
  | 'hrZones'
  | 'weight'
  | 'vo2max';

export type Availability = Record<MetricKey, boolean>;

export interface SleepStages {
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
}

export interface SleepSession {
  /** Civil date the sleep ENDED on (the "morning" it belongs to). */
  date: ISODate;
  start: ISODateTime;
  end: ISODateTime;
  minutesAsleep: number;
  minutesAwake: number;
  minutesInBed: number;
  stages: SleepStages | null;
}

export interface DailyMetrics {
  date: ISODate;
  restingHr: number | null; // bpm
  hrv: number | null; // ms (RMSSD, nightly)
  respiratoryRate: number | null; // breaths/min
  spo2: number | null; // %
  skinTempDelta: number | null; // °C vs personal baseline
  steps: number | null;
  calories: number | null; // kcal total
  weightKg: number | null;
  vo2max: number | null;
}

export interface HrZoneMinutes {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

export type ActivityKind =
  | 'strength'
  | 'basketball'
  | 'football'
  | 'run'
  | 'walk'
  | 'bike'
  | 'hiit'
  | 'yoga';

export interface Exercise {
  id: string;
  date: ISODate;
  kind: ActivityKind;
  name: string;
  start: ISODateTime;
  durationMin: number;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  zones: HrZoneMinutes | null;
  distanceKm: number | null;
}

export interface UserProfile {
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  maxHr: number;
  stepGoal: number;
  sleepGoalMin: number;
  trainingGoal: 'maintain' | 'build' | 'peak';
  units: 'metric' | 'imperial';
}

export interface DeviceInfo {
  id: string;
  name: string;
  battery: number | null;
  lastSync: ISODateTime | null;
}

export type JournalTag =
  | 'alcohol'
  | 'caffeine_late'
  | 'late_meal'
  | 'stress'
  | 'workout'
  | 'basketball'
  | 'football'
  | 'poor_sleep'
  | 'travel'
  | 'hydration'
  | 'rest_day'
  | 'sickness';

export interface JournalEntry {
  date: ISODate;
  tags: JournalTag[];
  note?: string;
}

/** Everything a provider returns. History is ascending by date. */
export interface HealthDataset {
  source: { id: string; label: string; isSample: boolean; fetchedAt: ISODateTime };
  profile: UserProfile;
  devices: DeviceInfo[];
  today: ISODate;
  days: DailyMetrics[];
  sleep: SleepSession[];
  exercises: Exercise[];
  journal: JournalEntry[];
  availability: Availability;
}
