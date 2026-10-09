import React, { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { useWorkouts } from '../../workouts/store';
import { fitbitAge } from '../../insights/bodyAge';
import { fmtNum } from '../../calc/stats';

export function AgeView() {
  const { analysis } = useApp();
  const { data } = useWorkouts();
  const [shown, setShown] = useState<number | null>(null);
  const r = analysis ? fitbitAge(analysis.ds, data?.history ?? []) : null;

  // count-up animation from real age to Fitbit Age
  useEffect(() => {
    if (!r) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return setShown(r.age);
    const from = r.realAge;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(from + (r.age - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [r?.age, r?.realAge]);

  if (!r) return null;
  const younger = r.delta < 0;
  const span = 12;
  const pos = (x: number) => ((Math.max(r.realAge - span, Math.min(r.realAge + span, x)) - (r.realAge - span)) / (2 * span)) * 100;
  const maxAbs = Math.max(1, ...r.factors.map((f) => Math.abs(f.years)));
  const helping = r.factors.filter((f) => f.years < 0);
  const costing = [...r.factors].filter((f) => f.years > 0).sort((a, b) => b.years - a.years);
  const change = r.previous != null ? r.age - r.previous : null;

  return (
    <div className="dash dash--health">
      <section className="card age-hero">
        <div className="eyebrow">Fitbit Age · FITBITRACK estimate</div>
        <div className="age-hero__num num">{(shown ?? r.realAge).toFixed(1)}</div>
        <p className="age-hero__line">
          {Math.abs(r.delta) < 0.5 ? (
            <>Your habits look right in line with your real age of {r.realAge}.</>
          ) : (
            <>
              Your habits look <em className={younger ? 'is-good' : 'is-bad'}>{fmtNum(Math.abs(r.delta), 1)} years {younger ? 'younger' : 'older'}</em> than your real age of {r.realAge}.
            </>
          )}
        </p>
        {change != null && Math.abs(change) >= 0.1 && (
          <p className="fine">
            {change < 0 ? '↓' : '↑'} {fmtNum(Math.abs(change), 1)} years compared with 3 months ago
          </p>
        )}
        <div className="age-scale" aria-hidden="true">
          <div className="age-scale__track" />
          <span className="age-scale__real" style={{ left: `${pos(r.realAge)}%` }}>
            <i />
            <b>Real {r.realAge}</b>
          </span>
          <span className={`age-scale__you ${younger ? 'is-good' : 'is-bad'}`} style={{ left: `${pos(r.age)}%` }}>
            <i />
            <b>You {fmtNum(r.age, 1)}</b>
          </span>
          <span className="age-scale__lo">{r.realAge - span}</span>
          <span className="age-scale__hi">{r.realAge + span}</span>
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <div className="eyebrow">What shapes your Fitbit Age</div>
          <span className="fine">last 30 days</span>
        </div>
        <div className="agef">
          {r.factors.map((f) => (
            <div key={f.key} className="agef__row">
              <div className="agef__text">
                <b>{f.label}</b>
                <span className="fine">
                  {f.value} · {f.reference}
                </span>
              </div>
              <div className="agef__bar" aria-hidden="true">
                <span className="agef__mid" />
                <span
                  className={`agef__fill ${f.years <= 0 ? 'is-good' : 'is-bad'}`}
                  style={f.years <= 0 ? { right: '50%', width: `${(Math.abs(f.years) / maxAbs) * 50}%` } : { left: '50%', width: `${(f.years / maxAbs) * 50}%` }}
                />
              </div>
              <span className={`agef__yrs num ${f.years < 0 ? 'is-good' : f.years > 0 ? 'is-bad' : ''}`}>
                {f.years === 0 ? '±0' : `${f.years > 0 ? '+' : '−'}${fmtNum(Math.abs(f.years), 1)}`} y
              </span>
            </div>
          ))}
        </div>
        <p className="fine">Green bars take years off; amber bars add years. Each factor is capped so no single number dominates.</p>
      </section>

      <section className="card">
        <div className="eyebrow">How to lower it</div>
        {costing.length ? (
          <ul className="age-tips">
            {costing.slice(0, 3).map((f) => (
              <li key={f.key}>
                <b>{f.label}</b>
                <span>{f.tip}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="age-tips__none">Nothing is adding years right now. Keep doing what you're doing.</p>
        )}
        {helping.length > 0 && (
          <p className="fine">
            Working in your favor: {helping.map((f) => f.label.toLowerCase()).join(', ')}.
          </p>
        )}
      </section>

      <p className="fine age-note">
        Fitbit Age is a FITBITRACK estimate built from your Fitbit data (VO₂ max, resting HR, HRV, sleep, steps, exercise) and your logged workouts, compared with typical values for your age. It's for motivation, not a medical or biological-age test.
        {r.skipped.length ? ` Not enough data yet for: ${r.skipped.join(', ')}.` : ''}
      </p>
    </div>
  );
}
