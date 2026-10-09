import React, { useState } from 'react';
import { useApp } from '../../state/store';
import { useWorkouts } from '../../workouts/store';
import { e1rm, exVolume, fmtKg, fmtShortDuration, fmtVolume, matchFitbit, PR_LABEL, uid, workoutReps, workoutSets, workoutVolume } from '../../workouts/calc';
import type { Workout } from '../../workouts/types';
import { MUSCLE_LABEL } from '../../workouts/types';
import { WorkoutRow } from './Home';
import { BackBar } from './WorkoutsTab';
import { toDate } from '../../calc/stats';
import { IconFlame, IconHeart, IconPulse } from '../components/Icons';

export function HistoryView() {
  const { data } = useWorkouts();
  if (!data) return null;
  const list = [...data.history].reverse();
  const groups = new Map<string, Workout[]>();
  list.forEach((w) => {
    const k = toDate(w.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(w);
  });
  if (!list.length) return <div className="na-block">Your finished workouts appear here, newest first.</div>;
  return (
    <div className="wk">
      {[...groups.entries()].map(([month, ws]) => (
        <section key={month}>
          <div className="month-head">
            <h2 className="sec-title">{month}</h2>
            <span className="fine">
              {ws.length} workouts · {fmtVolume(ws.reduce((a, w) => a + workoutVolume(w), 0))}
            </span>
          </div>
          <div className="stack">
            {ws.map((w) => (
              <WorkoutRow key={w.id} w={w} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

export function FitbitCard({ w }: { w: Pick<Workout, 'date' | 'startedAt' | 'durationSec'> }) {
  const { raw } = useApp();
  const fb = matchFitbit(raw, w);
  if (!fb)
    return <div className="na-block">No matching Fitbit session yet. Heart rate and calories appear here after your device syncs this workout.</div>;
  return (
    <div className="card fitbit-card">
      <div className="row-between">
        <span className="eyebrow">From your Fitbit</span>
        <span className="fine">{fb.name}</span>
      </div>
      <div className="fitbit-card__grid">
        <div>
          <IconHeart size={16} />
          <b className="num">{fb.avgHr ?? '—'}</b>
          <span>avg bpm</span>
        </div>
        <div>
          <IconPulse size={16} />
          <b className="num">{fb.maxHr ?? '—'}</b>
          <span>max bpm</span>
        </div>
        <div>
          <IconFlame size={16} />
          <b className="num">{fb.calories ?? '—'}</b>
          <span>kcal</span>
        </div>
        <div>
          <span className="azm-dot" aria-hidden="true" />
          <b className="num">{fb.azm ?? '—'}</b>
          <span>zone min</span>
        </div>
      </div>
    </div>
  );
}

export function WorkoutDetail({ id }: { id: string }) {
  const { data, defs, openPage, deleteWorkout, saveRoutine, setView } = useWorkouts();
  const [confirm, setConfirm] = useState(false);
  const [routineSaved, setRoutineSaved] = useState(false);
  const w = data?.history.find((h) => h.id === id);
  if (!w)
    return (
      <div className="wk">
        <BackBar onBack={() => openPage(null)} />
        <div className="na-block">This workout was deleted.</div>
      </div>
    );
  const start = new Date(w.startedAt);
  const end = new Date(w.endedAt);
  const prSet = new Set(w.prs.map((p) => `${p.exerciseId}:${p.weight}:${p.reps}`));

  return (
    <div className="wk">
      <BackBar title="History" onBack={() => openPage(null)} />
      <header className="wd-head">
        <span className="eyebrow">{toDate(w.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        <h1 className="screen__title">{w.name}</h1>
        <span className="fine">
          {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </header>

      <section className="card">
        <div className="statgrid">
          <div className="stat">
            <span className="stat__label">Duration</span>
            <span className="stat__value">
              <b className="num">{fmtShortDuration(w.durationSec)}</b>
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Volume</span>
            <span className="stat__value">
              <b className="num">{Math.round(workoutVolume(w)).toLocaleString('en-US')}</b>
              <span>kg</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Sets · Reps</span>
            <span className="stat__value">
              <b className="num">{workoutSets(w)}</b>
              <span>· {workoutReps(w)}</span>
            </span>
          </div>
        </div>
        {w.intensity != null && (
          <div className="intensity">
            <span className="eyebrow">Workout intensity</span>
            <Stars n={w.intensity} />
          </div>
        )}
      </section>

      <FitbitCard w={w} />

      {w.prs.length > 0 && (
        <section className="card prs-card">
          <div className="eyebrow">Personal records</div>
          {w.prs.map((p, i) => (
            <div key={i} className="prline">
              <span className="prtag">PR</span>
              <span className="prline__name">{defs.get(p.exerciseId)?.name}</span>
              <span className="fine">{PR_LABEL[p.kind]}</span>
              <b className="num">
                {fmtKg(p.weight)} kg × {p.reps}
              </b>
            </div>
          ))}
        </section>
      )}

      {w.exercises.map((e) => {
        const def = defs.get(e.exerciseId);
        return (
          <section key={e.id} className="card wd-ex">
            <button className="wd-ex__head" onClick={() => openPage({ kind: 'exercise', id: e.exerciseId })} type="button">
              <span>
                <b>{def?.name ?? e.exerciseId}</b>
                <span className="fine">{def ? MUSCLE_LABEL[def.muscle] : ''}</span>
              </span>
              <span className="fine">{fmtVolume(exVolume(e))}</span>
            </button>
            {e.notes && <p className="wd-ex__note">{e.notes}</p>}
            <table className="settable">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>kg</th>
                  <th>Reps</th>
                  <th>e1RM</th>
                </tr>
              </thead>
              <tbody>
                {e.sets.map((s, i) => (
                  <tr key={s.id}>
                    <td className="num">{i + 1}</td>
                    <td className="num">{fmtKg(s.weight ?? 0)}</td>
                    <td className="num">{s.reps}</td>
                    <td className="num">
                      {s.weight ? fmtKg(Math.round(e1rm(s.weight, s.reps ?? 0))) : '—'}
                      {prSet.has(`${e.exerciseId}:${s.weight}:${s.reps}`) && <span className="prtag prtag--sm">PR</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {w.notes && (
        <section className="card">
          <div className="eyebrow">Notes</div>
          <p className="wd-note">{w.notes}</p>
        </section>
      )}

      <div className="row-actions">
        <button
          className="btn btn--ghost btn--block"
          onClick={() => {
            saveRoutine({
              id: `r-${uid()}`,
              name: `${w.name} (copy)`,
              notes: w.notes,
              items: w.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length, restSec: e.restSec })),
              updatedAt: new Date().toISOString(),
            });
            setRoutineSaved(true);
          }}
          disabled={routineSaved}
          type="button"
        >
          {routineSaved ? 'Saved to Routines' : 'Save as routine'}
        </button>
        {confirm ? (
          <div className="confirm">
            <p>Delete this workout? PRs and stats will be recalculated without it.</p>
            <div className="confirm__row">
              <button className="btn btn--ghost" onClick={() => setConfirm(false)} type="button">
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={() => {
                  deleteWorkout(w.id);
                  setView('history');
                }}
                type="button"
              >
                Delete workout
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn--ghost btn--block btn--dangertext" onClick={() => setConfirm(true)} type="button">
            Delete workout
          </button>
        )}
      </div>
    </div>
  );
}
