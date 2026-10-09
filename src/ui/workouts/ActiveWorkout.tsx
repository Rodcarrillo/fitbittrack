import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNow, useWorkouts } from '../../workouts/store';
import { done, fmtClockDuration, fmtKg, previousSets, records, setBeatsRecords, workoutSets, workoutVolume, PR_LABEL, fmtShortDuration } from '../../workouts/calc';
import type { ActiveWorkout, Workout, WorkoutExercise } from '../../workouts/types';
import { MUSCLE_LABEL } from '../../workouts/types';
import { ExercisePicker } from './Exercises';
import { FitbitCard, Stars } from './History';
import { fmtRest } from './Routines';
import { IconCheck, IconPlus, IconTrash } from '../components/Icons';
import { haptic, useApp } from '../../state/store';

/** Everything that floats above the app for training: live workout, mini bar, summary, picker. */
export function ActiveWorkoutLayer() {
  const { active, summary } = useWorkouts();
  return (
    <>
      {active && !active.minimized && !summary && <LiveWorkout a={active} />}
      {active && active.minimized && !summary && <MiniBar a={active} />}
      {summary && <Summary />}
      <ExercisePicker />
    </>
  );
}

function MiniBar({ a }: { a: ActiveWorkout }) {
  const { setMinimized, elapsedSec } = useWorkouts();
  const now = useNow(1000);
  const rest = a.rest ? Math.max(0, Math.ceil((a.rest.endsAt - now) / 1000)) : 0;
  return (
    <button className="minibar" onClick={() => setMinimized(false)} type="button">
      <span className="live-dot" aria-hidden="true" />
      <span className="minibar__name">{a.name}</span>
      <span className="minibar__time num">{a.pausedAt ? 'Paused' : fmtClockDuration(elapsedSec(a, now))}</span>
      {rest > 0 && <span className="minibar__rest num">Rest {fmtClockDuration(rest)}</span>}
      <span className="minibar__cta">Resume</span>
    </button>
  );
}

/* ---------------- number input that tolerates "62." while typing ---------------- */

function NumInput({ value, onChange, placeholder, decimal, id, label, done: isDone }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; decimal?: boolean; id: string; label: string; done?: boolean }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <input
      id={id}
      aria-label={label}
      className={`setin ${isDone ? 'is-done' : ''}`}
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value == null ? '' : String(value));
      }}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(t)) return;
        setText(t);
        const n = t === '' || t === '.' ? null : Number(t);
        onChange(n != null && Number.isFinite(n) ? (decimal ? n : Math.round(n)) : null);
      }}
    />
  );
}

/* ---------------- live workout ---------------- */

function LiveWorkout({ a }: { a: ActiveWorkout }) {
  const w = useWorkouts();
  const now = useNow(500);
  const [confirm, setConfirm] = useState<null | 'discard' | 'empty'>(null);
  const history = w.data?.history ?? [];
  const elapsed = w.elapsedSec(a, now);
  const completed = workoutSets(a);
  const total = a.exercises.reduce((s, e) => s + e.sets.length, 0);

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  const finish = () => {
    if (!a.exercises.some((e) => e.sets.some(done))) {
      setConfirm('empty');
      return;
    }
    w.finish();
  };

  return (
    <div className="aw" role="dialog" aria-modal="true" aria-label={`Workout: ${a.name}`}>
      <header className="aw__top">
        <button className="icon-btn" onClick={() => w.setMinimized(true)} aria-label="Minimize workout" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <input id="aw-name" className="aw__name" value={a.name} onChange={(e) => w.update((x) => ({ ...x, name: e.target.value }))} aria-label="Workout name" />
        <button className="btn btn--primary btn--sm" onClick={finish} type="button">
          Finish
        </button>
      </header>

      <div className="aw__scroll">
        <section className="aw__clock">
          <div className={`aw__time num ${a.pausedAt ? 'is-paused' : ''}`}>{fmtClockDuration(elapsed)}</div>
          <div className="aw__meta">
            <span>
              <b className="num">{Math.round(workoutVolume(a)).toLocaleString('en-US')}</b> kg
            </span>
            <span>
              <b className="num">
                {completed}/{total}
              </b>{' '}
              sets
            </span>
            <button className="pausebtn" onClick={w.togglePause} type="button">
              {a.pausedAt ? '▶ Resume' : 'Ⅱ Pause'}
            </button>
          </div>
          {a.pausedAt && <div className="aw__paused">Paused · timer stopped</div>}
        </section>

        {a.exercises.map((e, i) => (
          <ExerciseBlock key={e.id} e={e} index={i} count={a.exercises.length} history={history} />
        ))}

        {!a.exercises.length && <div className="na-block">Empty workout. Add your first exercise to start logging sets.</div>}

        <button className="addbtn addbtn--big" onClick={() => w.openPicker({ title: 'Add exercises', multi: true, onPick: w.addExercises })} type="button">
          <IconPlus size={18} /> Add exercise
        </button>

        {confirm === 'discard' || confirm === 'empty' ? (
          <div className="confirm">
            <p>{confirm === 'empty' ? 'No sets are checked off yet. Discard this workout?' : 'Discard this workout? Logged sets will be lost.'}</p>
            <div className="confirm__row">
              <button className="btn btn--ghost" onClick={() => setConfirm(null)} type="button">
                Keep training
              </button>
              <button className="btn btn--danger" onClick={w.discard} type="button">
                Discard workout
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn--ghost btn--block btn--dangertext" onClick={() => setConfirm('discard')} type="button">
            Discard workout
          </button>
        )}
        <p className="fine aw__saved">Progress saves automatically. If the app closes, your workout will be waiting here.</p>
      </div>

      {a.rest && <RestBar a={a} now={now} />}
    </div>
  );
}

function ExerciseBlock({ e, index, count, history }: { e: WorkoutExercise; index: number; count: number; history: Workout[] }) {
  const w = useWorkouts();
  const { setTab } = useApp();
  const def = w.defs.get(e.exerciseId);
  const prev = useMemo(() => previousSets(history, e.exerciseId), [history, e.exerciseId]);
  const rec = useMemo(() => records(history, e.exerciseId), [history, e.exerciseId]);
  const [menu, setMenu] = useState(false);
  const [showNotes, setShowNotes] = useState(!!e.notes);
  const [shake, setShake] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const check = (setId: string) => {
    const ok = w.toggleSet(e.id, setId);
    if (!ok) {
      setShake(setId);
      setTimeout(() => setShake(null), 400);
    } else {
      setFlash(setId);
      setTimeout(() => setFlash(null), 600);
    }
  };

  return (
    <section className="card awx">
      <div className="awx__head">
        <button
          className="awx__name"
          onClick={() => {
            w.setMinimized(true);
            setTab('train');
            w.openPage({ kind: 'exercise', id: e.exerciseId });
          }}
          type="button"
        >
          {def?.name ?? e.exerciseId}
          <span className="fine">
            {def ? MUSCLE_LABEL[def.muscle] : ''}
            {rec.weight ? ` · PR ${fmtKg(rec.weight.weight)} kg` : ''}
          </span>
        </button>
        <button className={`icon-btn ${menu ? 'is-on' : ''}`} onClick={() => setMenu(!menu)} aria-label="Exercise options" aria-expanded={menu} type="button">
          ⋯
        </button>
      </div>
      {menu && (
        <div className="awx__menu">
          <button className="chip" onClick={() => setShowNotes(!showNotes)} type="button">
            {showNotes ? 'Hide notes' : 'Notes'}
          </button>
          <button className="chip" onClick={() => w.moveExercise(e.id, -1)} disabled={index === 0} type="button">
            ↑ Move up
          </button>
          <button className="chip" onClick={() => w.moveExercise(e.id, 1)} disabled={index === count - 1} type="button">
            ↓ Move down
          </button>
          <button className="chip chip--danger" onClick={() => w.removeExercise(e.id)} type="button">
            Remove
          </button>
        </div>
      )}
      {showNotes && <textarea id={`note-${e.id}`} className="textarea awx__notes" rows={2} value={e.notes ?? ''} onChange={(ev) => w.setExerciseNote(e.id, ev.target.value)} placeholder="Notes for this exercise" />}
      <label className="awx__rest">
        <span>Rest timer</span>
        <select id={`rest-${e.id}`} value={e.restSec} onChange={(ev) => w.setExerciseRest(e.id, Number(ev.target.value))}>
          {[0, 30, 45, 60, 75, 90, 120, 150, 180, 240].map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Off' : fmtRest(s)}
            </option>
          ))}
        </select>
      </label>

      <div className="sets" role="table" aria-label={`${def?.name} sets`}>
        <div className="sets__row sets__row--head" role="row">
          <span role="columnheader">Set</span>
          <span role="columnheader">Previous</span>
          <span role="columnheader">kg</span>
          <span role="columnheader">Reps</span>
          <span role="columnheader" className="sets__c">
            <IconCheck size={14} />
          </span>
          <span />
        </div>
        {e.sets.map((s, si) => {
          const p = prev[si] ?? null;
          const prs = s.completed ? setBeatsRecords(rec, s) : [];
          return (
            <div key={s.id} role="row" className={`sets__row ${s.completed ? 'is-done' : ''} ${flash === s.id ? 'is-flash' : ''} ${shake === s.id ? 'is-shake' : ''}`}>
              <span className="sets__n num">
                {si + 1}
                {prs.length > 0 && <span className="prtag prtag--sm prtag--pop">PR</span>}
              </span>
              <span className="sets__prev num">{p ? `${fmtKg(p.weight ?? 0)} × ${p.reps}` : '—'}</span>
              <NumInput id={`kg-${s.id}`} label={`Set ${si + 1} weight in kg`} value={s.weight} decimal placeholder={p?.weight != null ? fmtKg(p.weight) : '0'} onChange={(v) => w.setValue(e.id, s.id, 'weight', v)} done={s.completed} />
              <NumInput id={`reps-${s.id}`} label={`Set ${si + 1} reps`} value={s.reps} placeholder={p?.reps != null ? String(p.reps) : '0'} onChange={(v) => w.setValue(e.id, s.id, 'reps', v)} done={s.completed} />
              <button className={`setcheck ${s.completed ? 'is-on' : ''}`} onClick={() => check(s.id)} aria-label={s.completed ? `Undo set ${si + 1}` : `Complete set ${si + 1}`} aria-pressed={s.completed} type="button">
                <IconCheck size={20} />
              </button>
              <button className="setdel" onClick={() => w.deleteSet(e.id, s.id)} aria-label={`Delete set ${si + 1}`} type="button">
                <IconTrash size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="addset" onClick={() => w.addSet(e.id)} type="button">
        <IconPlus size={15} /> Add set
      </button>
    </section>
  );
}

function RestBar({ a, now }: { a: ActiveWorkout; now: number }) {
  const w = useWorkouts();
  const rest = a.rest!;
  const frozen = a.pausedAt ?? now;
  const remaining = Math.max(0, Math.ceil((rest.endsAt - frozen) / 1000));
  const frac = Math.max(0, Math.min(1, remaining / rest.durationSec));
  const fired = useRef(false);

  useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      haptic(220);
      const t = setTimeout(() => w.skipRest(), 2500);
      return () => clearTimeout(t);
    }
  }, [remaining, w]);

  // what comes next: next unchecked set, in this exercise or the following one
  const next = (() => {
    const i0 = Math.max(0, a.exercises.findIndex((e) => e.id === rest.exerciseInstanceId));
    const order = [...a.exercises.slice(i0), ...a.exercises.slice(0, i0)];
    for (const e of order) {
      const i = e.sets.findIndex((s) => !s.completed);
      if (i >= 0) return { name: w.defs.get(e.exerciseId)?.name ?? '', set: i + 1, same: e.id === rest.exerciseInstanceId, s: e.sets[i] };
    }
    return null;
  })();

  if (rest.durationSec <= 0) return null;
  return (
    <div className={`restbar ${remaining === 0 ? 'is-over' : ''}`} role="timer" aria-live="polite">
      <div className="restbar__progress" style={{ transform: `scaleX(${frac})` }} />
      <div className="restbar__main">
        <div>
          <span className="eyebrow">{remaining === 0 ? 'Rest complete' : 'Rest'}</span>
          <div className="restbar__time num">{fmtClockDuration(remaining)}</div>
        </div>
        <div className="restbar__next">
          {next ? (
            <>
              <span className="fine">{next.same ? 'Next set' : 'Next exercise'}</span>
              <b>
                {next.name} · set {next.set}
              </b>
              {next.s.weight != null && next.s.reps != null && (
                <span className="fine num">
                  {fmtKg(next.s.weight)} kg × {next.s.reps}
                </span>
              )}
            </>
          ) : (
            <span className="fine">All sets done. Finish when ready.</span>
          )}
        </div>
      </div>
      <div className="restbar__btns">
        <button onClick={() => w.adjustRest(-30)} type="button">
          −30s
        </button>
        <button onClick={() => w.adjustRest(30)} type="button">
          +30s
        </button>
        <button className="is-primary" onClick={w.skipRest} type="button">
          Skip
        </button>
      </div>
    </div>
  );
}

/* ---------------- summary ---------------- */

function Summary() {
  const w = useWorkouts();
  const s = w.summary!;
  const [notes, setNotes] = useState(s.notes ?? '');
  const prByEx = new Map<string, typeof s.prs>();
  s.prs.forEach((p) => prByEx.set(p.exerciseId, [...(prByEx.get(p.exerciseId) ?? []), p]));

  return (
    <div className="aw aw--summary" role="dialog" aria-modal="true" aria-label="Workout complete">
      <div className="aw__scroll">
        <div className="sum__burst" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="eyebrow sum__eyebrow">Workout complete</div>
        <h1 className="sum__name">{s.name}</h1>
        <div className="sum__time num">{fmtClockDuration(s.durationSec)}</div>
        <div className="statgrid statgrid--3 sum__stats">
          <div className="stat">
            <span className="stat__label">Exercises</span>
            <span className="stat__value">
              <b className="num">{s.exercises.length}</b>
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Sets</span>
            <span className="stat__value">
              <b className="num">{workoutSets(s)}</b>
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Volume</span>
            <span className="stat__value">
              <b className="num">{Math.round(workoutVolume(s)).toLocaleString('en-US')}</b>
              <span>kg</span>
            </span>
          </div>
        </div>

        {prByEx.size > 0 && (
          <section className="card prs-card prs-card--new">
            <div className="eyebrow">New PR{prByEx.size > 1 ? 's' : ''}</div>
            {[...prByEx.entries()].map(([id, hits]) => {
              const top = hits.find((h) => h.kind === 'weight') ?? hits.find((h) => h.kind === 'e1rm') ?? hits[0];
              return (
                <div key={id} className="prline">
                  <span className="prtag prtag--pop">PR</span>
                  <span className="prline__name">{w.defs.get(id)?.name}</span>
                  <span className="fine">{hits.map((h) => PR_LABEL[h.kind]).join(' · ')}</span>
                  <b className="num">
                    {fmtKg(top.weight)} kg × {top.reps}
                  </b>
                </div>
              );
            })}
          </section>
        )}

        {s.intensity != null && (
          <div className="card intensity intensity--card">
            <span className="eyebrow">Workout intensity</span>
            <Stars n={s.intensity} />
          </div>
        )}

        <FitbitCard w={s} />

        <label className="field">
          <span className="eyebrow">How did it go?</span>
          <textarea id="sum-notes" className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Energy, pain, what to change next time" />
        </label>

        <button className="btn btn--primary btn--block btn--xl" onClick={() => w.saveSummary(notes)} type="button">
          Save workout
        </button>
        <button className="btn btn--ghost btn--block" onClick={w.closeSummary} type="button">
          Back to workout
        </button>
        <p className="fine aw__saved">Saved workouts update History, PRs and analytics right away. Duration {fmtShortDuration(s.durationSec)}.</p>
      </div>
    </div>
  );
}
