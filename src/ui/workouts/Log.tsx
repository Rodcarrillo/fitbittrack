import React, { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { useNow, useWorkouts } from '../../workouts/store';
import { fmtClockDuration, fmtShortDuration, matchFitbitSession, todayISO, weekStart } from '../../workouts/calc';
import type { ActivitySession, SessionKind } from '../../workouts/types';
import { toDate, addDays } from '../../calc/stats';
import { IconBall, IconBike, IconDumbbell, IconLotus, IconRun, IconSpark, IconTrash, IconWalk } from '../components/Icons';
import { HeartRateZones } from '../components/Cards';

export const KINDS: { kind: SessionKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'gym', label: 'Gym', icon: <IconDumbbell size={22} /> },
  { kind: 'run', label: 'Run', icon: <IconRun size={22} /> },
  { kind: 'walk', label: 'Walk', icon: <IconWalk size={22} /> },
  { kind: 'bike', label: 'Bike', icon: <IconBike size={22} /> },
  { kind: 'basketball', label: 'Basketball', icon: <IconBall size={22} /> },
  { kind: 'football', label: 'Football', icon: <IconBall size={22} /> },
  { kind: 'hiit', label: 'HIIT', icon: <IconSpark size={22} /> },
  { kind: 'yoga', label: 'Yoga', icon: <IconLotus size={22} /> },
  { kind: 'swim', label: 'Swim', icon: <IconWalk size={22} /> },
  { kind: 'other', label: 'Other', icon: <IconSpark size={22} /> },
];
const kindOf = (k: SessionKind) => KINDS.find((x) => x.kind === k) ?? KINDS[KINDS.length - 1];

/** "Log" view: start a timed session (Apple Watch style) and see logged sessions with Fitbit HR/calories. */
export function LogView() {
  const { raw } = useApp();
  const w = useWorkouts();
  const { data, live } = w;
  const [kind, setKind] = useState<SessionKind>('gym');
  const [label, setLabel] = useState<string>('');
  if (!data) return null;
  const sessions = data.sessions ?? [];
  const today = raw?.today ?? todayISO();
  const wk = weekStart(today);
  const thisWeek = sessions.filter((s) => s.date >= wk);
  const routineNames = data.routines.map((r) => r.name);
  const name = kind === 'gym' && label ? label : kindOf(kind).label;

  return (
    <div className="wk">
      {live ? (
        <LiveCard />
      ) : (
        <section className="card logstart">
          <div className="eyebrow">Log exercise</div>
          <div className="kindgrid" role="radiogroup" aria-label="Activity type">
            {KINDS.map((k) => (
              <button key={k.kind} className={`kindbtn ${kind === k.kind ? 'is-on' : ''}`} onClick={() => setKind(k.kind)} role="radio" aria-checked={kind === k.kind} type="button">
                {k.icon}
                <span>{k.label}</span>
              </button>
            ))}
          </div>
          {kind === 'gym' && routineNames.length > 0 && (
            <div className="chips chips--scroll" aria-label="Session name">
              <button className={`chip ${!label ? 'is-on' : ''}`} onClick={() => setLabel('')} type="button">
                Gym
              </button>
              {routineNames.map((n) => (
                <button key={n} className={`chip ${label === n ? 'is-on' : ''}`} onClick={() => setLabel(n)} type="button">
                  {n}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn--primary btn--block btn--xl" onClick={() => w.startSession(kind, name)} type="button">
            Start {name}
          </button>
          <p className="fine">Timer only. Heart rate, calories and zones are added from your Fitbit after it syncs.</p>
        </section>
      )}

      <section className="card">
        <div className="eyebrow">This week</div>
        <div className="statgrid statgrid--3">
          <div className="stat">
            <span className="stat__label">Sessions</span>
            <span className="stat__value">
              <b className="num">{thisWeek.length}</b>
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Time</span>
            <span className="stat__value">
              <b className="num">{fmtShortDuration(thisWeek.reduce((a, s) => a + s.durationSec, 0))}</b>
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Calories</span>
            <span className="stat__value">
              <b className="num">{Math.round(thisWeek.reduce((a, s) => a + (matchFitbitSession(raw, s)?.calories ?? 0), 0)).toLocaleString('en-US')}</b>
              <span>kcal</span>
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="eyebrow eyebrow--sp">Logged sessions</div>
        <div className="stack">
          {[...sessions].reverse().slice(0, 20).map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
          {!sessions.length && <div className="na-block">Start a session above. It will appear here with your Fitbit heart rate and calories.</div>}
        </div>
      </section>
      {sessions.length > 0 && <p className="fine">Sessions older than {fmtDay(addDays(today, -120))} may not have Fitbit data loaded.</p>}
    </div>
  );
}

const fmtDay = (d: string) => toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function SessionRow({ s }: { s: ActivitySession }) {
  const { raw } = useApp();
  const w = useWorkouts();
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(false);
  const fb = matchFitbitSession(raw, s);
  const k = kindOf(s.kind);
  return (
    <div className="card sessrow">
      <button className="sessrow__main" onClick={() => setOpen(!open)} type="button" aria-expanded={open}>
        <span className="sessrow__icon">{k.icon}</span>
        <span className="sessrow__body">
          <b>{s.name}</b>
          <span className="fine">
            {fmtDay(s.date)} · {fmtTime(s.startedAt)} · {fmtShortDuration(s.durationSec)}
          </span>
        </span>
        <span className="sessrow__fb">
          {fb ? (
            <>
              <span>
                <b className="num">{fb.avgHr ?? '—'}</b> avg bpm
              </span>
              <span>
                <b className="num">{fb.calories != null ? Math.round(fb.calories) : '—'}</b> kcal
              </span>
            </>
          ) : (
            <span className="fine">Waiting for Fitbit</span>
          )}
        </span>
      </button>
      {open && (
        <div className="sessrow__detail">
          {fb ? (
            <>
              <div className="statgrid statgrid--3">
                <div className="stat">
                  <span className="stat__label">Avg HR</span>
                  <span className="stat__value">
                    <b className="num">{fb.avgHr ?? '—'}</b>
                    <span>bpm</span>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Max HR</span>
                  <span className="stat__value">
                    <b className="num">{fb.maxHr ?? '—'}</b>
                    <span>bpm</span>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Active zone min</span>
                  <span className="stat__value">
                    <b className="num">{fb.azm ?? '—'}</b>
                  </span>
                </div>
              </div>
              {fb.zones && <HeartRateZones zones={fb.zones} />}
              <p className="fine">From Fitbit: "{fb.name}", {fb.durationMin} min.</p>
            </>
          ) : (
            <p className="fine">No matching Fitbit activity yet. Start the same activity on your Fitbit (or let it auto-detect), sync, then pull down to refresh.</p>
          )}
          {s.notes && <p className="fine">{s.notes}</p>}
          {del ? (
            <div className="confirm__row">
              <button className="btn btn--ghost btn--sm" onClick={() => setDel(false)} type="button">
                Keep
              </button>
              <button className="btn btn--danger btn--sm" onClick={() => w.deleteSession(s.id)} type="button">
                Delete session
              </button>
            </div>
          ) : (
            <button className="btn btn--ghost btn--sm btn--dangertext" onClick={() => setDel(true)} type="button">
              <IconTrash size={14} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LiveCard() {
  const w = useWorkouts();
  const now = useNow(1000);
  const l = w.live!;
  return (
    <button className="card wk-live" onClick={() => w.setSessionOpen(true)} type="button">
      <span className="live-dot" aria-hidden="true" />
      <span className="wk-live__body">
        <span className="eyebrow">{l.pausedAt ? 'Paused' : 'In progress'}</span>
        <span className="wk-live__name">{l.name}</span>
      </span>
      <span className="wk-live__time num">{fmtClockDuration(w.sessionElapsed(l, now))}</span>
      <span className="btn btn--primary btn--sm">Open</span>
    </button>
  );
}

/** Full-screen timer (Apple Watch-like). Rendered above the app while a session is open. */
export function LiveSessionScreen() {
  const w = useWorkouts();
  const { raw } = useApp();
  const now = useNow(250);
  const [ask, setAsk] = useState<null | 'finish' | 'discard'>(null);
  const [notes, setNotes] = useState('');
  const l = w.live;
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);
  if (!l) return null;
  const sec = w.sessionElapsed(l, now);
  const k = kindOf(l.kind);
  const rhr = raw?.days[raw.days.length - 1]?.restingHr;
  return (
    <div className="lv" role="dialog" aria-modal="true" aria-label={`${l.name} session`}>
      <header className="lv__top">
        <button className="icon-btn" onClick={() => w.setSessionOpen(false)} aria-label="Minimize" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="lv__kind">
          {k.icon} {l.name}
        </span>
        <span style={{ width: 40 }} />
      </header>
      <div className="lv__center">
        <div className={`lv__time num ${l.pausedAt ? 'is-paused' : ''}`}>{fmtClockDuration(sec)}</div>
        <div className="lv__sub">{l.pausedAt ? 'Paused' : `Started ${fmtTime(l.startedAt)}`}</div>
        <div className="lv__metrics">
          <div>
            <span className="eyebrow">Heart rate</span>
            <b className="num">—</b>
            <span className="fine">after Fitbit sync</span>
          </div>
          <div>
            <span className="eyebrow">Calories</span>
            <b className="num">—</b>
            <span className="fine">after Fitbit sync</span>
          </div>
          <div>
            <span className="eyebrow">Resting HR today</span>
            <b className="num">{rhr ?? '—'}</b>
            <span className="fine">bpm</span>
          </div>
        </div>
      </div>
      <div className="lv__actions">
        <button className="lv__btn lv__btn--pause" onClick={w.toggleSessionPause} type="button">
          {l.pausedAt ? '▶ Resume' : 'Ⅱ Pause'}
        </button>
        <button className="lv__btn lv__btn--end" onClick={() => setAsk('finish')} type="button">
          End
        </button>
      </div>

      {ask && (
        <div className="finishask" role="alertdialog" aria-modal="true" onClick={() => setAsk(null)}>
          <div className="finishask__card" onClick={(e) => e.stopPropagation()}>
            {ask === 'finish' ? (
              <>
                <h2>End {l.name}?</h2>
                <p>
                  {fmtShortDuration(sec)} · started {fmtTime(l.startedAt)}
                </p>
                <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
                <button
                  className="btn btn--primary btn--block"
                  onClick={() => {
                    w.finishSession(notes);
                    w.setSessionOpen(false);
                  }}
                  type="button"
                >
                  Save session
                </button>
                <button className="btn btn--ghost btn--block btn--dangertext" onClick={() => setAsk('discard')} type="button">
                  Discard
                </button>
              </>
            ) : (
              <>
                <h2>Discard this session?</h2>
                <p>The time won't be saved.</p>
                <button
                  className="btn btn--danger btn--block"
                  onClick={() => {
                    w.discardSession();
                    w.setSessionOpen(false);
                  }}
                  type="button"
                >
                  Discard session
                </button>
              </>
            )}
            <button className="btn btn--ghost btn--block" onClick={() => setAsk(null)} type="button">
              Keep going
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small floating bar while a session runs and its screen is minimized. */
export function SessionMiniBar() {
  const w = useWorkouts();
  const now = useNow(1000, !!w.live);
  if (!w.live || w.sessionOpen) return null;
  return (
    <button className="minibar" onClick={() => w.setSessionOpen(true)} type="button">
      <span className="live-dot" aria-hidden="true" />
      <span className="minibar__name">{w.live.name}</span>
      <span className="num">{fmtClockDuration(w.sessionElapsed(w.live, now))}</span>
    </button>
  );
}
