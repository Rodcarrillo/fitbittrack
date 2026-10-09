import type {
  ActivityKind,
  DailyMetrics,
  Exercise,
  HealthDataset,
  HrZoneMinutes,
  ISODate,
  JournalEntry,
  JournalTag,
  SleepSession,
} from '../../domain/types';
import { addDays, fmtISO, mean, weekday } from '../../calc/stats';
import type { HealthDataProvider } from './types';

/**
 * Deterministic, realistic sample data shaped like what the Google Health API returns
 * after mapping. Same seed → same history, so screenshots and tests are stable.
 * Replace with GoogleHealthProvider by setting VITE_DATA_PROVIDER=google (see providers/index.ts).
 */

const OFFSET = '-06:00';
const HISTORY_DAYS = 400;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO datetime for a civil date plus minutes from its midnight (can be negative → previous day). */
function isoAt(date: ISODate, minutes: number) {
  let d = date;
  let m = Math.round(minutes);
  while (m < 0) {
    d = addDays(d, -1);
    m += 1440;
  }
  while (m >= 1440) {
    d = addDays(d, 1);
    m -= 1440;
  }
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${d}T${hh}:${mm}:00${OFFSET}`;
}

const ZONE_PROFILES: Record<ActivityKind, [number, number, number, number, number]> = {
  strength: [0.12, 0.4, 0.36, 0.12, 0],
  basketball: [0.08, 0.2, 0.34, 0.28, 0.1],
  football: [0.1, 0.22, 0.34, 0.26, 0.08],
  run: [0.04, 0.2, 0.46, 0.26, 0.04],
  walk: [0.7, 0.28, 0.02, 0, 0],
  bike: [0.08, 0.36, 0.4, 0.14, 0.02],
  hiit: [0.06, 0.16, 0.3, 0.32, 0.16],
  yoga: [0.85, 0.15, 0, 0, 0],
};

const NAMES: Record<ActivityKind, string> = {
  strength: 'Strength Training',
  basketball: 'Basketball',
  football: 'Football',
  run: 'Run',
  walk: 'Walk',
  bike: 'Outdoor Bike',
  hiit: 'HIIT',
  yoga: 'Yoga',
};

const AVG_HR: Record<ActivityKind, number> = {
  strength: 132,
  basketball: 148,
  football: 145,
  run: 152,
  walk: 98,
  bike: 136,
  hiit: 155,
  yoga: 88,
};

const KCAL_PER_MIN: Record<ActivityKind, number> = {
  strength: 8.6,
  basketball: 10.4,
  football: 10,
  run: 11.5,
  walk: 4.4,
  bike: 9,
  hiit: 11.8,
  yoga: 3.4,
};

function makeExercise(
  r: () => number,
  date: ISODate,
  kind: ActivityKind,
  startMin: number,
  duration: number,
  idx: number,
  intensity = 1,
): Exercise {
  const prof = ZONE_PROFILES[kind];
  const jitter = prof.map((p) => Math.max(0, p * (0.85 + r() * 0.3)));
  const tot = jitter.reduce((a, b) => a + b, 0) || 1;
  const z = jitter.map((p) => Math.round((p / tot) * duration));
  const zones: HrZoneMinutes = { z1: z[0], z2: z[1], z3: z[2], z4: z[3], z5: z[4] };
  const avg = Math.round(AVG_HR[kind] * intensity + (r() - 0.5) * 8);
  return {
    id: `${date}-${idx}`,
    date,
    kind,
    name: NAMES[kind],
    start: isoAt(date, startMin),
    durationMin: duration,
    calories: Math.round(duration * KCAL_PER_MIN[kind] * intensity * (0.9 + r() * 0.2)),
    avgHr: avg,
    maxHr: Math.round(avg + 18 + r() * 20),
    zones,
    distanceKm: kind === 'run' ? +(duration / 5.6).toFixed(1) : kind === 'walk' ? +(duration / 11).toFixed(1) : kind === 'bike' ? +(duration / 2.6).toFixed(1) : null,
  };
}

export function generateSampleDataset(todayDate: ISODate = fmtISO(new Date()), seed = 1729): HealthDataset {
  const r = rng(seed);
  const n = (sd = 1) => {
    // approx normal
    return ((r() + r() + r() + r() - 2) / 0.577) * sd;
  };

  const days: DailyMetrics[] = [];
  const sleep: SleepSession[] = [];
  const exercises: Exercise[] = [];
  const journal: JournalEntry[] = [];

  const start = addDays(todayDate, -(HISTORY_DAYS - 1));
  const sickStart = addDays(todayDate, -74);
  const travelStart = addDays(todayDate, -131);
  let weight = 81.8;
  let prevLoadHigh = false;
  let prevTags: JournalTag[] = [];

  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = addDays(start, i);
    const wd = weekday(date); // 0 Sun
    const progress = i / HISTORY_DAYS; // fitness improves through the year
    const isSick = date >= sickStart && date < addDays(sickStart, 4);
    const isTravel = date >= travelStart && date < addDays(travelStart, 5);
    const weekend = wd === 0 || wd === 6;

    /* ---------- sleep (night ending this morning) ---------- */
    const alcoholLast = prevTags.includes('alcohol');
    const caffeineLast = prevTags.includes('caffeine_late');
    const lateMealLast = prevTags.includes('late_meal');
    const stressLast = prevTags.includes('stress');
    const weekendNight = wd === 6 || wd === 0; // Fri & Sat nights end on Sat/Sun
    let bed = -40 + n(18) + (weekendNight ? 50 : 0) + (alcoholLast ? 35 : 0) + (isTravel ? 40 : 0);
    // a slow bedtime drift in the most recent week makes for a real consistency insight
    if (i > HISTORY_DAYS - 8) bed += (i - (HISTORY_DAYS - 8)) * 6;
    let asleep = 462 + n(28) - (alcoholLast ? 30 : 0) - (caffeineLast ? 26 : 0) - (stressLast ? 14 : 0) - (isTravel ? 35 : 0) + (weekendNight ? 20 : 0);
    asleep = Math.max(300, Math.min(560, asleep));
    let awake = Math.max(4, 14 + n(5) + (caffeineLast ? 10 : 0) + (alcoholLast ? 8 : 0) + (lateMealLast ? 5 : 0));
    const deepFrac = Math.max(0.09, 0.19 + n(0.025) - (alcoholLast ? 0.04 : 0) - (caffeineLast ? 0.025 : 0) - (lateMealLast ? 0.015 : 0));
    const remFrac = Math.max(0.12, 0.215 + n(0.025) - (alcoholLast ? 0.05 : 0));
    let deep = Math.round(asleep * deepFrac);
    let rem = Math.round(asleep * remFrac);
    let light = Math.round(asleep - deep - rem);

    /* ---------- recovery physiology ---------- */
    const rhrBase = 60.5 - progress * 4.5;
    const hrvBase = 35 + progress * 7;
    const sleepFactor = (asleep - 450) / 60; // +1 per extra hour
    let rhr = rhrBase + n(1.1) - sleepFactor * 0.6 + (alcoholLast ? 3.5 : 0) + (prevLoadHigh ? 1.2 : 0) + (isSick ? 6 : 0) + (stressLast ? 1 : 0);
    let hrv = hrvBase * (1 + n(0.07) + sleepFactor * 0.035 - (alcoholLast ? 0.14 : 0) - (prevLoadHigh ? 0.06 : 0) - (isSick ? 0.25 : 0) - (stressLast ? 0.05 : 0));
    let resp = 14.2 + n(0.35) + (isSick ? 1.6 : 0) + (alcoholLast ? 0.4 : 0);
    let spo2 = Math.min(99, 96.6 + n(0.7) - (isSick ? 1.5 : 0));
    let skin = n(0.18) + (isSick ? 0.9 : 0) + (alcoholLast ? 0.25 : 0);

    /* ---------- today's journal ---------- */
    const tags: JournalTag[] = [];
    if ((wd === 6 && r() < 0.55) || (wd === 5 && r() < 0.25)) tags.push('alcohol');
    if (!weekend && r() < 0.27) tags.push('caffeine_late');
    if (r() < 0.14) tags.push('late_meal');
    if (!weekend && r() < 0.17) tags.push('stress');
    if (r() < 0.5) tags.push('hydration');
    if (isTravel) tags.push('travel');
    if (isSick) tags.push('sickness');

    /* ---------- exercise ---------- */
    let ex: Exercise[] = [];
    let idx = 0;
    if (!isSick) {
      if (r() < 0.75) ex.push(makeExercise(r, date, 'walk', 7 * 60 + 40 + n(20), Math.round(22 + r() * 18), idx++));
      if ((wd === 1 || wd === 3 || wd === 5) && !isTravel && r() < 0.88)
        ex.push(makeExercise(r, date, 'strength', 6 * 60 + 30 + n(8), Math.round(42 + r() * 18), idx++, 1 + progress * 0.04));
      if (wd === 2 && r() < 0.85) ex.push(makeExercise(r, date, 'basketball', 19 * 60 + n(10), Math.round(65 + r() * 25), idx++));
      if (wd === 6 && r() < 0.8) ex.push(makeExercise(r, date, r() < 0.6 ? 'basketball' : 'football', 10 * 60 + n(20), Math.round(70 + r() * 30), idx++, 1.03));
      if (wd === 4 && r() < 0.55) ex.push(makeExercise(r, date, r() < 0.7 ? 'run' : 'bike', 6 * 60 + 45 + n(10), Math.round(28 + r() * 20), idx++));
      if (wd === 0 && r() < 0.25) ex.push(makeExercise(r, date, 'yoga', 9 * 60 + n(20), 30, idx++));
    }
    if (ex.some((e) => e.kind === 'basketball')) tags.push('basketball');
    if (ex.some((e) => e.kind === 'football')) tags.push('football');
    if (ex.some((e) => ['strength', 'run', 'bike', 'hiit'].includes(e.kind))) tags.push('workout');
    if (!ex.some((e) => e.kind !== 'walk' && e.kind !== 'yoga')) tags.push('rest_day');
    if (asleep < 400) tags.push('poor_sleep');

    /* ---------- "today" is pinned to a representative good morning ---------- */
    const isToday = date === todayDate;
    if (isToday) {
      tags.length = 0;
      tags.push('workout', 'hydration');
      bed = -28; // 11:32 PM
      asleep = 468; // 7h 48m
      awake = 12;
      deep = 108;
      light = 252;
      rem = 108;
      const prior = days.slice(-30);
      hrv = mean(prior.map((d) => d.hrv!)) * 1.085;
      rhr = mean(prior.map((d) => d.restingHr!)) - 3.6;
      resp = 14.1;
      spo2 = 97.4;
      skin = 0.2;
      ex = [
        makeExercise(r, date, 'walk', 7 * 60 + 5, 24, 0),
        {
          id: `${date}-1`,
          date,
          kind: 'strength',
          name: 'Strength Training',
          start: isoAt(date, 6 * 60 + 31),
          durationMin: 45,
          calories: 412,
          avgHr: 138,
          maxHr: 171,
          zones: { z1: 5, z2: 18, z3: 17, z4: 5, z5: 0 },
          distanceKm: null,
        },
      ];
      ex.sort((a, b) => a.start.localeCompare(b.start));
    }

    const sleepStart = bed;
    const sleepEnd = bed + asleep + awake;
    sleep.push({
      date,
      start: isoAt(date, sleepStart),
      end: isoAt(date, sleepEnd),
      minutesAsleep: Math.round(asleep),
      minutesAwake: Math.round(awake),
      minutesInBed: Math.round(asleep + awake + 9),
      stages: { deepMin: deep, lightMin: light, remMin: rem, awakeMin: Math.round(awake) },
    });

    exercises.push(...ex);
    const exKcal = ex.reduce((a, e) => a + (e.calories ?? 0), 0);
    const exSteps = ex.reduce((a, e) => a + (e.kind === 'walk' ? e.durationMin * 105 : e.kind === 'basketball' || e.kind === 'football' ? e.durationMin * 80 : e.kind === 'run' ? e.durationMin * 165 : 0), 0);
    const baseSteps = (weekend ? 3600 : 4600) + n(900) + progress * 500;
    // today is still in progress (afternoon)
    const steps = Math.max(1200, Math.round((baseSteps + exSteps) * (isToday ? 0.92 : 1) * (isSick ? 0.4 : 1)));
    const calories = Math.round(1780 + steps * 0.035 + exKcal * 0.85 + n(40));

    if (i % 7 === 0 || isToday) weight = weight - 0.035 + n(0.25);

    days.push({
      date,
      restingHr: Math.round(rhr),
      hrv: Math.round(hrv),
      respiratoryRate: +resp.toFixed(1),
      spo2: +spo2.toFixed(1),
      skinTempDelta: +skin.toFixed(1),
      steps: isToday ? 8742 : steps,
      calories: isToday ? 2318 : calories,
      weightKg: i % 7 === 0 || isToday ? +weight.toFixed(1) : null,
      vo2max: +(44 + progress * 2.5 + n(0.3)).toFixed(1),
    });

    // daily training load proxy for next-day effects
    const trimp = ex.reduce((a, e) => a + (e.zones ? e.zones.z1 + e.zones.z2 * 2 + e.zones.z3 * 3 + e.zones.z4 * 4 + e.zones.z5 * 5 : 0), 0);
    prevLoadHigh = trimp > 190;
    prevTags = tags;
    if (!isToday || tags.length) journal.push({ date, tags: [...new Set(tags)] });
  }

  return {
    source: { id: 'sample', label: 'Sample data', isSample: true, fetchedAt: new Date().toISOString() },
    profile: {
      name: 'Rodrigo',
      age: 29,
      heightCm: 178,
      weightKg: +weight.toFixed(1),
      maxHr: 191,
      stepGoal: 9000,
      sleepGoalMin: 480,
      trainingGoal: 'build',
      units: 'metric',
    },
    devices: [{ id: 'charge6', name: 'Fitbit Charge 6', battery: 64, lastSync: new Date(Date.now() - 6 * 60000).toISOString() }],
    today: todayDate,
    days,
    sleep,
    exercises,
    journal,
    availability: {
      sleep: true,
      sleepStages: true,
      restingHr: true,
      hrv: true,
      respiratoryRate: true,
      spo2: true,
      skinTemp: true,
      steps: true,
      calories: true,
      exercise: true,
      hrZones: true,
      weight: true,
      vo2max: true,
    },
  };
}

export class MockProvider implements HealthDataProvider {
  readonly id = 'sample';
  readonly label = 'Sample data';
  async isConnected() {
    return true;
  }
  async connect() {
    /* nothing to authorize */
  }
  async disconnect() {}
  async load(): Promise<HealthDataset> {
    // simulate network latency so loading states get exercised
    await new Promise((res) => setTimeout(res, 250));
    return generateSampleDataset();
  }
}
