import React, { useEffect, useState } from 'react';
import { api } from '../../auth/session';
import { useWorkouts } from '../../workouts/store';
import { useWorkoutHeart } from '../../workouts/hr';
import { fmtShortDuration, workoutVolume } from '../../workouts/calc';
import { useApp } from '../../state/store';
import { SERVER_MODE } from '../../data/cloudSync';
import { ScoreRing } from '../components/ScoreRing';
import { BaselineComparison } from '../components/Cards';
import { IconArrowRight, IconMoon } from '../components/Icons';
import { outlook, metricComparison } from '../../insights/engine';
import { tierLabel, tonightPlan } from '../../calc/scores';
import { fmtClock, fmtDuration, fmtLongDate, fmtNum, toDate } from '../../calc/stats';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const googleResult = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('google') : null;

export function TodayScreen() {
  const { analysis: a, setTab, setHealthView } = useApp();
  const [needsReconnect, setNeedsReconnect] = useState(false);
  useEffect(() => {
    if (!SERVER_MODE) return;
    api<{ needsReconnect?: boolean }>('/auth/session')
      .then((r) => setNeedsReconnect(!!r.needsReconnect))
      .catch(() => {});
  }, []);
  if (!a) return null;
  const { ds, today } = a;
  const td = ds.days[ds.days.length - 1];
  const r = today.readiness;
  const s = today.sleep;
  const ol = outlook(a);
  const plan = tonightPlan(ds, a.scores);
  const rhr = metricComparison(ds, 'restingHr');
  const hrv = metricComparison(ds, 'hrv');

  return (
    <div className="screen today">
      <header className="hello">
        <div className="hello__date">{fmtLongDate(ds.today)}</div>
        <h1 className="hello__title">
          {greeting()}, {ds.profile.name}
        </h1>
              </header>

      {SERVER_MODE && !ds.source.isSample && needsReconnect && (
        <section className="card connect-banner">
          <div>
            <b>Sync your band battery</b>
            <p className="fine">Google needs one more permission (devices) to show your Fitbit battery. Reconnect and accept all the boxes.</p>
          </div>
          <a className="btn btn--primary btn--sm" href="/auth/google/start">
            Reconnect Google Health
          </a>
        </section>
      )}

      {SERVER_MODE && ds.source.isSample && (
        <section className="card connect-banner">
          <div>
            <b>Connect your Fitbit</b>
            <p className="fine">
              {googleResult === 'denied'
                ? 'Google sign-in was cancelled. Try again whenever you are ready.'
                : googleResult === 'failed'
                  ? "Google didn't finish the connection. Try again in a moment."
                  : "You're seeing sample data. Connect Google Health to load your real sleep, heart and activity data."}
            </p>
          </div>
          <a className="btn btn--primary btn--sm" href="/auth/google/start">
            Connect Google Health
          </a>
        </section>
      )}
      <div className="today-grid">
        <section className="card rings-card" aria-label="FITBITRACK scores">
          <div className="rings">
            <ScoreRing
              value={r?.score ?? null}
              color="var(--ready)"
              label="Readiness"
              caption={r ? tierLabel[r.tier] : 'No data'}
              onClick={() => {
                setHealthView('recovery');
                setTab('health');
              }}
              ariaLabel={`Readiness ${r?.score ?? 'not available'}. Open recovery details`}
            />
            <ScoreRing
              value={s?.score ?? null}
              color="var(--sleep)"
              label="Sleep"
              inner={s ? tierLabel[s.tier] : undefined}
              caption={s ? fmtDuration(s.session.minutesAsleep) : 'No data'}
              captionColor="var(--muted)"
              onClick={() => {
                setHealthView('sleep');
                setTab('health');
              }}
              ariaLabel={`Sleep score ${s?.score ?? 'not available'}. Open sleep details`}
            />
            <ScoreRing
              value={ds.availability.exercise ? today.load.score : null}
              color="var(--train)"
              label="Training Load"
              caption={ds.availability.exercise ? today.load.level : 'No data'}
              onClick={() => setTab('train')}
              ariaLabel={`Training load ${today.load.score}. Open workouts`}
            />
          </div>
          <p className="outlook__headline outlook__headline--sm">
            {ol.headline}
            {ol.highlight && <em>{ol.highlight}</em>}
            {(ol as any).tail}
          </p>
        </section>

        <section className="card snapshot" aria-label="Health snapshot">
          <div className="snapshot__grid">
            <Snap label="Resting HR" value={td.restingHr} unit="bpm" cmp={rhr && <BaselineComparison delta={rhr.delta} unit="bpm" better="lower" suffix="" />} />
            <Snap label="HRV" value={td.hrv} unit="ms" cmp={hrv && <BaselineComparison delta={hrv.pct} pct better="higher" suffix="" />} />
            <Snap label="Steps" value={td.steps} cmp={td.steps != null && <span className="snap__goal">{fmtNum((td.steps / ds.profile.stepGoal) * 100)}% of goal</span>} />
            <Snap label="Calories" value={td.calories} unit="kcal" />
          </div>
        </section>

        <LastWorkoutCard />

        <section className="card tonight">
          <div className="tonight__head">
            <IconMoon size={18} className="tonight__icon" />
            <span className="eyebrow">Tonight</span>
          </div>
          <div className="tonight__row">
            <div>
              <div className="tonight__time num">{fmtClock(plan.bedMin)}</div>
              <div className="tonight__label">Bedtime</div>
            </div>
            <span className="tonight__line" aria-hidden="true" />
            <div>
              <div className="tonight__time num">{fmtClock(plan.wakeMin)}</div>
              <div className="tonight__label">Wake</div>
            </div>
          </div>
          <p className="tonight__note">For {fmtDuration(plan.needMin)} of sleep.</p>
        </section>
      </div>
    </div>
  );
}

/** Latest Hevy workout with the heart rate your Fitbit measured during it. */
function LastWorkoutCard() {
  const { raw, setTab } = useApp();
  const { data, openPage } = useWorkouts();
  const w = data?.history[data.history.length - 1] ?? null;
  const h = useWorkoutHeart(w, raw);
  if (!w)
    return (
      <section className="card lastw">
        <div className="eyebrow">Last workout</div>
        <p className="fine">Upload your Hevy CSV in Workouts to see your sessions here with your Fitbit heart rate.</p>
        <button className="cta cta--ghost" onClick={() => setTab('train')} type="button">
          Go to Workouts <IconArrowRight size={16} />
        </button>
      </section>
    );
  return (
    <button
      className="card lastw lastw--btn"
      onClick={() => {
        setTab('train');
        openPage({ kind: 'workout', id: w.id });
      }}
      type="button"
    >
      <div className="row-between">
        <span className="eyebrow">Last workout · Hevy</span>
        <span className="fine">{toDate(w.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      <b className="lastw__name">{w.name}</b>
      <div className="lastw__stats">
        <span>
          <b className="num">{fmtShortDuration(w.durationSec)}</b> time
        </span>
        <span>
          <b className="num">{fmtNum(workoutVolume(w))}</b> kg
        </span>
        <span>
          <b className="num">{h.avg ?? '—'}</b> avg bpm
        </span>
        <span>
          <b className="num">{h.kcal ?? '—'}</b> kcal
        </span>
      </div>
    </button>
  );
}

function Snap({ label, value, unit, cmp }: { label: string; value: number | null; unit?: string; cmp?: React.ReactNode }) {
  return (
    <div className="snap">
      <div className="snap__label">{label}</div>
      {value == null ? (
        <div className="snap__na">Not available</div>
      ) : (
        <div className="snap__value">
          <span className="num">{fmtNum(value)}</span>
          {unit && <span className="snap__unit">{unit}</span>}
        </div>
      )}
      {value != null && cmp && <div className="snap__cmp">{cmp}</div>}
    </div>
  );
}
