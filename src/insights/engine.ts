/**
 * Insights engine: turns scores + personal baselines into short, hedged statements.
 * Rules never diagnose ("may indicate", "worth monitoring"), and every rule checks
 * that the data it needs is actually available.
 */
import type { HealthDataset, JournalTag, MetricKey } from '../domain/types';
import { baselineAt, compare, type Comparison } from '../calc/baseline';
import type { DayScores } from '../calc/scores';
import { bedtimeMinutes, fmtNum, mean, nonNull, slope, fmtDuration } from '../calc/stats';

export type Tone = 'positive' | 'neutral' | 'watch';
export type Area = 'recovery' | 'sleep' | 'training' | 'activity' | 'journal';

export interface Insight {
  id: string;
  tone: Tone;
  area: Area;
  title: string;
  body: string;
  priority: number;
}

export interface Analysis {
  ds: HealthDataset;
  scores: DayScores[];
  today: DayScores;
  insights: Insight[];
  correlations: Correlation[];
}

const last = <T,>(xs: T[], n: number) => xs.slice(Math.max(0, xs.length - n));

/* ------------------------------------------------------------------ */
/*  Metric explanations (one sentence under each metric)              */
/* ------------------------------------------------------------------ */

export type DailyKey = 'restingHr' | 'hrv' | 'respiratoryRate' | 'spo2' | 'skinTempDelta' | 'steps' | 'calories';

export function metricComparison(ds: HealthDataset, key: DailyKey): Comparison | null {
  const i = ds.days.length - 1;
  const v = ds.days[i][key];
  if (v == null) return null;
  return compare(v, baselineAt(ds.days.map((d) => d[key]), i, key));
}

export function metricTrend(ds: HealthDataset, key: DailyKey, n: number) {
  const xs = nonNull(last(ds.days, n).map((d) => d[key]));
  return xs.length >= 3 ? slope(xs) : 0;
}

export function explainMetric(ds: HealthDataset, key: DailyKey): string {
  const c = metricComparison(ds, key);
  if (!c) return 'No reading synced for today yet.';
  const t7 = metricTrend(ds, key, 7);
  const up = t7 > 0;
  switch (key) {
    case 'restingHr':
      if (c.delta <= -2) return 'Your resting heart rate is lower than usual, which may indicate good recovery.';
      if (c.delta >= 3) return 'Your resting heart rate is above your usual range. Late meals, alcohol, heat or stress can all push it up.';
      return 'Your resting heart rate is in line with your baseline.';
    case 'hrv':
      if (c.pct >= 5) return up ? 'Your HRV has been trending upward over the last 7 days.' : 'Your HRV is above your baseline today, a sign your body may be well recovered.';
      if (c.pct <= -8) return 'Your HRV is below your baseline. This could suggest your body is still absorbing recent stress or training.';
      return 'Your HRV is close to your personal baseline.';
    case 'respiratoryRate':
      if (c.delta >= 1) return 'Your breathing rate during sleep is higher than usual. Worth monitoring if it stays elevated.';
      return 'Your breathing rate during sleep is steady and within your normal range.';
    case 'spo2':
      if (c.value < 94) return 'Your overnight oxygen average is lower than your usual range. Worth monitoring over the next few nights.';
      return 'Your overnight blood oxygen is within your typical range.';
    case 'skinTempDelta':
      if (c.value >= 0.5) return 'Your skin temperature is higher than your baseline, which could suggest your body is fighting something off or reacting to heat.';
      return 'Your skin temperature is within your normal nightly variation.';
    case 'steps':
      return c.pct >= 0 ? `You're ${fmtNum(Math.abs(c.pct))}% ahead of your usual pace for steps.` : `You're ${fmtNum(Math.abs(c.pct))}% below your usual daily steps so far.`;
    case 'calories':
      return c.pct >= 0 ? 'Energy burn is a little higher than your average day.' : 'Energy burn is a little lower than your average day.';
  }
}

/* ------------------------------------------------------------------ */
/*  Rules                                                             */
/* ------------------------------------------------------------------ */

function rules(ds: HealthDataset, scores: DayScores[]): Insight[] {
  const out: Insight[] = [];
  const av = ds.availability;
  const today = scores[scores.length - 1];
  const days = ds.days;

  // 1. Resting HR vs 30-day average
  if (av.restingHr) {
    const c = metricComparison(ds, 'restingHr');
    if (c && Math.abs(c.delta) >= 3) {
      const lower = c.delta < 0;
      out.push({
        id: 'rhr-vs-30d',
        tone: lower ? 'positive' : 'watch',
        area: 'recovery',
        title: lower ? 'Lower resting HR' : 'Resting HR is up',
        body: `Your resting heart rate is ${fmtNum(Math.abs(c.delta))} bpm ${lower ? 'lower' : 'higher'} than your 30-day average${lower ? ', which may indicate good recovery.' : '. Worth watching alongside how you feel today.'}`,
        priority: 80,
      });
    }
  }

  // 2. HRV 7-day average vs the 30 days before it
  if (av.hrv) {
    const recent = mean(nonNull(last(days, 7).map((d) => d.hrv)));
    const prior = mean(nonNull(days.slice(-37, -7).map((d) => d.hrv)));
    const pct = ((recent - prior) / prior) * 100;
    if (Number.isFinite(pct) && Math.abs(pct) >= 4) {
      out.push({
        id: 'hrv-trend',
        tone: pct > 0 ? 'positive' : 'watch',
        area: 'recovery',
        title: pct > 0 ? 'HRV trending up' : 'HRV trending down',
        body: pct > 0 ? `Your 7-day HRV average is ${fmtNum(pct)}% above the previous 30 days. Your recovery indicators are moving in the right direction.` : `Your 7-day HRV average is ${fmtNum(-pct)}% below the previous 30 days. This could suggest accumulated fatigue; worth prioritising sleep.`,
        priority: 70,
      });
    }
  }

  // 3. Consecutive short nights
  if (av.sleep) {
    let streak = 0;
    for (let i = scores.length - 1; i >= 0; i--) {
      const s = scores[i].sleep;
      if (s && s.session.minutesAsleep < s.needMin - 30) streak++;
      else break;
    }
    if (streak >= 3)
      out.push({ id: 'short-sleep-streak', tone: 'watch', area: 'sleep', title: 'Sleep running short', body: `Your sleep has been shorter than your usual target for ${streak} consecutive nights.`, priority: 85 });
  }

  // 4. Bedtime drift across the last week
  if (av.sleep) {
    const week = last(ds.sleep, 7);
    if (week.length >= 6) {
      const beds = week.map((s) => bedtimeMinutes(s.start));
      const early = mean(beds.slice(0, 3));
      const late = mean(beds.slice(-4, -1)); // exclude last night so a single good night doesn't hide drift
      const shift = late - early;
      const avgAsleep = mean(week.map((s) => s.minutesAsleep));
      if (Math.abs(shift) >= 25) {
        out.push({
          id: 'bedtime-drift',
          tone: 'neutral',
          area: 'sleep',
          title: 'Bedtime is drifting',
          body: `${avgAsleep >= ds.profile.sleepGoalMin - 30 ? 'Your sleep duration is good, but your' : 'Your'} bedtime has shifted ${shift > 0 ? 'later' : 'earlier'} by approximately ${Math.round(Math.abs(shift) / 5) * 5} minutes across the last week.`,
          priority: 60,
        });
      }
    }
  }

  // 5. Sleep consistency change week over week
  const cons = (from: number, to: number) => mean(nonNull(scores.slice(from, to).map((s) => s.sleep?.components.consistency ?? null)));
  const thisWeek = cons(-7, scores.length);
  const lastWeek = cons(-14, -7);
  if (Number.isFinite(thisWeek) && Number.isFinite(lastWeek) && lastWeek > 0) {
    const pct = ((thisWeek - lastWeek) / lastWeek) * 100;
    if (Math.abs(pct) >= 8)
      out.push({
        id: 'consistency-change',
        tone: pct > 0 ? 'positive' : 'neutral',
        area: 'sleep',
        title: pct > 0 ? 'More consistent sleep' : 'Less consistent sleep',
        body: `Your sleep consistency ${pct > 0 ? 'improved' : 'dropped'} ${fmtNum(Math.abs(pct))}% this week.`,
        priority: 50,
      });
  }

  // 6. High-load streak
  if (av.exercise) {
    const hi = last(scores, 4).filter((s) => s.load.score >= 80).length;
    if (hi >= 3)
      out.push({ id: 'high-load', tone: 'watch', area: 'training', title: 'Heavy training block', body: `You've had ${hi} high-load training days in the last four days. An easier day could help you absorb the work.`, priority: 75 });
  }

  // 7. Recovery improving despite more training
  if (av.exercise && av.hrv) {
    const vol = (a: number, b: number) => mean(scores.slice(a, b).map((s) => s.load.trimp));
    const rdy = (a: number, b: number) => mean(nonNull(scores.slice(a, b).map((s) => s.readiness?.score ?? null)));
    const vNow = vol(-14, scores.length);
    const vPrev = vol(-28, -14);
    const rNow = rdy(-14, scores.length);
    const rPrev = rdy(-28, -14);
    if (vNow > vPrev * 1.08 && rNow >= rPrev)
      out.push({ id: 'adapting', tone: 'positive', area: 'training', title: 'Adapting well', body: 'Your recovery indicators are holding steady despite increased training volume over the last two weeks.', priority: 55 });
  }

  // 8. Steps vs goal
  if (av.steps) {
    const avg = mean(nonNull(last(days, 7).map((d) => d.steps)));
    if (Number.isFinite(avg)) {
      const pct = (avg / ds.profile.stepGoal) * 100;
      out.push({
        id: 'steps-week',
        tone: pct >= 95 ? 'positive' : 'neutral',
        area: 'activity',
        title: 'Weekly movement',
        body: `You've averaged ${fmtNum(avg)} steps a day this week, ${fmtNum(pct)}% of your ${fmtNum(ds.profile.stepGoal)} goal.`,
        priority: 30,
      });
    }
  }

  // 9. Body signals worth monitoring
  const skin = av.skinTemp ? days[days.length - 1].skinTempDelta : null;
  const resp = av.respiratoryRate ? metricComparison(ds, 'respiratoryRate') : null;
  if ((skin != null && skin >= 0.5) || (resp && resp.delta >= 1))
    out.push({ id: 'body-signals', tone: 'watch', area: 'recovery', title: 'Body signals elevated', body: 'Your skin temperature or breathing rate is above your usual range. This is worth monitoring, especially if you feel run down.', priority: 90 });

  // 10. Sleep stages
  if (today.sleep?.session.stages && av.sleepStages) {
    const st = today.sleep.session.stages;
    const deepPct = (st.deepMin / today.sleep.session.minutesAsleep) * 100;
    if (deepPct >= 20)
      out.push({ id: 'deep-sleep', tone: 'positive', area: 'sleep', title: 'Strong deep sleep', body: `You got ${fmtDuration(st.deepMin)} of deep sleep (${fmtNum(deepPct)}% of the night), above the typical range.`, priority: 45 });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/* ------------------------------------------------------------------ */
/*  Today's outlook                                                   */
/* ------------------------------------------------------------------ */

export function outlook(a: Analysis) {
  const r = a.today.readiness;
  const s = a.today.sleep;
  if (!r) {
    return {
      headline: 'Not enough recovery data yet',
      highlight: '',
      body: 'Wear your Fitbit to sleep for a few nights so FITBITRACK can learn your baseline.',
      intensity: 'unknown' as const,
    };
  }
  const hrv = r.hrv;
  const rhr = r.restingHr;
  const parts: string[] = [];
  if (s) parts.push(s.components.consistency != null && s.components.consistency >= 70 ? 'your sleep was consistent' : s.score >= 75 ? 'you slept well' : 'your sleep was lighter than ideal');
  if (hrv && hrv.pct >= 3 && rhr && rhr.delta <= -1) parts.push('your recovery indicators are above your baseline');
  else if (hrv && hrv.pct <= -8) parts.push('your HRV is below baseline');
  const why = parts.length ? parts.join(' and ') : 'your signals are close to baseline';
  const capital = why.charAt(0).toUpperCase() + why.slice(1);

  if (r.score >= 80)
    return { headline: "You're in a ", highlight: 'good place', tail: ' to train today.', body: `${capital}. A moderate-to-high intensity workout looks appropriate today.`, intensity: 'high' as const };
  if (r.score >= 60)
    return { headline: "You're ", highlight: 'ready for steady work', tail: ' today.', body: `${capital}. A moderate session fits; keep the hardest efforts short.`, intensity: 'moderate' as const };
  return { headline: 'Today looks like a ', highlight: 'recovery day', tail: '.', body: `${capital}. Easy movement, mobility and an earlier bedtime may help you bounce back.`, intensity: 'low' as const };
}

/* ------------------------------------------------------------------ */
/*  Journal correlations                                              */
/* ------------------------------------------------------------------ */

export interface Correlation {
  tag: JournalTag;
  metric: 'sleep' | 'readiness';
  withAvg: number;
  withoutAvg: number;
  nWith: number;
  nWithout: number;
  text: string;
}

export const TAG_LABEL: Record<JournalTag, string> = {
  alcohol: 'Alcohol',
  caffeine_late: 'Caffeine after 3 PM',
  late_meal: 'Late meal',
  stress: 'Stress',
  workout: 'Workout',
  basketball: 'Basketball',
  football: 'Football',
  poor_sleep: 'Poor sleep',
  travel: 'Travel',
  hydration: 'Hydration',
  rest_day: 'Rest day',
  sickness: 'Sickness',
};

const AVOID_PHRASE: Partial<Record<JournalTag, string>> = {
  alcohol: 'skip alcohol',
  caffeine_late: 'avoid caffeine after 3 PM',
  late_meal: 'avoid late meals',
  stress: "don't log stress",
};

export const MIN_SAMPLES = 6;

export function journalCorrelations(ds: HealthDataset, scores: DayScores[], windowDays = 120): Correlation[] {
  const byDate = new Map(scores.map((s) => [s.date, s]));
  const journal = new Map(ds.journal.map((j) => [j.date, j]));
  const recent = scores.slice(-windowDays - 1, -1); // logged day d → next morning's sleep/readiness
  const out: Correlation[] = [];
  const tags = Object.keys(TAG_LABEL) as JournalTag[];

  for (const tag of tags) {
    if (tag === 'poor_sleep' || tag === 'sickness') continue;
    for (const metric of ['sleep', 'readiness'] as const) {
      const yes: number[] = [];
      const no: number[] = [];
      for (const s of recent) {
        if (!journal.has(s.date)) continue;
        const next = byDate.get(scores[s.index + 1]?.date);
        const v = metric === 'sleep' ? next?.sleep?.score : next?.readiness?.score;
        if (v == null) continue;
        (journal.get(s.date)!.tags.includes(tag) ? yes : no).push(v);
      }
      if (yes.length < MIN_SAMPLES || no.length < MIN_SAMPLES) continue;
      const wa = mean(yes);
      const wo = mean(no);
      const diff = wa - wo;
      if (Math.abs(diff) < 4) continue;
      const pts = fmtNum(Math.abs(diff));
      const name = metric === 'sleep' ? 'sleep score' : 'readiness the next morning';
      const avoid = AVOID_PHRASE[tag];
      const text =
        diff < 0 && avoid
          ? `On days when you ${avoid}, your average ${name} is ${pts} points higher.`
          : `On days you log ${TAG_LABEL[tag].toLowerCase()}, your average ${name} is ${pts} points ${diff > 0 ? 'higher' : 'lower'}.`;
      out.push({ tag, metric, withAvg: wa, withoutAvg: wo, nWith: yes.length, nWithout: no.length, text });
    }
  }
  return out.sort((a, b) => Math.abs(b.withAvg - b.withoutAvg) - Math.abs(a.withAvg - a.withoutAvg));
}

export function analyze(ds: HealthDataset, scores: DayScores[]): Analysis {
  const today = scores[scores.length - 1];
  const correlations = journalCorrelations(ds, scores);
  const insights = rules(ds, scores);
  correlations.slice(0, 2).forEach((c, i) =>
    insights.push({ id: `corr-${c.tag}-${c.metric}`, tone: 'neutral', area: 'journal', title: 'Journal pattern', body: `${c.text} (correlation, not proof of cause)`, priority: 40 - i }),
  );
  return { ds, scores, today, insights, correlations };
}

export const isAvailable = (ds: HealthDataset, k: MetricKey) => ds.availability[k];
