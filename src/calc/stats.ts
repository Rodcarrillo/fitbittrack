import type { ISODate } from '../domain/types';

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export const sd = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const pctChange = (value: number, base: number) => (base ? ((value - base) / base) * 100 : 0);

export const nonNull = <T,>(xs: (T | null | undefined)[]): T[] => xs.filter((x): x is T => x != null);

/** Least-squares slope per index step. */
export const slope = (ys: number[]) => {
  const n = ys.length;
  if (n < 3) return 0;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) ** 2;
  });
  return den ? num / den : 0;
};

/* ---------- civil date helpers (no timezone surprises: dates are plain YYYY-MM-DD) ---------- */

export const toDate = (d: ISODate) => new Date(d + 'T12:00:00');

export const fmtISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (d: ISODate, n: number): ISODate => {
  const x = toDate(d);
  x.setDate(x.getDate() + n);
  return fmtISO(x);
};

export const weekday = (d: ISODate) => toDate(d).getDay(); // 0 = Sun

export const dayLetter = (d: ISODate) => 'SMTWTFS'[weekday(d)];
export const dayShort = (d: ISODate) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(d)];

export const fmtLongDate = (d: ISODate) =>
  toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const fmtMonthDay = (d: ISODate) => toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Minutes → "7h 48m" */
export const fmtDuration = (min: number) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
};

/** Minutes after midnight → "11:32 PM" (handles >1440 and negatives). */
export const fmtClock = (minOfDay: number) => {
  const m = ((Math.round(minOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
};

/** Clock minutes of an ISO datetime, in the timestamp's own local offset. */
export const clockMinutes = (iso: string) => {
  const t = iso.slice(11, 16);
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Bedtime minutes relative to midnight, so 23:30 → -30 and 00:45 → 45 (keeps bedtimes contiguous). */
export const bedtimeMinutes = (iso: string) => {
  const m = clockMinutes(iso);
  return m > 12 * 60 ? m - 1440 : m;
};

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmtNum(Math.abs(n), digits)}`;
