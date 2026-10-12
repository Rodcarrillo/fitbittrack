import React, { useState } from 'react';
import { useApp } from '../../state/store';
import { useWorkouts } from '../../workouts/store';
import { fmtKg, fmtShortDuration, liftProgress, muscleDistribution, periodStats, PR_LABEL, recentPRs, routineStats, todayISO, weekStreak, weeklySeries } from '../../workouts/calc';
import { addDays, fmtMonthDay, fmtNum, toDate } from '../../calc/stats';
import { TrendChart, Sparkline } from '../components/Charts';
import { SectionHead } from '../components/Cards';
import { IconDownload } from '../components/Icons';

const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
function Delta({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return <span className={`delta ${r > 0 ? 'delta--up' : r < 0 ? 'delta--down' : ''}`}>{r > 0 ? `↑ ${r}%` : r < 0 ? `↓ ${Math.abs(r)}%` : '='}</span>;
}

/** Upload button for the Hevy CSV, always one tap away at the top of the analysis. */
function HevyUpload() {
  const w = useWorkouts();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const last = w.data?.lastCsvImport;
  const onFile = async (f?: File) => {
    if (!f) return;
    setMsg(null);
    try {
      const r = w.importHevyCsv(await f.text());
      setMsg({ ok: true, text: `${r.added} new workouts${r.updated ? ` · ${r.updated} updated` : ''}${r.routines ? ` · ${r.routines} routines` : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read that file." });
    }
  };
  return (
    <section className="card hevyup">
      <div className="hevyup__row">
        <div>
          <b>Hevy workouts</b>
          <p className="fine">{last ? `Last upload ${new Date(last).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Hevy → Settings → Export & Import Data → Export Workouts'}</p>
        </div>
        <label className="btn btn--primary">
          <IconDownload size={16} /> Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {msg && <div className={msg.ok ? 'fine hevy-csv__ok' : 'notice'}>{msg.text}</div>}
      <button className="link fine" onClick={() => w.openPage({ kind: 'hevy' })} type="button">
        Have Hevy Pro? Set up automatic sync →
      </button>
    </section>
  );
}

export function AnalysisView() {
  const { raw } = useApp();
  const { data, defs, openPage, setView } = useWorkouts();
  if (!data) return null;
  const history = data.history;
  const today = raw?.today ?? todayISO();

  if (!history.length) {
    return (
      <div className="wk">
        <HevyUpload />
        <div className="na-block">Upload your Hevy CSV to see weight lifted, progress per exercise, PRs and more.</div>
      </div>
    );
  }

  const m0 = periodStats(history, addDays(today, -29), today);
  const m1 = periodStats(history, addDays(today, -59), addDays(today, -30));
  const weeks = weeklySeries(history, today, 12);
  const avgPerWeek = weeks.reduce((a, x) => a + x.workouts, 0) / weeks.length;
  const streak = weekStreak(history, today);
  const lifts = liftProgress(history, defs, addDays(today, -89));
  const prs = recentPRs(history, addDays(today, -29)).filter((p) => p.kind === 'weight' || p.kind === 'e1rm');
  const prsUnique = prs.filter((p, i) => prs.findIndex((x) => x.exerciseId === p.exerciseId) === i).slice(0, 8);
  const muscles = muscleDistribution(history, defs, addDays(today, -29));
  const routines = routineStats(history, data.routines).filter((r) => r.times > 0);
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  history.filter((w) => w.date >= addDays(today, -89)).forEach((w) => dayCounts[toDate(w.date).getDay()]++);
  const topDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayCounts.indexOf(Math.max(...dayCounts))];
  const totalAll = history.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.reduce((c, s) => c + (s.completed ? (s.weight ?? 0) * (s.reps ?? 0) : 0), 0), 0), 0);
  const lastW = history[history.length - 1];
  const daysSince = Math.round((toDate(today).getTime() - toDate(lastW.date).getTime()) / 86400000);

  return (
    <div className="wk">
      <HevyUpload />

      <section className="card">
        <div className="row-between">
          <div className="eyebrow">Last 30 days</div>
          <span className="fine">vs previous 30</span>
        </div>
        <div className="statgrid">
          <Stat label="Workouts" value={String(m0.workouts)} delta={pct(m0.workouts, m1.workouts)} />
          <Stat label="Weight lifted" value={fmtNum(m0.volume)} unit="kg" delta={pct(m0.volume, m1.volume)} />
          <Stat label="Sets" value={String(m0.sets)} delta={pct(m0.sets, m1.sets)} />
          <Stat label="Reps" value={fmtNum(m0.reps)} delta={pct(m0.reps, m1.reps)} />
          <Stat label="Avg session" value={m0.workouts ? fmtShortDuration(m0.durationSec / m0.workouts) : '—'} />
          <Stat label="Per week" value={avgPerWeek.toFixed(1)} unit="avg" />
        </div>
        <p className="fine">
          {streak} week streak · usually {topDay} · last workout {daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`} · {fmtNum(totalAll / 1000)} t lifted in total
        </p>
      </section>

      <section className="card">
        <div className="eyebrow">Weight lifted per week · 12 weeks</div>
        <TrendChart
          values={weeks.map((x) => x.volume / 1000)}
          labels={[fmtMonthDay(weeks[0].week), fmtMonthDay(weeks[weeks.length - 1].week)]}
          color="var(--accent)"
          bars
          height={140}
          format={(v) => `${v.toFixed(0)}t`}
          ariaLabel="Weekly training volume in tonnes"
        />
        <p className="fine">t = 1,000 kg (weight × reps of every completed set).</p>
      </section>

      {lifts.length > 0 && (
        <section>
          <SectionHead title="Strength progress · 90 days" action="All exercises" onAction={() => setView('exercises')} />
          <div className="stack">
            {lifts.map((l) => (
              <button key={l.id} className="card liftrow" onClick={() => openPage({ kind: 'exercise', id: l.id })} type="button">
                <span className="liftrow__body">
                  <b>{l.name}</b>
                  <span className="fine">
                    Best {fmtKg(l.best.top.weight)} kg × {l.best.top.reps} · e1RM {fmtKg(Math.round(l.best.e1rm))} kg · {l.sessions} sessions
                  </span>
                </span>
                <span className="liftrow__spark">
                  <Sparkline values={l.series.map((x) => x.e1rm)} color="var(--accent)" height={32} />
                </span>
                <Delta v={l.changePct} />
              </button>
            ))}
          </div>
          <p className="fine">Change compares your estimated 1-rep max (e1RM) in the first 3 vs the last 3 sessions of the period.</p>
        </section>
      )}

      <section className="card prs-card">
        <div className="row-between">
          <div className="eyebrow">PRs · last 30 days</div>
          <button className="link fine" onClick={() => setView('prs')} type="button">
            All records →
          </button>
        </div>
        {prsUnique.length ? (
          prsUnique.map((p, i) => (
            <button key={i} className="prline prline--btn" onClick={() => openPage({ kind: 'exercise', id: p.exerciseId })} type="button">
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

      {muscles.length > 0 && (
        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Muscle balance</div>
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
          {muscles.length > 1 && <p className="fine">Least trained: {muscles[muscles.length - 1].group.toLowerCase()} ({muscles[muscles.length - 1].sets} sets).</p>}
        </section>
      )}

      {routines.length > 0 && (
        <section>
          <SectionHead title="Routines" action="Details" onAction={() => setView('routines')} />
          <div className="routine-grid">
            {routines.map((r) => (
              <article key={r.routine.id} className="card routine">
                <div className="row-between">
                  <h3>{r.routine.name}</h3>
                  <Delta v={r.trendPct} />
                </div>
                <span className="fine">
                  {r.times}× · last {r.last ? fmtMonthDay(r.last) : '—'} · ~{Math.round(r.avgMin)} min · avg {fmtNum(r.avgVol)} kg
                </span>
                <Sparkline values={r.volumes} color="var(--accent)" height={30} />
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: number | null }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        <b className="num">{value}</b>
        {unit && <span>{unit}</span>}
      </span>
      {delta !== undefined && <Delta v={delta ?? null} />}
    </div>
  );
}
