import React, { useState } from 'react';
import { useWorkouts } from '../../workouts/store';
import { estimateRoutineMin, routineStats, uid } from '../../workouts/calc';
import { Sparkline } from '../components/Charts';
import type { Routine } from '../../workouts/types';
import { MUSCLE_LABEL } from '../../workouts/types';
import { BackBar } from './WorkoutsTab';
import { IconPlus, IconTrash } from '../components/Icons';

export function RoutinesView() {
  const { data, defs } = useWorkouts();
  if (!data) return null;
  const stats = routineStats(data.history, data.routines);
  if (!stats.length) return <div className="na-block">Upload your Hevy CSV in Gym analysis: workouts you repeat (Push, Pull…) show up here as routines.</div>;
  return (
    <div className="wk">
      <p className="fine">Built from your Hevy history. Each card shows how often you do it and how its total weight is trending.</p>
      <div className="routine-grid">
        {stats.map(({ routine: r, times, last, avgVol, avgMin, trendPct, volumes }) => (
          <article key={r.id} className="card routine">
            <div className="row-between">
              <h3>{r.name}</h3>
              {trendPct != null && <span className={`delta ${trendPct > 1 ? 'delta--up' : trendPct < -1 ? 'delta--down' : ''}`}>{trendPct > 0 ? '↑' : trendPct < 0 ? '↓' : ''} {Math.abs(Math.round(trendPct))}%</span>}
            </div>
            <span className="fine">
              {times}× done · last {last ? new Date(last + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'} · ~{Math.round(avgMin)} min · avg {Math.round(avgVol).toLocaleString('en-US')} kg
            </span>
            <Sparkline values={volumes} color="var(--accent)" height={30} />
            <p className="routine__list">{r.items.map((it) => `${it.sets}× ${defs.get(it.exerciseId)?.name ?? it.exerciseId}`).join(' · ')}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240];
export const fmtRest = (s: number) => (s < 60 ? `${s}s` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60} min`);

export function RoutineEditor({ id }: { id: string | null }) {
  const { data, defs, saveRoutine, deleteRoutine, openPage, openPicker, start, active } = useWorkouts();
  const existing = data?.routines.find((r) => r.id === id);
  const [draft, setDraft] = useState<Routine>(() => existing ?? { id: `r-${uid()}`, name: '', notes: '', items: [], updatedAt: new Date().toISOString() });
  const [confirmDel, setConfirmDel] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<Routine>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.items.length) return;
    const items = [...draft.items];
    [items[i], items[j]] = [items[j], items[i]];
    set({ items });
  };
  const save = () => {
    if (!draft.name.trim()) return setError('Give the routine a name.');
    if (!draft.items.length) return setError('Add at least one exercise.');
    setError('');
    saveRoutine({ ...draft, name: draft.name.trim() });
    setSaved(true);
  };

  return (
    <div className="wk">
      <BackBar
        title="Routines"
        onBack={() => openPage(null)}
        right={
          <button className="btn btn--primary btn--sm" onClick={save} type="button">
            {saved ? 'Saved' : 'Save'}
          </button>
        }
      />
      <label className="field">
        <span className="eyebrow">Routine name</span>
        <input id="routine-name" className="input input--title" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Push, Upper Body" />
      </label>
      <label className="field">
        <span className="eyebrow">Notes</span>
        <textarea id="routine-notes" className="textarea" rows={2} value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Cues, tempo, warm-up reminders" />
      </label>

      <div className="eyebrow eyebrow--sp">Exercises</div>
      <div className="stack">
        {draft.items.map((it, i) => {
          const def = defs.get(it.exerciseId);
          return (
            <div key={`${it.exerciseId}-${i}`} className="card ritem">
              <div className="ritem__top">
                <span className="ritem__idx num">{i + 1}</span>
                <span className="ritem__name">
                  {def?.name ?? it.exerciseId}
                  <span className="fine">{def ? MUSCLE_LABEL[def.muscle] : ''}</span>
                </span>
                <span className="ritem__order">
                  <button className="icon-btn icon-btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" type="button">
                    ↑
                  </button>
                  <button className="icon-btn icon-btn--sm" onClick={() => move(i, 1)} disabled={i === draft.items.length - 1} aria-label="Move down" type="button">
                    ↓
                  </button>
                  <button className="icon-btn icon-btn--sm" onClick={() => set({ items: draft.items.filter((_, k) => k !== i) })} aria-label="Remove exercise" type="button">
                    <IconTrash size={14} />
                  </button>
                </span>
              </div>
              <div className="ritem__controls">
                <span className="stepper">
                  <button onClick={() => set({ items: draft.items.map((x, k) => (k === i ? { ...x, sets: Math.max(1, x.sets - 1) } : x)) })} aria-label="Fewer sets" type="button">
                    −
                  </button>
                  <span className="num">{it.sets} sets</span>
                  <button onClick={() => set({ items: draft.items.map((x, k) => (k === i ? { ...x, sets: Math.min(10, x.sets + 1) } : x)) })} aria-label="More sets" type="button">
                    +
                  </button>
                </span>
                <label className="restsel">
                  <span className="fine">Rest</span>
                  <select id={`rest-${i}`} value={it.restSec} onChange={(e) => set({ items: draft.items.map((x, k) => (k === i ? { ...x, restSec: Number(e.target.value) } : x)) })}>
                    {REST_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {fmtRest(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
        <button
          className="addbtn"
          onClick={() =>
            openPicker({
              title: 'Add exercises',
              multi: true,
              onPick: (ids) => set({ items: [...draft.items, ...ids.map((x) => ({ exerciseId: x, sets: 3, restSec: defs.get(x)?.restSec ?? 90 }))] }),
            })
          }
          type="button"
        >
          <IconPlus size={16} /> Add exercises
        </button>
      </div>

      {error && <div className="notice">{error}</div>}

      <div className="row-actions">
        <button
          className="btn btn--primary btn--block"
          disabled={!!active}
          onClick={() => {
            save();
            if (draft.name.trim() && draft.items.length) setTimeout(() => start(draft.id), 0);
          }}
          type="button"
        >
          Save & start
        </button>
        {existing &&
          (confirmDel ? (
            <div className="confirm">
              <p>Delete “{existing.name}”? Past workouts stay in your history.</p>
              <div className="confirm__row">
                <button className="btn btn--ghost" onClick={() => setConfirmDel(false)} type="button">
                  Cancel
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    deleteRoutine(existing.id);
                    openPage(null);
                  }}
                  type="button"
                >
                  Delete routine
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn--ghost btn--block btn--dangertext" onClick={() => setConfirmDel(true)} type="button">
              Delete routine
            </button>
          ))}
      </div>
    </div>
  );
}
