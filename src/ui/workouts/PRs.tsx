import React from 'react';
import { useWorkouts } from '../../workouts/store';
import { fmtKg, PR_LABEL, records } from '../../workouts/calc';
import { MUSCLE_LABEL } from '../../workouts/types';
import { fmtMonthDay } from '../../calc/stats';

export function PRsView() {
  const { data, defs, openPage } = useWorkouts();
  if (!data) return null;
  const ids = [...new Set(data.history.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
  const rows = ids
    .map((id) => ({ id, def: defs.get(id), rec: records(data.history, id) }))
    .filter((r) => r.def && r.rec.weight)
    .sort((a, b) => (b.rec.e1rm?.value ?? 0) - (a.rec.e1rm?.value ?? 0));
  const recent = [...data.history]
    .reverse()
    .flatMap((w) => w.prs.filter((p) => p.kind === 'weight' || p.kind === 'e1rm').map((p) => ({ ...p, date: w.date, wid: w.id })))
    .filter((p, i, arr) => arr.findIndex((x) => x.exerciseId === p.exerciseId && x.wid === p.wid) === i)
    .slice(0, 6);

  if (!rows.length) return <div className="na-block">Records appear automatically after your first logged sets.</div>;

  return (
    <div className="wk">
      {recent.length > 0 && (
        <section className="card prs-card">
          <div className="eyebrow">Recent PRs</div>
          {recent.map((p, i) => (
            <button key={i} className="prline prline--btn" onClick={() => openPage({ kind: 'workout', id: p.wid })} type="button">
              <span className="prtag">PR</span>
              <span className="prline__name">{defs.get(p.exerciseId)?.name}</span>
              <span className="fine">{fmtMonthDay(p.date)}</span>
              <b className="num">
                {fmtKg(p.weight)} × {p.reps}
              </b>
            </button>
          ))}
        </section>
      )}
      <section>
        <h2 className="sec-title sec-title--sp">Personal records</h2>
        <div className="prtable-wrap">
          <table className="prtable">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Heaviest</th>
                <th>e1RM</th>
                <th>Best set</th>
                <th>Reps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, def, rec }) => (
                <tr key={id} onClick={() => openPage({ kind: 'exercise', id })} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openPage({ kind: 'exercise', id })}>
                  <td>
                    <b>{def!.name}</b>
                    <span className="fine">{MUSCLE_LABEL[def!.muscle]}</span>
                  </td>
                  <td className="num">{fmtKg(rec.weight!.weight)} kg</td>
                  <td className="num">{rec.e1rm ? `${fmtKg(Math.round(rec.e1rm.value))} kg` : '—'}</td>
                  <td className="num">{rec.volume ? `${fmtKg(rec.volume.weight)}×${rec.volume.reps}` : '—'}</td>
                  <td className="num">{rec.reps?.reps ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">Detected automatically: {Object.values(PR_LABEL).join(', ').toLowerCase()}.</p>
      </section>
    </div>
  );
}
