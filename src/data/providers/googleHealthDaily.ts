/**
 * Daily metrics from the Google Health API, following the published v4 reference:
 *  - "daily" types (resting HR, HRV, SpO2, respiratory rate, skin temp, VO2 max) are read with
 *    dataPoints.list; each point carries `date: {year, month, day}` and its value
 *  - interval types (steps, calories) use dailyRollUp, whose range is CivilDateTime objects and
 *    is limited to 90 days (14 days for total-calories), so it is requested in chunks
 *  - samples (weight, height) are listed and bucketed by day
 * int64 values arrive as strings. Every type reports a status line for the in-app data check.
 */
import type { ISODate } from '../../domain/types';
import { addDays } from '../../calc/stats';
import { api, ApiError } from '../../auth/session';

export type DailyKey = 'restingHr' | 'hrv' | 'respiratoryRate' | 'spo2' | 'skinTempDelta' | 'steps' | 'calories' | 'weightKg' | 'vo2max';

type Spec =
  | { kind: 'daily'; type: string; field: string; prefer: string[]; avoid?: RegExp }
  | { kind: 'rollup'; type: string; field: string; prefer: string[]; maxDays: number }
  | { kind: 'sample'; type: string; field: string; prefer: string[]; scale?: (v: number) => number };

export const DAILY_SPECS: Record<DailyKey, Spec> = {
  restingHr: { kind: 'daily', type: 'daily-resting-heart-rate', field: 'dailyRestingHeartRate', prefer: ['beatsPerMinute'] },
  hrv: { kind: 'daily', type: 'daily-heart-rate-variability', field: 'dailyHeartRateVariability', prefer: ['averageHeartRateVariabilityMilliseconds', 'deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds'], avoid: /beatsPerMinute|entropy/i },
  respiratoryRate: { kind: 'daily', type: 'daily-respiratory-rate', field: 'dailyRespiratoryRate', prefer: ['breathsPerMinute', 'fullSleepBreathsPerMinute', 'averageBreathsPerMinute'] },
  spo2: { kind: 'daily', type: 'daily-oxygen-saturation', field: 'dailyOxygenSaturation', prefer: ['averagePercentage', 'percentage', 'average'], avoid: /min|max|lower|upper/i },
  skinTempDelta: { kind: 'daily', type: 'daily-sleep-temperature-derivations', field: 'dailySleepTemperatureDerivations', prefer: ['nightlyTemperatureCelsiusDelta', 'relativeNightlyTemperatureCelsius', 'deviationCelsius'], avoid: /^(?!.*(delta|relative|deviation)).*$/i },
  vo2max: { kind: 'daily', type: 'daily-vo2-max', field: 'dailyVo2Max', prefer: ['vo2Max', 'estimatedVo2Max', 'vo2MaxMillilitersPerMinuteKilogram'] },
  steps: { kind: 'rollup', type: 'steps', field: 'steps', prefer: ['countSum', 'count'], maxDays: 90 },
  calories: { kind: 'rollup', type: 'total-calories', field: 'totalCalories', prefer: ['kcalSum', 'kcal', 'caloriesSum'], maxDays: 14 },
  weightKg: { kind: 'sample', type: 'weight', field: 'weight', prefer: ['weightKilograms', 'kilograms', 'weightGrams', 'grams'], scale: (v) => (v > 1000 ? v / 1000 : v) },
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const pad = (n: number) => String(n).padStart(2, '0');
const civil = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number);
  return { date: { year: y, month: m, day } };
};

/** First {year, month, day} found (preferring date / civil* keys) → ISO date. */
export function dateOfPoint(p: any): ISODate | null {
  const asIso = (o: any) => (o && num(o.year) && num(o.month) && num(o.day) ? `${o.year}-${pad(+o.month)}-${pad(+o.day)}` : null);
  const strDate = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
  let found: ISODate | null = null;
  const walk = (o: any, depth: number) => {
    if (found || o == null || typeof o !== 'object' || depth > 6) return;
    const direct = asIso(o);
    if (direct) {
      found = direct;
      return;
    }
    const keys = Object.keys(o).sort((a, b) => Number(/date|civil|start/i.test(b)) - Number(/date|civil|start/i.test(a)));
    for (const k of keys) {
      if (/^(date|civilStartTime|civilTime|civil_start_time)$/i.test(k) && strDate(o[k])) {
        found = strDate(o[k]);
        return;
      }
      walk(o[k], depth + 1);
      if (found) return;
    }
  };
  walk(p, 0);
  return found;
}

/** Value inside the type object: a preferred key at any depth, else the first plausible numeric leaf. */
export function valueOfPoint(obj: any, prefer: string[], avoid?: RegExp): number | null {
  if (obj == null) return null;
  const skip = /date|time|offset|year|month|day|metadata|name|source|interval|count$|^id$/i;
  for (const key of prefer) {
    let hit: number | null = null;
    const find = (o: any, d: number) => {
      if (hit != null || o == null || typeof o !== 'object' || d > 5) return;
      if (key in o && num(o[key]) != null) hit = num(o[key]);
      else for (const v of Object.values(o)) find(v, d + 1);
    };
    find(obj, 0);
    if (hit != null) return hit;
  }
  let leaf: number | null = null;
  const walk = (o: any, d: number) => {
    if (leaf != null || o == null || typeof o !== 'object' || d > 5) return;
    for (const [k, v] of Object.entries(o)) {
      if (skip.test(k) && !prefer.includes(k)) continue;
      if (avoid?.test(k)) continue;
      if (num(v) != null && typeof v !== 'object') {
        leaf = num(v);
        return;
      }
      walk(v, d + 1);
      if (leaf != null) return;
    }
  };
  walk(obj, 0);
  return leaf;
}

const status = (e: unknown) => (e instanceof ApiError ? `error ${e.status}` : 'error');

async function listPoints(type: string, filters: string[]): Promise<any[]> {
  let lastErr: unknown = null;
  for (const filter of filters) {
    try {
      const out: any[] = [];
      let pageToken: string | undefined;
      let pages = 0;
      do {
        const qs = new URLSearchParams({ pageSize: '500', ...(filter ? { filter } : {}), ...(pageToken ? { pageToken } : {}) });
        const res = await api<{ dataPoints?: any[]; nextPageToken?: string }>(`/api/health/${type}/dataPoints?${qs}`);
        out.push(...(res.dataPoints ?? []));
        pageToken = res.nextPageToken;
      } while (pageToken && ++pages < 8);
      return out;
    } catch (e) {
      lastErr = e;
      if (e instanceof ApiError && e.status !== 400) break; // only a bad filter is worth retrying another way
    }
  }
  throw lastErr;
}

async function rollup(type: string, start: ISODate, endExclusive: ISODate, maxDays: number): Promise<any[]> {
  const out: any[] = [];
  for (let s = start; s < endExclusive; s = addDays(s, maxDays)) {
    const e = addDays(s, maxDays) < endExclusive ? addDays(s, maxDays) : endExclusive;
    const res = await api<{ rollupDataPoints?: any[] }>(`/api/health/${type}/dailyRollUp`, {
      method: 'POST',
      body: JSON.stringify({ range: { start: civil(s), end: civil(e) }, windowSizeDays: 1 }),
    });
    out.push(...(res.rollupDataPoints ?? []));
  }
  return out;
}

const snake = (t: string) => t.replace(/-/g, '_');

/** Loads every daily metric. Never throws: failures become an empty series plus a status line. */
export async function loadDailySeries(start: ISODate, today: ISODate) {
  const series: Partial<Record<DailyKey, Map<ISODate, number>>> = {};
  const diag: Record<string, string> = {};
  await Promise.all(
    (Object.keys(DAILY_SPECS) as DailyKey[]).map(async (key) => {
      const spec = DAILY_SPECS[key];
      const map = new Map<ISODate, number>();
      try {
        let points: any[];
        if (spec.kind === 'rollup') points = await rollup(spec.type, start, addDays(today, 1), spec.maxDays);
        else if (spec.kind === 'daily') points = await listPoints(spec.type, [`${snake(spec.type)}.date >= "${start}"`, '']);
        else points = await listPoints(spec.type, [`${snake(spec.type)}.sample_time.civil_time >= "${start}"`, '']);
        for (const p of points) {
          const d = dateOfPoint(p);
          const body = p[spec.field] ?? p;
          let v = valueOfPoint(body, spec.prefer, 'avoid' in spec ? spec.avoid : undefined);
          if (key === 'skinTempDelta') {
            // prefer "tonight minus your baseline" when both are present
            const nightly = num(body?.nightlyTemperatureCelsius);
            const base = num(body?.baselineTemperatureCelsius);
            if (nightly != null && base != null) v = nightly - base;
          }
          if (v == null || !d || d < start || d > today) continue;
          if (spec.kind === 'sample' && spec.scale) v = spec.scale(v);
          map.set(d, Math.round(v * 100) / 100);
        }
        series[key] = map;
        diag[key] = map.size ? `${map.size} days` : points.length ? `${points.length} points, no values read` : 'no data';
        if (!map.size && points.length) diag[key] += ` · keys: ${Object.keys(points[0][spec.field] ?? points[0]).slice(0, 6).join(', ')}`;
      } catch (e) {
        diag[key] = status(e);
      }
    }),
  );
  return { series, diag };
}
