import React from 'react';
import { useApp } from '../../state/store';
import { SERVER_MODE } from '../../data/cloudSync';
import { ScoreRing } from '../components/ScoreRing';
import { ActivityCard, BaselineComparison, CoachCard, InsightCard, SectionHead, SleepActivityCard } from '../components/Cards';
import { IconArrowRight, IconBook, IconMoon, IconSun } from '../components/Icons';
import { outlook, metricComparison, TAG_LABEL } from '../../insights/engine';
import { biggestOpportunity } from '../../insights/coach';
import { sessionTrimp, tierLabel, tonightPlan } from '../../calc/scores';
import { fmtClock, fmtDuration, fmtLongDate, fmtNum } from '../../calc/stats';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const googleResult = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('google') : null;

export function TodayScreen() {
  const { analysis: a, setTab, setHealthView, openSheet, todayJournal } = useApp();
  if (!a) return null;
  const { ds, today } = a;
  const td = ds.days[ds.days.length - 1];
  const r = today.readiness;
  const s = today.sleep;
  const ol = outlook(a);
  const plan = tonightPlan(ds, a.scores);
  const rhr = metricComparison(ds, 'restingHr');
  const hrv = metricComparison(ds, 'hrv');
  const best = r ? [...r.contributors].sort((x, y) => y.impactPct - x.impactPct)[0] : null;

  return (
    <div className="screen today">
      <header className="hello">
        <div className="hello__date">{fmtLongDate(ds.today)}</div>
        <h1 className="hello__title">
          {greeting()}, {ds.profile.name}
        </h1>
        <p className="hello__sub">Here's how you're doing today.</p>
      </header>

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
      <div className="dash">
        <section className="card rings-card dash__rings" aria-label="FITBITRACK scores">
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
              ariaLabel={`Training load ${today.load.score}. Open training`}
            />
          </div>
          <p className="rings__note">FITBITRACK SCORES · calculated from your Fitbit data</p>
        </section>

        <section className="card snapshot dash__snap" aria-label="Health snapshot">
          <div className="eyebrow">Health snapshot</div>
          <div className="snapshot__grid">
            <Snap label="Resting HR" value={td.restingHr} unit="bpm" cmp={rhr && <BaselineComparison delta={rhr.delta} unit="bpm" better="lower" suffix="" />} />
            <Snap label="HRV" value={td.hrv} unit="ms" cmp={hrv && <BaselineComparison delta={hrv.pct} pct better="higher" suffix="" />} />
            <Snap label="Steps" value={td.steps} cmp={td.steps != null && <span className="snap__goal">{fmtNum((td.steps / ds.profile.stepGoal) * 100)}% of goal</span>} />
            <Snap label="Calories" value={td.calories} unit="kcal" />
          </div>
        </section>

        <section className="card outlook dash__outlook">
          <div className="outlook__head">
            <IconSun size={18} className="outlook__icon" />
            <span className="eyebrow">Today's outlook</span>
          </div>
          <p className="outlook__headline">
            {ol.headline}
            {ol.highlight && <em>{ol.highlight}</em>}
            {(ol as any).tail}
          </p>
          <p className="outlook__body">{ol.body}</p>
          <button className="cta" onClick={() => openSheet('insights')} type="button">
            View insights <IconArrowRight size={16} />
          </button>
        </section>

        <div className="dash__coach">
          <CoachCard
            lead={r ? (r.score >= 80 ? "You're looking good today." : r.score >= 60 ? "You're in decent shape today." : 'Take it easier today.') : 'Let’s build your baseline.'}
            lines={[
              r ? (
                <>
                  Your readiness is <b>{r.score}/100</b>.
                </>
              ) : (
                'Readiness needs HRV or resting heart rate.'
              ),
              best ? (
                <>
                  The biggest positive contributor is your <b>{best.label === 'HRV' ? 'HRV' : best.label.toLowerCase()}</b>, which is {fmtNum(Math.abs(best.impactPct))}% {best.impactPct >= 0 ? 'better than' : 'below'} your baseline.
                </>
              ) : null,
              <>
                Your biggest opportunity is <b>{biggestOpportunity(a)}</b>.
              </>,
            ].filter(Boolean)}
            onAsk={() => openSheet('coach')}
          />
        </div>

        <section className="dash__activity">
          <SectionHead title="Today's activity" action="Train" onAction={() => setTab('train')} />
          <div className="stack">
            {s && <SleepActivityCard start={s.session.start} end={s.session.end} minutes={s.session.minutesAsleep} />}
            {today.load.sessions.map((e) => (
              <ActivityCard key={e.id} e={e} trimp={sessionTrimp(e, ds.profile.maxHr)} />
            ))}
            {!today.load.sessions.length && <div className="na-block">No workouts logged yet today.</div>}
          </div>
        </section>

        <section className="card tonight dash__tonight">
          <div className="tonight__head">
            <IconMoon size={18} className="tonight__icon" />
            <span className="eyebrow">Tonight's sleep</span>
          </div>
          <div className="tonight__row">
            <div>
              <div className="tonight__time num">{fmtClock(plan.bedMin)}</div>
              <div className="tonight__label">Recommended bedtime</div>
            </div>
            <span className="tonight__line" aria-hidden="true" />
            <div>
              <div className="tonight__time num">{fmtClock(plan.wakeMin)}</div>
              <div className="tonight__label">Recommended wake</div>
            </div>
          </div>
          <p className="tonight__note">
            Aims for {fmtDuration(plan.needMin)} of sleep, based on your goal{today.load.score >= 70 ? ", today's training" : ''} and recent nights.
          </p>
        </section>

        <section className="card journal-cta dash__journal">
          <div className="tonight__head">
            <IconBook size={18} className="journal-cta__icon" />
            <span className="eyebrow">Journal</span>
          </div>
          <p className="journal-cta__text">{todayJournal.tags.length ? 'Logged today:' : 'Log what might affect tonight’s sleep and tomorrow’s readiness.'}</p>
          {todayJournal.tags.length > 0 && (
            <div className="chips chips--static">
              {todayJournal.tags.map((t) => (
                <span key={t} className="chip is-on">
                  {TAG_LABEL[t]}
                </span>
              ))}
            </div>
          )}
          <button className="cta cta--ghost" onClick={() => openSheet('journal')} type="button">
            {todayJournal.tags.length ? 'Edit journal' : 'Log today'} <IconArrowRight size={16} />
          </button>
        </section>

        <section className="dash__insights">
          <SectionHead title="Top insights" action="All" onAction={() => openSheet('insights')} />
          <div className="stack">
            {a.insights.slice(0, 3).map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
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
