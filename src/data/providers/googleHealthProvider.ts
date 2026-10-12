import type { Availability, HealthDataset, ISODate } from '../../domain/types';
import { addDays, fmtISO } from '../../calc/stats';
import { api } from '../../auth/session';
import { generateSampleDataset } from './mockProvider';
import type { HealthDataProvider } from './types';
import { mapExercise, mapSleep, mergeDaily, type GHExercisePoint, type GHSleepPoint } from './googleHealthMappers';
import { loadDailySeries } from './googleHealthDaily';

/**
 * Google Health API provider (the successor of the Fitbit Web API, which was turned down
 * in September 2026).
 *
 * Security model: the browser never sees an access token or client secret. It talks to
 * the FITBITRACK backend (server/index.mjs), which runs the Google OAuth 2.0 code flow,
 * stores the encrypted refresh token server-side and proxies an allow-listed set of
 * read-only Google Health API calls. Session = httpOnly, Secure, SameSite cookie.
 */

/** Google sends int64 numbers as strings. */
const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

async function listAll<T>(dataType: string, filter: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ filter, ...(pageToken ? { pageToken } : {}) });
    const res = await api<{ dataPoints?: T[]; nextPageToken?: string }>(`/api/health/${dataType}/dataPoints?${qs}`);
    out.push(...(res.dataPoints ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

export class GoogleHealthProvider implements HealthDataProvider {
  readonly id = 'google-health';
  readonly label = 'Google Health';

  async isConnected() {
    try {
      const s = await api<{ connected: boolean }>('/auth/session');
      return s.connected;
    } catch {
      return false;
    }
  }

  async connect() {
    // Full-page redirect: backend builds the Google consent URL with PKCE + state.
    window.location.assign(`${import.meta.env.VITE_API_BASE ?? ''}/auth/google/start`);
  }

  async disconnect() {
    await api('/auth/logout', { method: 'POST' });
  }

  async load(opts: { days?: number } = {}): Promise<HealthDataset> {
    // Not connected yet: show sample data (clearly labelled) so the app is usable right away.
    if (!(await this.isConnected())) {
      const sample = generateSampleDataset();
      return { ...sample, source: { ...sample.source, label: 'Sample data · connect Google Health' } };
    }
    const today = fmtISO(new Date());
    const start = addDays(today, -((opts.days ?? 120) - 1));
    const dates: ISODate[] = [];
    for (let d = start; d <= today; d = addDays(d, 1)) dates.push(d);

    const diag: Record<string, string> = {};
    const track = <T,>(key: string, pr: Promise<T>, describe: (v: T) => string): Promise<T | null> =>
      pr.then(
        (v) => {
          diag[key] = describe(v);
          return v;
        },
        (e) => {
          diag[key] = e?.status ? `error ${e.status}` : 'error';
          return null;
        },
      );
    const [profile, devices, heightRaw, sleepRaw, exerciseRaw, daily] = await Promise.all([
      track('profile', api<any>('/api/profile'), (v) => (v?.age ? `age ${v.age}` : 'ok')),
      track('devices', api<any>('/api/devices'), (v) => `${v?.pairedDevices?.length ?? 0} devices${v?.pairedDevices?.[0] ? ` · battery ${v.pairedDevices[0].batteryLevel ?? v.pairedDevices[0].batteryStatus ?? '?'}` : ''}`),
      track('height', api<{ dataPoints?: any[] }>('/api/health/height/dataPoints?pageSize=5'), (v) => `${v?.dataPoints?.length ?? 0} points`),
      track('sleep', listAll<GHSleepPoint>('sleep', `sleep.interval.civil_end_time >= "${start}"`), (v) => `${v.length} nights`),
      track('exercise', listAll<GHExercisePoint>('exercise', `exercise.interval.civil_start_time >= "${start}"`), (v) => `${v.length} sessions`),
      loadDailySeries(start, today),
    ]);
    Object.assign(diag, daily?.diag ?? {});
    const series: Record<string, Map<ISODate, number>> = (daily?.series ?? {}) as any;

    const sleep = sleepRaw ? mapSleep(sleepRaw) : [];
    // Profile only carries age; body size comes from the weight/height data types.
    const weights = [...(series.weightKg?.entries() ?? [])].sort((a, b) => a[0].localeCompare(b[0]));
    const latestWeight = weights.length ? weights[weights.length - 1][1] : null;
    const heightCm = (() => {
      const pt = heightRaw?.dataPoints?.[0];
      let v: number | null = null;
      const walk = (o: any) => {
        if (v != null || o == null) return;
        if (typeof o === 'number' || (typeof o === 'string' && /^[0-9.]+$/.test(o))) v = Number(o);
        else if (typeof o === 'object') for (const [k, x] of Object.entries(o)) if (!/time|offset|name/i.test(k)) walk(x);
      };
      walk(pt?.height ?? pt);
      if (v == null || !Number.isFinite(v)) return null;
      const x = v as number;
      return x < 3 ? Math.round(x * 100) : x > 1000 ? Math.round(x / 10) : Math.round(x);
    })();
    const exercises = exerciseRaw ? mapExercise(exerciseRaw) : [];
    const has = (k: string) => (series[k]?.size ?? 0) > 0;

    // Availability reflects BOTH granted scopes and actual data, so the UI can hide
    // or label metrics instead of showing zeros.
    const availability: Availability = {
      sleep: sleep.length > 0,
      sleepStages: sleep.some((s) => s.stages),
      restingHr: has('restingHr'),
      hrv: has('hrv'),
      respiratoryRate: has('respiratoryRate'),
      spo2: has('spo2'),
      skinTemp: has('skinTempDelta'),
      steps: has('steps'),
      calories: has('calories'),
      exercise: exercises.length > 0,
      hrZones: exercises.some((e) => e.zones),
      weight: has('weightKg'),
      vo2max: has('vo2max'),
    };

    return {
      source: { id: this.id, label: this.label, isSample: false, fetchedAt: new Date().toISOString(), diagnostics: diag },
      profile: {
        name: profile?.displayName ?? 'there',
        age: n(profile?.age) ?? 30,
        heightCm: heightCm ?? n(profile?.heightCm) ?? 0,
        weightKg: latestWeight ?? n(profile?.weightKg) ?? 0,
        maxHr: n(profile?.maxHr) ?? 220 - (n(profile?.age) ?? 30),
        stepGoal: n(profile?.stepGoal) ?? 9000,
        sleepGoalMin: n(profile?.sleepGoalMin) ?? 480,
        trainingGoal: 'build',
        units: 'metric',
      },
      // trackers first (a Fitbit scale can also be paired)
      devices: [...(devices?.pairedDevices ?? [])]
        .sort((a: any, b: any) => (a.deviceType === 'SCALE' ? 1 : 0) - (b.deviceType === 'SCALE' ? 1 : 0))
        .map((d: any) => ({
          id: d.name,
          name: d.deviceVersion ?? d.displayName ?? 'Fitbit device',
          battery: n(d.batteryLevel) ?? ({ HIGH: 90, MEDIUM: 50, LOW: 15, EMPTY: 0 } as Record<string, number>)[String(d.batteryStatus ?? '').toUpperCase()] ?? null,
          lastSync: d.lastSyncTime ?? null,
        })),
      today,
      days: mergeDaily(dates, series),
      sleep,
      exercises,
      journal: [],
      availability,
    };
  }
}
