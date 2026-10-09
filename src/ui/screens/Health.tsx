import React, { useState } from 'react';
import { useApp } from '../../state/store';
import { ScoreRing } from '../components/ScoreRing';
import { BaselineComparison, InsightCard, MetricCard, SectionHead, Segmented, SleepStages } from '../components/Cards';
import { TrendChart } from '../components/Charts';
import { IconDrop, IconHeart, IconLungs, IconPulse, IconThermo, IconTarget } from '../components/Icons';
import { explainMetric, metricComparison, type DailyKey } from '../../insights/engine';
import { tierLabel } from '../../calc/scores';
import { bedtimeMinutes, clockMinutes, dayLetter, fmtClock, fmtDuration, fmtMonthDay, fmtNum, mean, nonNull, signed } from '../../calc/stats';
import type { MetricKey } from '../../domain/types';
import { AgeView } from './FitbitAge';

export function HealthScreen() {
  const { healthView, setHealthView } = useApp();
  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="screen__title">Health</h1>
        <Segmented
          ariaLabel="Health view"
          value={healthView}
          onChange={setHealthView}
          options={[
            { value: 'recovery', label: 'Recovery' },
            { value: 'sleep', label: 'Sleep' },
            { value: 'age', label: 'Fitbit Age' },
          ]}
        />
      </header>
      {healthView === 'recovery' ? <Recovery /> : healthView === 'sleep' ? <Sleep /> : <AgeView />}
    </div>
  );
}

/* ================================================================== */

const HEALTH_METRICS: { key: DailyKey; avail: MetricKey; label: string; unit: string; icon: React.ReactNode; better: 'higher' | 'lower' | 'neutral'; digits: number; color: string; fmt?: (v: number) => string }[] = [
  { key: 'restingHr', avail: 'restingHr', label: 'Resting HR', unit: 'bpm', icon: <IconHeart size={16} />, better: 'lower', digits: 0, color: 'var(--ready)' },
  { key: 'hrv', avail: 'hrv', label: 'HRV', unit: 'ms', icon: <IconPulse size={16} />, better: 'higher', digits: 0, color: 'var(--ready)' },
  { key: 'respiratoryRate', avail: 'respiratoryRate', label: 'Respiratory rate', unit: 'br/min', icon: <IconLungs size={16} />, better: 'neutral', digits: 1, color: 'var(--train)' },
  { key: 'spo2', avail: 'spo2', label: 'SpO₂', unit: '%', icon: <IconDrop size={16} />, better: 'neutral', digits: 1, color: 'var(--train)' },
  { key: 'skinTempDelta', avail: 'skinTemp', label: 'Skin temperature', unit: '°C', icon: <IconThermo size={16} />, better: 'neutral', digits: 1, color: 'var(--warn)', fmt: (v) => signed(v, 1) },
];

function Recovery() {
  const { analysis: a } = useApp();
  const [range, setRange] = useState<'7' | '30'>('7');
  if (!a) return null;
  const { ds, today } = a;
  const r = today.readiness;
  const n = Number(range);
  const insights = a.insights.filter((i) => i.area === 'recovery');

  return (
    <div className="dash dash--health">
      <section className="card hero-score">
        <ScoreRing value={r?.score ?? null} size={150} stroke={10} color="var(--ready)" inner={r ? tierLabel[r.tier] : undefined} />
        <div className="hero-score__body">
          <div className="eyebrow">Readiness · FITBITRACK score</div>
          <h2 className="hero-score__title">{r ? (r.score >= 80 ? "You're well recovered today." : r.score >= 60 ? 'Recovery is on track.' : 'Your body is still recovering.') : 'Readiness unavailable'}</h2>
          <p className="hero-score__text">
            {r
              ? `${r.hrv ? `Your HRV is ${r.hrv.pct >= 0 ? 'above' : 'below'} your usual baseline` : 'HRV is not available'}${r.restingHr ? ` and your resting heart rate is ${r.restingHr.delta <= -1 ? 'slightly lower than' : r.restingHr.delta >= 1 ? 'higher than' : 'in line with'} normal` : ''}. ${r.score >= 80 ? 'You appear ready for a moderate-to-high intensity workout.' : r.score >= 60 ? 'Moderate training fits today.' : 'Favor easy movement and sleep.'}`
              : 'Readiness needs HRV or resting heart rate. Check your data permissions or wear your Fitbit overnight.'}
          </p>
          {r && (
            <div className="contribs">
              {r.contributors.map((c) => (
                <div key={c.key} className="contrib">
                  <span className="contrib__label">{c.label}</span>
                  <span className="contrib__track">
                    <span className="contrib__fill" style={{ width: `${c.sub}%`, background: c.sub >= 67 ? 'var(--ready)' : c.sub >= 34 ? 'var(--warn)' : 'var(--bad)' }} />
                  </span>
                  <span className={`contrib__pct num ${c.impactPct >= 0 ? 'is-good' : 'is-bad'}`}>
                    {signed(c.impactPct)}%
                  </span>
                </div>
              ))}
              <p className="fine">Contributor % = how much each factor helps (+) or holds back (−) versus your personal baseline.</p>
            </div>
          )}
        </div>
      </section>

      <div className="row-between">
        <SectionHead title="Health overview" />
        <Segmented
          ariaLabel="Trend range"
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
        />
      </div>
      <div className="metric-grid">
        {HEALTH_METRICS.map((m) => {
          const available = ds.availability[m.avail];
          const c = available ? metricComparison(ds, m.key) : null;
          const series = ds.days.slice(-n).map((d) => d[m.key]);
          const val = c ? (m.fmt ? m.fmt(c.value) : fmtNum(c.value, m.digits)) : null;
          return (
            <MetricCard
              key={m.key}
              icon={m.icon}
              label={m.label}
              value={val}
              unit={m.unit}
              color={m.color}
              spark={series}
              comparison={
                c && (
                  <>
                    {m.key === 'skinTempDelta' ? (
                      <span className="bc bc--neutral">vs your nightly baseline</span>
                    ) : m.key === 'hrv' ? (
                      <BaselineComparison delta={c.pct} pct better={m.better} />
                    ) : (
                      <BaselineComparison delta={c.delta} unit={m.unit} digits={m.digits} better={m.better} />
                    )}
                    <span className="metric__base">
                      Baseline {m.fmt ? m.fmt(c.baseline) : fmtNum(c.baseline, m.digits)}
                      {!c.personal && ' (typical)'}
                    </span>
                  </>
                )
              }
              explanation={available ? explainMetric(ds, m.key) : 'x'}
            />
          );
        })}
        {ds.availability.vo2max && (
          <MetricCard
            icon={<IconTarget size={16} />}
            label="Cardio fitness"
            value={fmtNum(ds.days[ds.days.length - 1].vo2max ?? 0, 1)}
            unit="VO₂ max"
            color="var(--accent)"
            spark={ds.days.slice(-n).map((d) => d.vo2max)}
            explanation="Estimated by Fitbit from your heart-rate response during activity."
          />
        )}
      </div>

      {insights.length > 0 && (
        <section>
          <SectionHead title="Recovery insights" />
          <div className="stack">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ================================================================== */

function Sleep() {
  const { analysis: a } = useApp();
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  if (!a) return null;
  const { ds, today, scores } = a;
  const s = today.sleep;
  if (!s) {
    return <div className="card na-block">No sleep recorded. Wear your Fitbit to bed and make sure Sleep is allowed under Data permissions.</div>;
  }
  const n = Number(range);
  const recent = scores.slice(-n);
  const week = ds.sleep.slice(-7);
  const insights = a.insights.filter((i) => i.area === 'sleep');
  const avg = mean(nonNull(recent.map((x) => x.sleep?.session.minutesAsleep ?? null)));

  // shared clock axis for the 7-night consistency chart: 9 PM → 11 AM
  const axisStart = -180;
  const axisEnd = 660;
  const pos = (m: number) => ((m - axisStart) / (axisEnd - axisStart)) * 100;

  return (
    <div className="dash dash--health">
      <section className="card hero-score hero-score--sleep">
        <ScoreRing value={s.score} size={150} stroke={10} color="var(--sleep)" inner={tierLabel[s.tier]} />
        <div className="hero-score__body">
          <div className="eyebrow">Sleep score · FITBITRACK score</div>
          <div className="sleep-totals">
            <div>
              <div className="big num">{fmtDuration(s.session.minutesAsleep)}</div>
              <div className="eyebrow">Total sleep</div>
            </div>
            <div>
              <div className="big num muted">{fmtDuration(s.needMin)}</div>
              <div className="eyebrow">Needed</div>
            </div>
          </div>
          <div className="sleep-times">
            <div>
              <span className="eyebrow">Bedtime</span>
              <b className="num">{fmtClock(clockMinutes(s.session.start))}</b>
            </div>
            <div>
              <span className="eyebrow">Wake time</span>
              <b className="num">{fmtClock(clockMinutes(s.session.end))}</b>
            </div>
            <div>
              <span className="eyebrow">Efficiency</span>
              <b className="num">{fmtNum((s.session.minutesAsleep / (s.session.minutesAsleep + s.session.minutesAwake)) * 100)}%</b>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Sleep stages</div>
        <SleepStages stages={ds.availability.sleepStages ? s.session.stages : null} />
      </section>

      <section className="card">
        <div className="row-between">
          <div className="eyebrow">Sleep consistency · last 7 nights</div>
          {s.bedtimeSdMin != null && <span className="fine">Bedtime varies ±{fmtNum(s.bedtimeSdMin)} min</span>}
        </div>
        <div className="windows" role="img" aria-label="Sleep windows for the last seven nights">
          {week.map((w) => {
            const b = bedtimeMinutes(w.start);
            const e = b + w.minutesAsleep + w.minutesAwake;
            return (
              <div className="windows__row" key={w.date}>
                <span className="windows__day">{dayLetter(w.date)}</span>
                <span className="windows__track">
                  <span className="windows__bar" style={{ left: `${pos(b)}%`, width: `${pos(e) - pos(b)}%` }} />
                </span>
                <span className="windows__dur num">{fmtDuration(w.minutesAsleep)}</span>
              </div>
            );
          })}
          <div className="windows__axis">
            <span />
            <span className="windows__ticks">
              {[-180, 0, 180, 360, 540].map((t) => (
                <span key={t} style={{ left: `${pos(t)}%` }}>
                  {fmtClock(t).replace(':00', '')}
                </span>
              ))}
            </span>
            <span />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <div className="eyebrow">Sleep trend</div>
          <Segmented
            ariaLabel="Sleep trend range"
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: '7D' },
              { value: '30', label: '30D' },
              { value: '90', label: '3M' },
            ]}
          />
        </div>
        <div className="trend-head">
          <span className="big num">{fmtDuration(avg)}</span>
          <span className="fine">average per night</span>
        </div>
        <TrendChart
          values={recent.map((x) => (x.sleep ? x.sleep.session.minutesAsleep / 60 : null))}
          labels={[fmtMonthDay(recent[0].date), fmtMonthDay(recent[recent.length - 1].date)]}
          baseline={ds.profile.sleepGoalMin / 60}
          color="var(--sleep)"
          format={(v) => `${v.toFixed(1)}h`}
          bars={n <= 30}
          ariaLabel="Hours of sleep per night"
        />
        <p className="fine">Dashed line: your {fmtDuration(ds.profile.sleepGoalMin)} sleep goal.</p>
      </section>

      <section>
        <SectionHead title="Sleep insight" />
        <div className="stack">
          {insights.length ? insights.map((i) => <InsightCard key={i.id} insight={i} />) : <div className="na-block">Nothing unusual in your sleep this week.</div>}
        </div>
      </section>
    </div>
  );
}
