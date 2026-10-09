import React from 'react';
import { useApp } from '../../state/store';
import { useNow, useWorkouts } from '../../workouts/store';
import {
  estimateRoutineMin,
  fmtClockDuration,
  fmtKg,
  fmtShortDuration,
  fmtVolume,
  matchFitbit,
  muscleDistribution,
  periodStats,
  records,
  suggestRoutine,
  todayISO,
  weekStart,
  weekStreak,
  weeklySeries,
  workoutSets,
  workoutVolume,
} from '../../workouts/calc';
import { addDays, fmtMonthDay, fmtNum, toDate } from '../../calc/stats';
import { TrendChart } from '../components/Charts';
import { SectionHead } from '../components/Cards';
import { IconArrowRight, IconChevron, IconPlus } from '../components/Icons';
import type { Workout } from '../../workouts/types';
import { HevyCard } from './Hevy';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function WorkoutsHome() {
  const { raw } = useApp();
  const w = useWorkouts();
  const { data, defs, active, start, openPage, setView } = w;
  const now = useNow(1000, !!active);
  if (!data) return null;
  const today = raw?.today ?? todayISO();
  const history = data.history;
  const suggestion = suggestRoutine(data.routines, history, w.rotation);
  const loggedToday = history.filter((h) => h.date === today);
  const week = periodStats(history, weekStart(today), today);
  const month = periodStats(history, addDays(today, -29), today);
  const streak = weekStreak(history, today);
  const last = history[history.length - 1];
  const weeks = weeklySeries(history, today, 8);
  const freq = weeks.reduce((a, x) => a + x.workouts, 0) / weeks.length;
  const muscles = muscleDistribution(history, defs, addDays(today, -29));

  // headline PRs: the four most-trained lifts
  const freqByEx = new Map<string, number>();
  history.forEach((h) => h.exercises.forEach((e) => freqByEx.set(e.exerciseId, (freqByEx.get(e.exerciseId) ?? 0) + 1)));
  const topLifts = [...freqByEx.entries()]
    .filter(([id]) => (defs.get(id)?.equipment ?? '') !== 'bodyweight')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => ({ id, rec: records(history, id) }));

  return (
    <div className="wk">
      <p className="wk__hello">
        {greeting()}, {raw?.profile.name ?? 'athlete'}
      </p>

      {active ? (
        <button className="card wk-live" onClick={() => w.setMinimized(false)} type="button">
          <span className="live-dot" aria-hidden="true" />
          <span className="wk-live__body">
            <span className="eyebrow">Workout in progress</span>
            <span className="wk-live__name">{active.name}</span>
          </span>
          <span className="wk-live__time num">{fmtClockDuration(w.elapsedSec(active, now))}</span>
          <span className="btn btn--primary btn--sm">Resume</span>
        </button>
      ) : (
        <section className="card wk-today">
          <div className="eyebrow">Today{loggedToday.length ? ' · next up' : ''}</div>
          {suggestion ? (
            <>
              <h2 className="wk-today__name">{suggestion.name}</h2>
              <p className="wk-today__meta">
                {suggestion.items.length} exercises · ~{estimateRoutineMin(suggestion)} min
              </p>
              <div className="wk-today__list">
                {suggestion.items.map((it) => (
                  <span key={it.exerciseId}>
                    {it.sets}× {defs.get(it.exerciseId)?.name ?? it.exerciseId}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <h2 className="wk-today__name">Free session</h2>
          )}
          {loggedToday.length > 0 && (
            <p className="wk-today__done">
              ✓ Logged today: {loggedToday.map((l) => `${l.name} · ${fmtShortDuration(l.durationSec)}`).join(', ')}
            </p>
          )}
          <button className="btn btn--primary btn--block btn--xl" onClick={() => start(suggestion?.id)} type="button">
            Start workout
          </button>
          <div className="wk-today__alt">
            <button className="link" onClick={() => setView('routines')} type="button">
              Choose routine <IconChevron size={14} />
            </button>
            <button className="link" onClick={() => start()} type="button">
              <IconPlus size={14} /> Empty workout
            </button>
          </div>
        </section>
      )}

      <HevyCard />

      <section className="card">
        <div className="row-between">
          <div className="eyebrow">This week</div>
          <span className="streak">
            <b className="num">{streak}</b> week streak
          </span>
        </div>
        <div className="statgrid">
          <Stat label="Workouts" value={String(week.workouts)} />
          <Stat label="Duration" value={week.durationSec ? fmtShortDuration(week.durationSec) : '0 min'} />
          <Stat label="Volume" value={fmtNum(week.volume)} unit="kg" />
          <Stat label="Sets" value={String(week.sets)} />
          <Stat label="Reps" value={fmtNum(week.reps)} />
          <Stat label="Avg / week" value={freq.toFixed(1)} unit="sessions" />
        </div>
      </section>

      {last && (
        <section>
          <SectionHead title="Last workout" />
          <WorkoutRow w={last} big />
        </section>
      )}

      {topLifts.length > 0 && (
        <section>
          <SectionHead title="Personal records" action="All PRs" onAction={() => setView('prs')} />
          <div className="prgrid">
            {topLifts.map(({ id, rec }) => (
              <button key={id} className="card prcard" onClick={() => openPage({ kind: 'exercise', id })} type="button">
                <span className="prcard__name">{defs.get(id)?.name}</span>
                <span className="prcard__val">
                  <b className="num">{rec.weight ? fmtKg(rec.weight.weight) : '—'}</b> kg
                </span>
                <span className="fine">{rec.e1rm ? `e1RM ${fmtKg(Math.round(rec.e1rm.value * 2) / 2)} kg` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="eyebrow">Training this month</div>
        <div className="statgrid statgrid--3">
          <Stat label="Workouts" value={String(month.workouts)} />
          <Stat label="Time" value={fmtShortDuration(month.durationSec)} />
          <Stat label="Volume" value={fmtNum(month.volume)} unit="kg" />
        </div>
        <div className="eyebrow eyebrow--sp">Weekly volume · last 8 weeks</div>
        <TrendChart
          values={weeks.map((x) => x.volume / 1000)}
          labels={[fmtMonthDay(weeks[0].week), fmtMonthDay(weeks[weeks.length - 1].week)]}
          color="var(--accent)"
          bars
          height={130}
          format={(v) => `${v.toFixed(0)}t`}
          ariaLabel="Weekly training volume in tonnes"
        />
        <p className="fine">Bars show total kg lifted per week (t = 1,000 kg). {weeks[weeks.length - 1].workouts} workouts so far this week.</p>
      </section>

      {muscles.length > 0 && (
        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Muscle distribution</div>
            <span className="fine">Sets · last 30 days</span>
          </div>
          <div className="mbars">
            {muscles.map((m) => (
              <div className="mbars__row" key={m.group}>
                <span className="mbars__label">{m.group}</span>
                <span className="mbars__track">
                  <span className="mbars__fill" style={{ width: `${(m.pct / muscles[0].pct) * 100}%` }} />
                </span>
                <span className="mbars__pct num">{Math.round(m.pct)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Recent" action="History" onAction={() => setView('history')} />
        <div className="stack">
          {[...history].reverse().slice(0, 5).map((h) => (
            <WorkoutRow key={h.id} w={h} />
          ))}
          {!history.length && <div className="na-block">No workouts yet. Start one and it will show up here.</div>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        <b className="num">{value}</b>
        {unit && <span>{unit}</span>}
      </span>
    </div>
  );
}

export function WorkoutRow({ w, big }: { w: Workout; big?: boolean }) {
  const { openPage } = useWorkouts();
  const { raw } = useApp();
  const fb = big ? matchFitbit(raw, w) : null;
  return (
    <button className={`wrow ${big ? 'wrow--big card' : ''}`} onClick={() => openPage({ kind: 'workout', id: w.id })} type="button">
      <span className="wrow__date">
        <b className="num">{toDate(w.date).getDate()}</b>
        <span>{toDate(w.date).toLocaleDateString('en-US', { month: 'short' })}</span>
      </span>
      <span className="wrow__main">
        <span className="wrow__name">
          {w.name}
          {w.prs.length > 0 && <span className="prtag">{new Set(w.prs.map((p) => p.exerciseId)).size} PR</span>}
          {w.source === 'hevy' && <span className="srctag">Hevy</span>}
        </span>
        <span className="wrow__meta">
          {fmtShortDuration(w.durationSec)} · {w.exercises.length} exercises · {workoutSets(w)} sets
        </span>
        {fb && (
          <span className="wrow__fitbit">
            Fitbit · {fb.avgHr ?? '—'} avg bpm · {fb.calories ?? '—'} kcal{fb.azm != null ? ` · ${fb.azm} AZM` : ''}
          </span>
        )}
      </span>
      <span className="wrow__vol">
        <b className="num">{fmtVolume(workoutVolume(w)).replace(' kg', '')}</b>
        <span>kg</span>
      </span>
      <IconArrowRight size={16} className="wrow__chev" />
    </button>
  );
}
