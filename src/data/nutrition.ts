/**
 * Food & water, read from and written to Google Health (nutrition-log / hydration-log).
 * Whatever is saved here shows up in Google Health and in the Fitbit app, which reads the same store.
 */
import type { FoodEntry, ISODate, MealType, WaterEntry } from '../domain/types';
import { api, ApiError } from '../auth/session';
import { fmtISO } from '../calc/stats';
import { dateOfPoint } from './providers/googleHealthDaily';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'ANYTIME'];
const toMeal = (m: unknown): MealType => {
  const s = String(m ?? '').toUpperCase();
  if (s.includes('BREAKFAST')) return 'BREAKFAST';
  if (s.includes('LUNCH')) return 'LUNCH';
  if (s.includes('DINNER')) return 'DINNER';
  if (s.includes('SNACK')) return 'SNACK';
  return MEALS.includes(s as MealType) ? (s as MealType) : 'ANYTIME';
};

export const mealForHour = (h: number): MealType => (h < 11 ? 'BREAKFAST' : h < 16 ? 'LUNCH' : h < 18 ? 'SNACK' : 'DINNER');
export const MEAL_LABEL: Record<MealType, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snacks', ANYTIME: 'Other' };

async function listAll(type: string, filter: string): Promise<any[]> {
  const run = async (f: string) => {
    const out: any[] = [];
    let pageToken: string | undefined;
    let n = 0;
    do {
      const qs = new URLSearchParams({ pageSize: '500', ...(f ? { filter: f } : {}), ...(pageToken ? { pageToken } : {}) });
      const r = await api<{ dataPoints?: any[]; nextPageToken?: string }>(`/api/health/${type}/dataPoints?${qs}`);
      out.push(...(r.dataPoints ?? []));
      pageToken = r.nextPageToken;
    } while (pageToken && ++n < 6);
    return out;
  };
  try {
    return await run(filter);
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return run('');
    throw e;
  }
}

export function mapFood(p: any): FoodEntry | null {
  const n = p?.nutritionLog;
  if (!n) return null;
  const time: string = n.interval?.startTime ?? '';
  const date = dateOfPoint(n.interval?.civilStartTime ? { d: n.interval.civilStartTime } : p) ?? (time ? fmtISO(new Date(time)) : null);
  if (!date) return null;
  const protein = (n.nutrients ?? []).find((x: any) => String(x?.nutrient).toUpperCase() === 'PROTEIN');
  return {
    id: String(p.name ?? `g-${time}`),
    date,
    time,
    name: String(n.foodDisplayName ?? n.foodName ?? 'Food'),
    meal: toMeal(n.mealType),
    kcal: Math.round(num(n.energy?.kcal) ?? 0),
    proteinG: num(protein?.quantity?.grams),
    carbsG: num(n.totalCarbohydrate?.grams),
    fatG: num(n.totalFat?.grams),
  };
}

export function mapWater(p: any): WaterEntry | null {
  const h = p?.hydrationLog;
  if (!h) return null;
  const time: string = h.interval?.startTime ?? '';
  const date = dateOfPoint(h.interval?.civilStartTime ? { d: h.interval.civilStartTime } : p) ?? (time ? fmtISO(new Date(time)) : null);
  const ml = num(h.amountConsumed?.milliliters);
  if (!date || ml == null) return null;
  return { id: String(p.name ?? `w-${time}`), date, time, ml };
}

/** Last N days of food and water logs. Never throws: returns a status for the data check. */
export async function loadNutrition(start: ISODate) {
  const diag: Record<string, string> = {};
  const [food, water] = await Promise.all([
    listAll('nutrition-log', `nutrition_log.interval.civil_start_time >= "${start}"`)
      .then((xs) => {
        const out = xs.map(mapFood).filter((x): x is FoodEntry => !!x && x.date >= start);
        diag.food = `${out.length} entries`;
        return out;
      })
      .catch((e) => {
        diag.food = e instanceof ApiError ? `error ${e.status}` : 'error';
        return [] as FoodEntry[];
      }),
    listAll('hydration-log', `hydration_log.interval.civil_start_time >= "${start}"`)
      .then((xs) => {
        const out = xs.map(mapWater).filter((x): x is WaterEntry => !!x && x.date >= start);
        diag.water = `${out.length} entries`;
        return out;
      })
      .catch((e) => {
        diag.water = e instanceof ApiError ? `error ${e.status}` : 'error';
        return [] as WaterEntry[];
      }),
  ]);
  food.sort((a, b) => a.time.localeCompare(b.time));
  water.sort((a, b) => a.time.localeCompare(b.time));
  return { food, water, diag };
}

export interface NewFood {
  name: string;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  meal: MealType;
  at: Date;
}

const interval = (at: Date, minutes: number) => ({ startTime: at.toISOString(), endTime: new Date(at.getTime() + minutes * 60000).toISOString() });

/** Saves one food to Google Health. Returns the created entry (with its resource name when Google returns it). */
export async function saveFood(f: NewFood): Promise<FoodEntry> {
  const body = (meal: string) => ({
    nutritionLog: {
      interval: interval(f.at, 15),
      foodDisplayName: f.name.slice(0, 80) || 'Food',
      mealType: meal,
      energy: { kcal: Math.max(0, Math.round(f.kcal)) },
      ...(f.carbsG != null ? { totalCarbohydrate: { grams: Math.max(0, f.carbsG) } } : {}),
      ...(f.fatG != null ? { totalFat: { grams: Math.max(0, f.fatG) } } : {}),
      ...(f.proteinG != null ? { nutrients: [{ nutrient: 'PROTEIN', quantity: { grams: Math.max(0, f.proteinG) } }] } : {}),
      serving: { amount: 1 },
    },
  });
  let res: any;
  try {
    res = await api<any>('/api/health/nutrition-log/dataPoints', { method: 'POST', body: JSON.stringify(body(f.meal)) });
  } catch (e) {
    // an unknown meal enum value → retry without being specific
    if (e instanceof ApiError && e.status === 400 && f.meal !== 'ANYTIME') res = await api<any>('/api/health/nutrition-log/dataPoints', { method: 'POST', body: JSON.stringify(body('ANYTIME')) });
    else throw e;
  }
  const created = res?.response ?? res;
  return (
    mapFood(created) ?? {
      id: `local-${Date.now()}`,
      date: fmtISO(f.at),
      time: f.at.toISOString(),
      name: f.name,
      meal: f.meal,
      kcal: Math.round(f.kcal),
      proteinG: f.proteinG ?? null,
      carbsG: f.carbsG ?? null,
      fatG: f.fatG ?? null,
    }
  );
}

export async function saveWater(ml: number, at = new Date()): Promise<WaterEntry> {
  const res = await api<any>('/api/health/hydration-log/dataPoints', {
    method: 'POST',
    body: JSON.stringify({ hydrationLog: { interval: interval(at, 0.02), amountConsumed: { milliliters: Math.round(ml) } } }),
  });
  return mapWater(res?.response ?? res) ?? { id: `local-${Date.now()}`, date: fmtISO(at), time: at.toISOString(), ml };
}

export async function deleteEntries(type: 'nutrition-log' | 'hydration-log', ids: string[]) {
  const names = ids.filter((i) => i.startsWith('users/'));
  if (names.length) await api(`/api/health/${type}/delete`, { method: 'POST', body: JSON.stringify({ names }) });
}

export interface FoodGuess {
  name: string;
  portion: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Photo (data URL) and/or text → estimated foods (Gemini on the server). */
export async function analyzeFood(input: { image?: string; text?: string }): Promise<{ items: FoodGuess[]; note: string }> {
  const base: string = (import.meta as any).env?.VITE_API_BASE ?? '';
  let res: Response;
  try {
    res = await fetch(`${base}/api/food/analyze`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  } catch {
    throw new Error("Couldn't reach FITBITRACK's server. Check your connection, or enter the food manually.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? (body.error === 'coach_not_configured' ? 'Add GEMINI_API_KEY in Vercel (Settings → Environment Variables) to use photo logging.' : `Analysis failed (${res.status}).`));
  return { items: body.items ?? [], note: body.note ?? '' };
}

/** Downscale a photo in the browser so uploads are small and fast (~1024px JPEG). */
export function compressImage(file: File, max = 1024, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't open that photo."));
    };
    img.src = url;
  });
}
