/**
 * Battery life estimate for the band.
 * Google Health reports the level (and a coarse status) at the last sync, but no "time left".
 * So FITBITRACK keeps a small history of (sync time, level) readings for this account and
 * measures your real drain rate since the last charge. Until there is enough history it falls
 * back to the typical battery life of the model.
 */
import { scoped } from '../auth/account';
import type { DeviceInfo } from '../domain/types';

type Sample = { t: number; level: number };
const KEY = (id: string) => scoped(`battery:${id}`);

/** Typical full-charge life in hours, by product name. */
const TYPICAL_HOURS: [RegExp, number][] = [
  [/pixel watch 3/i, 24],
  [/pixel watch/i, 24],
  [/sense 2|versa 4/i, 6 * 24],
  [/sense|versa/i, 6 * 24],
  [/charge 6|charge 5/i, 7 * 24],
  [/charge/i, 7 * 24],
  [/inspire 3/i, 10 * 24],
  [/inspire/i, 10 * 24],
  [/luxe/i, 5 * 24],
  [/ace/i, 5 * 24],
];

export function typicalHours(name: string) {
  for (const [re, h] of TYPICAL_HOURS) if (re.test(name)) return h;
  return 6 * 24;
}

function load(id: string): Sample[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) ?? '[]') as Sample[];
  } catch {
    return [];
  }
}

/** Store the reading from the latest sync (deduped by sync time). */
export function recordBattery(d: DeviceInfo) {
  if (d.battery == null || !d.lastSync) return;
  const t = new Date(d.lastSync).getTime();
  if (!Number.isFinite(t)) return;
  const xs = load(d.id).filter((s) => s.t !== t);
  xs.push({ t, level: d.battery });
  xs.sort((a, b) => a.t - b.t);
  try {
    localStorage.setItem(KEY(d.id), JSON.stringify(xs.slice(-200)));
  } catch {
    /* ignore */
  }
}

export interface BatteryEstimate {
  level: number;
  /** hours left from now (already discounting time since last sync) */
  hoursLeft: number;
  ratePerHour: number;
  method: 'measured' | 'typical';
  basisHours: number;
  lastSync: string | null;
}

export function estimateBattery(d: DeviceInfo, now = Date.now()): BatteryEstimate | null {
  if (d.battery == null) return null;
  const xs = load(d.id);
  // segment since the last charge: walk back while the level keeps going up as we go back in time
  let i = xs.length - 1;
  while (i > 0 && xs[i - 1].level >= xs[i].level) i--;
  const seg = xs.slice(i);
  const span = seg.length >= 2 ? (seg[seg.length - 1].t - seg[0].t) / 3600000 : 0;
  const drop = seg.length >= 2 ? seg[0].level - seg[seg.length - 1].level : 0;
  let rate: number;
  let method: BatteryEstimate['method'];
  if (span >= 8 && drop >= 4) {
    rate = drop / span;
    method = 'measured';
  } else {
    rate = 100 / typicalHours(d.name);
    method = 'typical';
  }
  const since = d.lastSync ? Math.max(0, (now - new Date(d.lastSync).getTime()) / 3600000) : 0;
  const levelNow = Math.max(0, d.battery - rate * since);
  return { level: Math.round(levelNow), hoursLeft: levelNow / rate, ratePerHour: rate, method, basisHours: span, lastSync: d.lastSync };
}

export const fmtHoursLeft = (h: number) => {
  if (h < 1) return 'less than 1 hour';
  if (h < 36) return `${Math.round(h)} hours`;
  const d = Math.floor(h / 24);
  const r = Math.round(h - d * 24);
  return r ? `${d} days ${r} h` : `${d} days`;
};
