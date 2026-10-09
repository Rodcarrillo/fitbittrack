import { mean, sd, nonNull, pctChange } from './stats';

export interface Baseline {
  mean: number;
  sd: number;
  n: number;
  /** true once we have enough personal history; otherwise a population fallback is used. */
  personal: boolean;
}

/** Population fallbacks used until 14 nights of personal history exist. */
export const POPULATION: Record<string, { mean: number; sd: number }> = {
  restingHr: { mean: 62, sd: 4 },
  hrv: { mean: 40, sd: 8 },
  respiratoryRate: { mean: 15, sd: 1 },
  spo2: { mean: 96.5, sd: 1 },
  skinTempDelta: { mean: 0, sd: 0.3 },
  steps: { mean: 7500, sd: 2500 },
  calories: { mean: 2300, sd: 300 },
  sleepMin: { mean: 450, sd: 40 },
};

/**
 * Rolling personal baseline from the `window` days BEFORE index `i` (today is never
 * part of its own baseline). Falls back to population norms when history is thin.
 */
export function baselineAt(values: (number | null)[], i: number, key: keyof typeof POPULATION, window = 30, minN = 14): Baseline {
  const hist = nonNull(values.slice(Math.max(0, i - window), i));
  if (hist.length >= minN) {
    const s = sd(hist);
    // floor SD so a very stable person doesn't get extreme z-scores from tiny changes
    const floor = POPULATION[key].sd * 0.35;
    return { mean: mean(hist), sd: Math.max(s, floor), n: hist.length, personal: true };
  }
  const p = POPULATION[key];
  return { mean: p.mean, sd: p.sd, n: hist.length, personal: false };
}

export interface Comparison {
  value: number;
  baseline: number;
  delta: number;
  pct: number;
  z: number;
  personal: boolean;
}

export const compare = (value: number, b: Baseline): Comparison => ({
  value,
  baseline: b.mean,
  delta: value - b.mean,
  pct: pctChange(value, b.mean),
  z: (value - b.mean) / (b.sd || 1),
  personal: b.personal,
});
