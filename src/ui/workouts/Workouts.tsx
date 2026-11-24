import React from 'react';
import { useApp } from '../../state/store';
import { useWorkouts } from '../../workouts/store';
import { fmtKg, fmtShortDuration, liftProgress, periodStats, PR_LABEL, recentPRs, todayISO, weekStreak, workoutVolume } from '../../workouts/calc';
import { useWorkoutHeart } from '../../workouts/hr';
import type { Workout } from '../../workouts/types';
import { addDays, fmtMonthDay, fmtNum, toDate } from '../../calc/stats';
import { Sparkline, TrendChart } from '../components/Charts';
import { HeartRateZones } from '../components/Cards';
import { IconFlame, IconHeart, IconPulse } from '../components/Icons';
import { HevyUpload } from './Analysis';
import { WorkoutDetail } from './History';
import { ExerciseDetail } from './Exercises';

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
function Delta({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return null;
  return <span className={`delta ${v > 0 ? 'delta--up' : v < 0 ? 'delta--down' : ''}`}>{v > 0 ? `↑ ${v}%` : v < 0 ? `↓ ${Math.abs(v)}%` : '='}</span>;
}

/** Workouts tab: a summary of Hevy (sets, weights, PRs) with your Fitbit heart rate for each session. */
export function TrainScreen() {
  const { page } = useWorkouts();
  if (page) {
    return (
      <div className="screen">
        {page.kind === 'workout' && <WorkoutDetail id={page.id} />}
        {page.kind === 'exercise' && <ExerciseDetail id={page.id} />}
      </div>
    );
  }
  return <WorkoutsHome />;
}

function WorkoutsHome() {
  const { raw } = useApp();
  const { data, defs, openPage } = useWorkouts();
  if (!data) return null;
  const history = data.history;
  const today = raw?.today ?? todayISO();

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">Workouts</h1>
          <p className="screen__sub">Start them only in Hevy · heart rate comes from your Fitbit</p>
        </div>
      </header>

      <HevyUpload />

      {!history.length ? (
        <div className="na-block">Upload your Hevy CSV to see your workouts here, each one with the heart rate and calories your Fitbit measured.</div>
      ) : (
        <WorkoutsBody history={history} today={today} openWorkout={(id) => openPage({ kind: 'workout', id })} openExercise={(id) => openPage({ kind: 'exercise', id })} defs={defs} />
      )}
    </div>
  );
}

function WorkoutsBody({ history, today, openWorkout, openExercise, defs }: { history: Workout[]; today: string; openWorkout: (id: string) => void; openExercise: (id: string) => void; defs: Map<string, { name: string }> }) {
  const m0 = periodStats(history, addDays(today, -29), today);
  const m1 = periodStats(history, addDays(today, -59), addDays(today, -30));
  const streak = weekStreak(history, today);
  const lifts = liftProgress(history, defs as any, addDays(today, -89), 5);
  const prs = recentPRs(history, addDays(today, -29)).filter((p) => p.kind === 'weight' || p.kind === 'e1rm');
  const prsUnique = prs.filter((p, i) => prs.findIndex((x) => x.exerciseId === p.exerciseId) === i).slice(0, 5);
  const recent = [...history].reverse().slice(0, 12);
  const last = history[history.length - 1];
  const daysSince = Math.round((toDate(today).getTime() - toDate(last.date).getTime()) / 86400000);

  return (
    <div className="wk-grid">
      <section className="card">
        <div className="row-between">
          <div className="eyebrow">Last 30 days</div>
          <span className="fine">vs previous 30</span>
        </div>
        <div className="statgrid statgrid--3">
          <Stat label="Workouts" value={String(m0.workouts)} delta={pct(m0.workouts, m1.workouts)} />
          <Stat label="Weight lifted" value={`${fmtNum(m0.volume / 1000)} t`} delta={pct(m0.volume, m1.volume)} />
          <Stat label="Avg session" value={m0.workouts ? fmtShortDuration(m0.durationSec / m0.workouts) : '—'} />
        </div>
        <p className="fine">
          {streak} week streak · last workout {daysSince <= 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}
        </p>
      </section>

      <section className="wk-recent">
        <div className="eyebrow eyebrow--sp">Recent workouts</div>
        <div className="stack">
          {recent.map((w) => (
            <WorkoutRow key={w.id} w={w} onOpen={() => openWorkout(w.id)} />
          ))}
        </div>
      </section>

      {lifts.length > 0 && (
        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Strength · 90 days</div>
            <span className="fine">est. 1-rep max</span>
          </div>
          <div className="stack stack--tight">
            {lifts.map((l) => (
              <button key={l.id} className="liftrow liftrow--flat" onClick={() => openExercise(l.id)} type="button">
                <span className="liftrow__body">
                  <b>{l.name}</b>
                  <span className="fine">
                    Best {fmtKg(l.best.top.weight)} kg × {l.best.top.reps}
                  </span>
                </span>
                <span className="liftrow__spark">
                  <Sparkline values={l.series.map((x) => x.e1rm)} color="var(--accent)" height={28} />
                </span>
                <Delta v={Math.round(l.changePct)} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card prs-card">
        <div className="eyebrow">New records · 30 days</div>
        {prsUnique.length ? (
          prsUnique.map((p, i) => (
            <button key={i} className="prline prline--btn" onClick={() => openExercise(p.exerciseId)} type="button">
              <span className="prtag">PR</span>
              <span className="prline__name">{defs.get(p.exerciseId)?.name ?? p.exerciseId}</span>
              <span className="num">
                {fmtKg(p.weight)} kg × {p.reps}
              </span>
              <span className="fine">
                {PR_LABEL[p.kind]} · {fmtMonthDay(p.date)}
              </span>
            </button>
          ))
        ) : (
          <p className="fine">No new records this month. Upload your latest Hevy CSV to update.</p>
        )}
      </section>
    </div>
  );
}

function WorkoutRow({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const { raw } = useApp();
  const h = useWorkoutHeart(w, raw);
  return (
    <button className="card wrow" onClick={onOpen} type="button">
      <span className="wrow__body">
        <b>{w.name}</b>
        <span className="fine">
          {toDate(w.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtShortDuration(w.durationSec)} · {fmtNum(workoutVolume(w))} kg
          {w.prs.length ? ` · ${w.prs.length} PR` : ''}
        </span>
      </span>
      <span className="wrow__hr">
        {h.status === 'ok' ? (
          <>
            <span>
              <IconHeart size={12} /> <b className="num">{h.avg ?? '—'}</b>
            </span>
            <span>
              <IconFlame size={12} /> <b className="num">{h.kcal ?? '—'}</b>
            </span>
          </>
        ) : (
          <span className="fine">{h.status === 'loading' ? '…' : '—'}</span>
        )}
      </span>
    </button>
  );
}

/** Heart rate block for one workout (used in the workout detail). */
export function WorkoutHeartCard({ w }: { w: Workout }) {
  const { raw } = useApp();
  const h = useWorkoutHeart(w, raw);
  if (h.status === 'loading') return <div className="na-block">Loading heart rate from your Fitbit…</div>;
  if (h.status !== 'ok')
    return <div className="na-block">{h.note ?? 'No Fitbit heart rate for this workout. Wear the band during the session and sync it; nothing needs to be started on it.'}</div>;
  return (
    <section className="card fitbit-card">
      <div className="row-between">
        <span className="eyebrow">Heart rate · Fitbit</span>
        {h.note && <span className="fine">{h.note}</span>}
      </div>
      <div className="fitbit-card__grid fitbit-card__grid--3">
        <div>
          <IconHeart size={16} />
          <b className="num">{h.avg ?? '—'}</b>
          <span>avg bpm</span>
        </div>
        <div>
          <IconPulse size={16} />
          <b className="num">{h.max ?? '—'}</b>
          <span>max bpm</span>
        </div>
        <div>
          <IconFlame size={16} />
          <b className="num">{h.kcal ?? '—'}</b>
          <span>{h.kcalEstimated ? 'kcal (est.)' : 'kcal'}</span>
        </div>
      </div>
      {h.series.length > 2 && (
        <TrendChart values={h.series.map((p) => p[1])} labels={['Start', 'End']} color="var(--bad)" height={90} format={(v) => `${Math.round(v)}`} ariaLabel="Heart rate during the workout" />
      )}
      {h.zones && <HeartRateZones zones={h.zones} />}
    </section>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        <b className="num">{value}</b>
      </span>
      {delta !== undefined && <Delta v={delta ?? null} />}
    </div>
  );
}
