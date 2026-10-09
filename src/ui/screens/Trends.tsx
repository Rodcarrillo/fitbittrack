import React, { useState } from 'react';
import { useApp } from '../../state/store';
import { Segmented } from '../components/Cards';
import { TrendChart } from '../components/Charts';
import { fmtDuration, fmtMonthDay, fmtNum, mean, nonNull, slope } from '../../calc/stats';
import type { DayScores } from '../../calc/scores';
import type { HealthDataset, MetricKey } from '../../domain/types';

type Range = '7' | '30' | '90' | '365';

interface TrendDef {
  id: string;
  title: string;
  avail: MetricKey | null;
  unit: string;
  color: string;
  better: 'higher' | 'lower';
  bars?: boolean;
  get: (ds: HealthDataset, s: DayScores, i: number) => number | null;
  show: (v: number) => string;
  /** short noun for the insight sentence */
  noun: string;
}

const TRENDS: TrendDef[] = [
  { id: 'readiness', title: 'Readiness', avail: null, unit: '', color: 'var(--ready)', better: 'higher', get: (_d, s) => s.readiness?.score ?? null, show: (v) => fmtNum(v), noun: 'readiness' },
  { id: 'hrv', title: 'HRV', avail: 'hrv', unit: 'ms', color: 'var(--ready)', better: 'higher', get: (d, _s, i) => d.days[i].hrv, show: (v) => fmtNum(v), noun: 'HRV' },
  { id: 'rhr', title: 'Resting HR', avail: 'restingHr', unit: 'bpm', color: 'var(--ready)', better: 'lower', get: (d, _s, i) => d.days[i].restingHr, show: (v) => fmtNum(v), noun: 'resting heart rate' },
  { id: 'sleep', title: 'Sleep', avail: 'sleep', unit: '', color: 'var(--sleep)', better: 'higher', get: (_d, s) => (s.sleep ? s.sleep.session.minutesAsleep / 60 : null), show: (v) => fmtDuration(v * 60), noun: 'sleep duration', bars: true },
  { id: 'sleepScore', title: 'Sleep score', avail: 'sleep', unit: '', color: 'var(--sleep)', better: 'higher', get: (_d, s) => s.sleep?.score ?? null, show: (v) => fmtNum(v), noun: 'sleep score' },
  { id: 'consistency', title: 'Sleep consistency', avail: 'sleep', unit: '', color: 'var(--sleep)', better: 'higher', get: (_d, s) => s.sleep?.components.consistency ?? null, show: (v) => fmtNum(v), noun: 'sleep consistency' },
  { id: 'load', title: 'Training load', avail: 'exercise', unit: '', color: 'var(--train)', better: 'higher', get: (_d, s) => s.load.score, show: (v) => fmtNum(v), noun: 'training load', bars: true },
  { id: 'exercise', title: 'Exercise', avail: 'exercise', unit: 'min', color: 'var(--train)', better: 'higher', get: (_d, s) => s.load.sessions.reduce((a, e) => a + e.durationMin, 0), show: (v) => fmtNum(v), noun: 'exercise time', bars: true },
  { id: 'steps', title: 'Steps', avail: 'steps', unit: '', color: 'var(--accent)', better: 'higher', get: (d, _s, i) => d.days[i].steps, show: (v) => fmtNum(v), noun: 'daily steps', bars: true },
  { id: 'calories', title: 'Calories', avail: 'calories', unit: 'kcal', color: 'var(--accent)', better: 'higher', get: (d, _s, i) => d.days[i].calories, show: (v) => fmtNum(v), noun: 'calorie burn' },
  { id: 'weight', title: 'Weight', avail: 'weight', unit: 'kg', color: 'var(--muted)', better: 'lower', get: (d, _s, i) => d.days[i].weightKg, show: (v) => fmtNum(v, 1), noun: 'weight' },
];

/** Weekly means for long ranges so a year stays readable. */
function bucket(values: (number | null)[], dates: string[], size: number) {
  if (size <= 1) return { values, dates };
  const v: (number | null)[] = [];
  const d: string[] = [];
  for (let i = 0; i < values.length; i += size) {
    const chunk = nonNull(values.slice(i, i + size));
    v.push(chunk.length ? mean(chunk) : null);
    d.push(dates[Math.min(i + size - 1, dates.length - 1)]);
  }
  return { values: v, dates: d };
}

export function TrendsScreen() {
  const { analysis: a } = useApp();
  const [range, setRange] = useState<Range>('30');
  if (!a) return null;
  const { ds, scores } = a;
  const n = Number(range);
  const label = range === '7' ? 'previous 7 days' : range === '30' ? 'previous 30 days' : range === '90' ? 'previous 90 days' : 'previous year';
  const span = range === '7' ? 'week' : range === '30' ? 'month' : range === '90' ? 'three months' : 'year';

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">Trends</h1>
          <p className="screen__sub">Am I actually getting healthier?</p>
        </div>
        <Segmented
          ariaLabel="Trend range"
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7D' },
            { value: '30', label: '30D' },
            { value: '90', label: '90D' },
            { value: '365', label: '1Y' },
          ]}
        />
      </header>
      <div className="trend-grid">
        {TRENDS.filter((t) => t.avail == null || ds.availability[t.avail]).map((t) => {
          const all = scores.map((s, i) => t.get(ds, s, i));
          const cur = all.slice(-n);
          const prev = all.slice(-2 * n, -n);
          const curAvg = mean(nonNull(cur));
          const prevAvg = mean(nonNull(prev));
          const hasPrev = nonNull(prev).length >= Math.min(5, n / 2);
          const pct = hasPrev && prevAvg ? ((curAvg - prevAvg) / prevAvg) * 100 : null;
          const dates = scores.slice(-n).map((s) => s.date);
          const b = bucket(cur, dates, n > 90 ? 7 : n > 30 ? 2 : 1);
          const sl = slope(nonNull(cur));
          const improving = pct == null ? null : t.better === 'higher' ? pct > 1 : pct < -1;
          const flat = pct != null && Math.abs(pct) <= 1;
          const insight = !Number.isFinite(curAvg)
            ? 'Not enough data in this range yet.'
            : pct == null
              ? `Your ${t.noun} has been ${Math.abs(sl) < 0.05 ? 'steady' : sl > 0 ? 'rising' : 'falling'} over this ${span}.`
              : flat
                ? `Your ${t.noun} has held steady compared with the ${label}.`
                : improving
                  ? `Your ${t.noun} has ${t.better === 'lower' ? 'come down' : 'gradually improved'} over the last ${span}.`
                  : t.id === 'load' || t.id === 'exercise' || t.id === 'calories'
                    ? `You've been ${pct! > 0 ? 'more' : 'less'} active than the ${label}.`
                    : `Your ${t.noun} is ${t.better === 'higher' ? 'down' : 'up'} versus the ${label}; worth keeping an eye on.`;
          const good = pct == null || flat ? 'neutral' : improving ? 'good' : t.id === 'load' || t.id === 'exercise' || t.id === 'calories' ? 'neutral' : 'bad';
          return (
            <section className="card trend" key={t.id}>
              <div className="trend__top">
                <div>
                  <div className="eyebrow">{t.title}</div>
                  <div className="trend__value">
                    <span className="num">{Number.isFinite(curAvg) ? t.show(curAvg) : '—'}</span>
                    {t.unit && <span className="trend__unit">{t.unit}</span>}
                    <span className="fine">avg</span>
                  </div>
                </div>
                {pct != null && (
                  <span className={`bc bc--${good}`}>
                    {pct > 0 ? '↑' : pct < 0 ? '↓' : '→'} {fmtNum(Math.abs(pct))}% <span className="bc__suffix">vs {label}</span>
                  </span>
                )}
              </div>
              <TrendChart
                values={b.values}
                labels={[fmtMonthDay(b.dates[0]), fmtMonthDay(b.dates[b.dates.length - 1])]}
                color={t.color}
                height={120}
                bars={t.bars && n <= 30}
                format={(v) => (t.id === 'sleep' ? `${v.toFixed(1)}h` : t.id === 'steps' ? `${(v / 1000).toFixed(1)}k` : t.id === 'weight' ? v.toFixed(1) : fmtNum(v))}
                ariaLabel={`${t.title} over the last ${n} days`}
              />
              <p className="trend__insight">{insight}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
