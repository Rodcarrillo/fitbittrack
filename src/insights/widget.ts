/**
 * Compact snapshot for home-screen widgets (Scriptable). The app computes it after every load
 * and saves it to the server; GET /api/widget serves it to the widget with a personal key.
 */
import type { Analysis } from './engine';
import { outlook } from './engine';
import { tierLabel, tonightPlan } from '../calc/scores';
import { estimateBattery } from './battery';
import type { HealthDataset } from '../domain/types';
import type { Workout } from '../workouts/types';
import { weekStart } from '../workouts/calc';

export interface WidgetSnapshot {
  v: 1;
  generatedAt: string;
  date: string;
  name: string;
  readiness: { score: number; label: string } | null;
  sleep: { score: number; label: string; minutes: number; bedtime: string | null; wake: string | null } | null;
  load: { score: number; label: string };
  hrv: { ms: number | null; pct: number | null };
  rhr: { bpm: number | null; delta: number | null };
  steps: number | null;
  stepGoal: number;
  calories: number | null;
  outlook: string;
  tonight: { bedtime: string; wake: string; needMin: number };
  readiness7: (number | null)[];
  sleep7: (number | null)[];
  battery: { level: number; hoursLeft: number | null; device: string } | null;
  food: { kcal: number; protein: number; carbs: number; fat: number; waterMl: number } | null;
  training: { weekSessions: number; last: { name: string; date: string; minutes: number } | null };
}

const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const timeOf = (iso: string | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);

export function buildWidgetSnapshot(a: Analysis, ds: HealthDataset, workouts: Workout[], sessions: { date: string; name: string; durationSec: number }[]): WidgetSnapshot {
  const t = a.today;
  const r = t.readiness;
  const s = t.sleep;
  const day = ds.days[ds.days.length - 1];
  const o = outlook(a);
  const plan = tonightPlan(ds, a.scores);
  const dev = ds.devices[0];
  const est = dev ? estimateBattery(dev) : null;
  const food = (ds.food ?? []).filter((f) => f.date === ds.today);
  const water = (ds.water ?? []).filter((w) => w.date === ds.today).reduce((x, w) => x + w.ml, 0);
  const wk = weekStart(ds.today);
  const all = [...workouts.map((w) => ({ date: w.date, name: w.name, minutes: Math.round(w.durationSec / 60) })), ...sessions.map((x) => ({ date: x.date, name: x.name, minutes: Math.round(x.durationSec / 60) }))].sort((x, y) => x.date.localeCompare(y.date));
  const last7 = a.scores.slice(-7);
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    date: ds.today,
    name: ds.profile.name,
    readiness: r ? { score: r.score, label: tierLabel[r.tier] } : null,
    sleep: s ? { score: s.score, label: tierLabel[s.tier], minutes: s.session.minutesAsleep, bedtime: timeOf(s.session.start), wake: timeOf(s.session.end) } : null,
    load: { score: t.load.score, label: t.load.level },
    hrv: { ms: day?.hrv ?? null, pct: r?.hrv?.pct != null ? Math.round(r.hrv.pct) : null },
    rhr: { bpm: day?.restingHr ?? null, delta: r?.restingHr?.delta != null ? Math.round(r.restingHr.delta) : null },
    steps: day?.steps ?? null,
    stepGoal: ds.profile.stepGoal,
    calories: day?.calories != null ? Math.round(day.calories) : null,
    outlook: `${o.headline}${'highlight' in o ? o.highlight ?? '' : ''}${'tail' in o ? o.tail ?? '' : ''}`.trim(),
    tonight: { bedtime: clock(plan.bedMin), wake: clock(plan.wakeMin), needMin: plan.needMin },
    readiness7: last7.map((x) => x.readiness?.score ?? null),
    sleep7: last7.map((x) => x.sleep?.score ?? null),
    battery: dev && est ? { level: est.level, hoursLeft: Math.round(est.hoursLeft), device: dev.name } : dev && dev.battery != null ? { level: dev.battery, hoursLeft: null, device: dev.name } : null,
    food: ds.food ? { kcal: food.reduce((x, f) => x + f.kcal, 0), protein: Math.round(food.reduce((x, f) => x + (f.proteinG ?? 0), 0)), carbs: Math.round(food.reduce((x, f) => x + (f.carbsG ?? 0), 0)), fat: Math.round(food.reduce((x, f) => x + (f.fatG ?? 0), 0)), waterMl: water } : null,
    training: { weekSessions: all.filter((x) => x.date >= wk).length, last: all.length ? all[all.length - 1] : null },
  };
}
