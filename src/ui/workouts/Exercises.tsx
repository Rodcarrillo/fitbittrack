import React, { useMemo, useState } from 'react';
import { useWorkouts } from '../../workouts/store';
import { e1rm, exerciseSessions, fmtKg, records } from '../../workouts/calc';
import { EQUIPMENT_LABEL, MUSCLE_LABEL, type Equipment, type ExerciseDef, type Muscle } from '../../workouts/types';
import { BackBar } from './WorkoutsTab';
import { fmtRest } from './Routines';
import { TrendChart } from '../components/Charts';
import { Segmented } from '../components/Cards';
import { IconCheck, IconChevron, IconPlus } from '../components/Icons';
import { fmtMonthDay, toDate } from '../../calc/stats';

const MUSCLES = Object.keys(MUSCLE_LABEL) as Muscle[];
const EQUIPS = Object.keys(EQUIPMENT_LABEL) as Equipment[];

function useFiltered(all: ExerciseDef[]) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all');
  const [equip, setEquip] = useState<Equipment | 'all'>('all');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all
      .filter((e) => (muscle === 'all' || e.muscle === muscle) && (equip === 'all' || e.equipment === equip) && (!t || e.name.toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, q, muscle, equip]);
  return { q, setQ, muscle, setMuscle, equip, setEquip, list };
}

function Filters({ f, idPrefix }: { f: ReturnType<typeof useFiltered>; idPrefix: string }) {
  return (
    <div className="filters">
      <label className="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input id={`${idPrefix}-search`} value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder="Search exercises" autoComplete="off" />
      </label>
      <div className="chips chips--scroll">
        <button className={`chip ${f.muscle === 'all' ? 'is-on' : ''}`} onClick={() => f.setMuscle('all')} type="button">
          All
        </button>
        {MUSCLES.map((m) => (
          <button key={m} className={`chip ${f.muscle === m ? 'is-on' : ''}`} onClick={() => f.setMuscle(m)} type="button">
            {MUSCLE_LABEL[m]}
          </button>
        ))}
      </div>
      <select id={`${idPrefix}-equip`} className="select" value={f.equip} onChange={(e) => f.setEquip(e.target.value as Equipment | 'all')} aria-label="Equipment">
        <option value="all">All equipment</option>
        {EQUIPS.map((x) => (
          <option key={x} value={x}>
            {EQUIPMENT_LABEL[x]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ExercisesView() {
  const { allExercises, data, openPage, createExercise } = useWorkouts();
  const f = useFiltered(allExercises);
  const [creating, setCreating] = useState(false);
  if (!data) return null;
  return (
    <div className="wk">
      <Filters f={f} idPrefix="lib" />
      {creating ? (
        <CustomExerciseForm
          initialName={f.q}
          onCancel={() => setCreating(false)}
          onSave={(d) => {
            const id = createExercise(d);
            setCreating(false);
            openPage({ kind: 'exercise', id });
          }}
        />
      ) : (
        <button className="addbtn" onClick={() => setCreating(true)} type="button">
          <IconPlus size={16} /> Custom exercise
        </button>
      )}
      <p className="fine">{f.list.length} exercises</p>
      <div className="exlist">
        {f.list.map((e) => {
          const rec = records(data.history, e.id);
          const last = exerciseSessions(data.history, e.id)[0];
          return (
            <button key={e.id} className="exrow" onClick={() => openPage({ kind: 'exercise', id: e.id })} type="button">
              <span className="exrow__badge">{MUSCLE_LABEL[e.muscle].slice(0, 2)}</span>
              <span className="exrow__main">
                <span className="exrow__name">{e.name}</span>
                <span className="fine">
                  {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
                  {last ? ` · last ${fmtMonthDay(last.workout.date)}` : ''}
                </span>
              </span>
              {rec.weight && rec.weight.weight > 0 && (
                <span className="exrow__pr">
                  <b className="num">{fmtKg(rec.weight.weight)}</b> kg
                </span>
              )}
              <IconChevron size={16} className="wrow__chev" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomExerciseForm({ initialName, onSave, onCancel }: { initialName: string; onSave: (d: Omit<ExerciseDef, 'id' | 'custom'>) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [muscle, setMuscle] = useState<Muscle>('chest');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  return (
    <form
      className="card customform"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), muscle, equipment, restSec: 90 });
      }}
    >
      <div className="eyebrow">New exercise</div>
      <input id="custom-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" required />
      <div className="customform__row">
        <select id="custom-muscle" className="select" value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)} aria-label="Muscle group">
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {MUSCLE_LABEL[m]}
            </option>
          ))}
        </select>
        <select id="custom-equip" className="select" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} aria-label="Equipment">
          {EQUIPS.map((x) => (
            <option key={x} value={x}>
              {EQUIPMENT_LABEL[x]}
            </option>
          ))}
        </select>
      </div>
      <div className="confirm__row">
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" type="submit">
          Create exercise
        </button>
      </div>
    </form>
  );
}

type Metric = 'weight' | 'e1rm' | 'volume' | 'reps';

export function ExerciseDetail({ id }: { id: string }) {
  const { data, defs, openPage, setExercisePref } = useWorkouts();
  const [metric, setMetric] = useState<Metric>('e1rm');
  const def = defs.get(id);
  const [notes, setNotes] = useState(def?.notes ?? '');
  if (!data || !def)
    return (
      <div className="wk">
        <BackBar onBack={() => openPage(null)} />
        <div className="na-block">Exercise not found.</div>
      </div>
    );
  const sessions = exerciseSessions(data.history, id);
  const rec = records(data.history, id);
  const chrono = [...sessions].reverse().slice(-24);
  const series = chrono.map((s) => {
    if (metric === 'weight') return Math.max(...s.sets.map((x) => x.weight ?? 0));
    if (metric === 'reps') return Math.max(...s.sets.map((x) => x.reps ?? 0));
    if (metric === 'volume') return s.sets.reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0);
    return Math.max(...s.sets.map((x) => e1rm(x.weight ?? 0, x.reps ?? 0)));
  });
  const last = sessions[0];
  const best = last ? last.sets.reduce((a, s) => ((s.weight ?? 0) > (a.weight ?? 0) ? s : a), last.sets[0]) : null;

  return (
    <div className="wk">
      <BackBar onBack={() => openPage(null)} />
      <header className="wd-head">
        <span className="eyebrow">
          {MUSCLE_LABEL[def.muscle]} · {EQUIPMENT_LABEL[def.equipment]}
        </span>
        <h1 className="screen__title">{def.name}</h1>
      </header>

      <div className="prgrid">
        <PRBox label="Heaviest" value={rec.weight ? `${fmtKg(rec.weight.weight)} kg` : '—'} sub={rec.weight ? `× ${rec.weight.reps} · ${fmtMonthDay(rec.weight.date)}` : 'No sets yet'} />
        <PRBox label="Est. 1RM" value={rec.e1rm ? `${fmtKg(Math.round(rec.e1rm.value * 2) / 2)} kg` : '—'} sub={rec.e1rm ? `${fmtKg(rec.e1rm.weight)} × ${rec.e1rm.reps}` : ''} />
        <PRBox label="Best set" value={rec.volume ? `${Math.round(rec.volume.value).toLocaleString('en-US')} kg` : '—'} sub={rec.volume ? `${fmtKg(rec.volume.weight)} × ${rec.volume.reps}` : ''} />
        <PRBox label="Most reps" value={rec.reps ? `${rec.reps.reps}` : '—'} sub={rec.reps ? `at ${fmtKg(rec.reps.weight)} kg` : ''} />
      </div>

      {last && best && (
        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Last workout</div>
            <span className="fine">{fmtMonthDay(last.workout.date)}</span>
          </div>
          <p className="lastline">
            <b className="num">
              {fmtKg(best.weight ?? 0)} kg × {best.reps}
            </b>
            <span className="fine"> · {last.sets.length} sets</span>
          </p>
        </section>
      )}

      <section className="card">
        <div className="row-between">
          <div className="eyebrow">Progression</div>
          <Segmented
            ariaLabel="Progression metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'e1rm', label: '1RM' },
              { value: 'weight', label: 'Weight' },
              { value: 'reps', label: 'Reps' },
              { value: 'volume', label: 'Volume' },
            ]}
          />
        </div>
        <TrendChart
          values={series}
          labels={chrono.length ? [fmtMonthDay(chrono[0].workout.date), fmtMonthDay(chrono[chrono.length - 1].workout.date)] : undefined}
          color="var(--accent)"
          height={150}
          format={(v) => (metric === 'volume' ? `${(v / 1000).toFixed(1)}t` : fmtKg(Math.round(v)))}
          ariaLabel={`${def.name} ${metric} per session`}
        />
        <p className="fine">Best value per session{metric === 'e1rm' ? ' · estimated 1RM = weight × (1 + reps ÷ 30)' : ''}.</p>
      </section>

      <section className="card">
        <div className="eyebrow">Settings</div>
        <label className="restsel restsel--row">
          <span>Default rest</span>
          <select id="ex-rest" value={def.restSec} onChange={(e) => setExercisePref(id, { restSec: Number(e.target.value) })}>
            {[30, 45, 60, 75, 90, 120, 150, 180, 240].map((s) => (
              <option key={s} value={s}>
                {fmtRest(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fine">Notes</span>
          <textarea id="ex-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => setExercisePref(id, { notes })} placeholder="Grip, seat height, cues" />
        </label>
      </section>

      <section>
        <h2 className="sec-title sec-title--sp">History</h2>
        {sessions.length ? (
          <div className="stack">
            {sessions.slice(0, 20).map((s) => (
              <button key={s.workout.id + s.entry.id} className="card exhist" onClick={() => openPage({ kind: 'workout', id: s.workout.id })} type="button">
                <span className="exhist__date">
                  <b>{toDate(s.workout.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b>
                  <span className="fine">{s.workout.name}</span>
                </span>
                <span className="exhist__sets">
                  {s.sets.map((x) => (
                    <span key={x.id} className="num">
                      {fmtKg(x.weight ?? 0)} × {x.reps}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="na-block">No history yet. Add {def.name} to a workout to start tracking it.</div>
        )}
      </section>
    </div>
  );
}

function PRBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card prcard prcard--static">
      <span className="prcard__name">{label}</span>
      <span className="prcard__val">
        <b className="num">{value}</b>
      </span>
      <span className="fine">{sub}</span>
    </div>
  );
}

/** Bottom-sheet exercise picker used by routines and the active workout. */
export function ExercisePicker() {
  const { picker, openPicker, allExercises } = useWorkouts();
  const f = useFiltered(allExercises);
  const [sel, setSel] = useState<string[]>([]);
  if (!picker) return null;
  const close = () => {
    setSel([]);
    openPicker(null);
  };
  const pick = (id: string) => {
    if (!picker.multi) {
      picker.onPick([id]);
      close();
      return;
    }
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  return (
    <div className="sheet-wrap sheet-wrap--top" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={picker.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <header className="sheet__head">
          <h2>{picker.title}</h2>
          <button
            className="btn btn--primary btn--sm"
            disabled={!sel.length}
            onClick={() => {
              picker.onPick(sel);
              close();
            }}
            type="button"
          >
            Add{sel.length ? ` (${sel.length})` : ''}
          </button>
        </header>
        <div className="sheet__body">
          <Filters f={f} idPrefix="pick" />
          <div className="exlist">
            {f.list.map((e) => {
              const on = sel.includes(e.id);
              return (
                <button key={e.id} className={`exrow ${on ? 'is-on' : ''}`} onClick={() => pick(e.id)} type="button" aria-pressed={on}>
                  <span className="exrow__badge">{on ? <IconCheck size={16} /> : MUSCLE_LABEL[e.muscle].slice(0, 2)}</span>
                  <span className="exrow__main">
                    <span className="exrow__name">{e.name}</span>
                    <span className="fine">
                      {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
