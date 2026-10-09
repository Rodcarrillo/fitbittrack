import React from 'react';
import { useApp } from '../../state/store';
import { ScoreRing } from '../components/ScoreRing';
import { ActivityCard, HeartRateZones, InsightCard, SectionHead } from '../components/Cards';
import { WeekBars } from '../components/Charts';
import { IconFlame, IconHeart, IconPulse } from '../components/Icons';
import { sessionIntensity, sessionTrimp, type SessionIntensity } from '../../calc/scores';
import { dayShort, fmtDuration, fmtMonthDay, fmtNum, mean } from '../../calc/stats';

/** Fitbit-derived training load (the "Load" view inside Train). */
export function LoadView() {
  const { analysis: a } = useApp();
  if (!a) return null;
  const { ds, today, scores } = a;
  if (!ds.availability.exercise) {
    return (
      <div className="card na-block">Exercise data isn't available. Allow Exercise under Profile → Data permissions.</div>
    );
  }
  const main = [...today.load.sessions].sort((x, y) => sessionTrimp(y, ds.profile.maxHr) - sessionTrimp(x, ds.profile.maxHr))[0];
  const week = scores.slice(-7);
  const weekAvg = mean(week.map((s) => s.load.score));
  const prevAvg = mean(scores.slice(-14, -7).map((s) => s.load.score));

  const last28 = ds.exercises.filter((e) => e.date > scores[Math.max(0, scores.length - 29)].date && e.kind !== 'walk');
  const balance: Record<SessionIntensity, number> = { easy: 0, moderate: 0, hard: 0 };
  last28.forEach((e) => balance[sessionIntensity(sessionTrimp(e, ds.profile.maxHr))]++);
  const totalB = balance.easy + balance.moderate + balance.hard || 1;

  const recent = [...ds.exercises].filter((e) => e.kind !== 'walk').slice(-8).reverse();
  const insights = a.insights.filter((i) => i.area === 'training');

  return (
      <div className="dash dash--train">
        <section className="card hero-score hero-score--train">
          <ScoreRing value={today.load.score} size={150} stroke={10} color="var(--train)" inner={today.load.level} />
          <div className="hero-score__body">
            <div className="eyebrow">Training load · FITBITRACK score</div>
            <h2 className="hero-score__title">{today.load.level} load today</h2>
            <p className="hero-score__text">
              Built from time in each heart-rate zone across {today.load.sessions.length} session{today.load.sessions.length === 1 ? '' : 's'}. Harder zones count more: a minute in zone 5 weighs five times a minute in zone 1.
            </p>
            <div className="mini-stats">
              <div>
                <span className="eyebrow">This week</span>
                <b className="num">{fmtNum(weekAvg)}</b>
                <span className="fine">avg / day</span>
              </div>
              <div>
                <span className="eyebrow">vs last week</span>
                <b className="num">
                  {weekAvg >= prevAvg ? '↑' : '↓'} {fmtNum(Math.abs(((weekAvg - prevAvg) / (prevAvg || 1)) * 100))}%
                </b>
              </div>
            </div>
          </div>
        </section>

        {main && (
          <section className="card workout">
            <div className="eyebrow">Today's workout</div>
            <div className="workout__title">{main.name}</div>
            <div className="workout__meta">{fmtDuration(main.durationMin)} · {sessionIntensity(sessionTrimp(main, ds.profile.maxHr))} intensity</div>
            <div className="workout__stats">
              <div>
                <IconFlame size={16} />
                <b className="num">{main.calories ?? '—'}</b>
                <span>kcal</span>
              </div>
              <div>
                <IconHeart size={16} />
                <b className="num">{main.avgHr ?? '—'}</b>
                <span>avg bpm</span>
              </div>
              <div>
                <IconPulse size={16} />
                <b className="num">{main.maxHr ?? '—'}</b>
                <span>max bpm</span>
              </div>
            </div>
            <div className="eyebrow eyebrow--sp">Heart-rate zones</div>
            <HeartRateZones zones={ds.availability.hrZones ? main.zones : null} />
          </section>
        )}

        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Weekly load</div>
            <span className="fine">Daily FITBITRACK load, 0–100</span>
          </div>
          <WeekBars
            color="var(--train)"
            bars={week.map((s, i) => ({ label: dayShort(s.date), value: s.load.score, today: i === week.length - 1 }))}
          />
          <div className="legend-row">
            <span><i className="lg lg--light" />Light &lt;30</span>
            <span><i className="lg lg--mod" />Moderate 30–79</span>
            <span><i className="lg lg--high" />High 80+</span>
          </div>
        </section>

        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Training balance</div>
            <span className="fine">Last 28 days · {last28.length} sessions</span>
          </div>
          <div className="balance">
            {(['easy', 'moderate', 'hard'] as const).map((k) => (
              <span key={k} className={`balance__seg balance__seg--${k}`} style={{ flexGrow: balance[k] || 0.0001 }} />
            ))}
          </div>
          <div className="balance__legend">
            {(['easy', 'moderate', 'hard'] as const).map((k) => (
              <div key={k}>
                <span className={`pill pill--${k}`}>{k}</span>
                <b className="num">{balance[k]}</b>
                <span className="fine">{fmtNum((balance[k] / totalB) * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="fine">
            {balance.hard / totalB > 0.4
              ? 'Hard sessions make up a large share. Adding easy aerobic work may help recovery.'
              : balance.easy / totalB < 0.15
                ? 'Most sessions are moderate. A few truly easy days can make hard days more productive.'
                : 'A healthy mix of easy, moderate and hard sessions.'}
          </p>
        </section>

        {insights.length > 0 && (
          <section>
            <SectionHead title="Training insights" />
            <div className="stack">
              {insights.map((i) => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </div>
          </section>
        )}

        <section className="dash__wide">
          <SectionHead title="Recent activities" />
          <div className="stack">
            {recent.map((e) => (
              <ActivityCard key={e.id} e={e} trimp={sessionTrimp(e, ds.profile.maxHr)} showDate={e.date === ds.today ? 'Today' : fmtMonthDay(e.date)} />
            ))}
          </div>
        </section>
      </div>
  );
}
