import React, { useEffect, useRef, useState } from 'react';
import { PERMISSIONS, useApp } from '../../state/store';
import { InsightCard } from '../components/Cards';
import { IconCheck, IconClose, IconSpark, IconArrowRight, IconShield } from '../components/Icons';
import { LogoMark } from '../components/Logo';
import { LocalCoach, SUGGESTED_QUESTIONS, askGemini, buildCoachContext, type CoachAnswer, type CoachTurn, CoachUnavailable } from '../../insights/coach';
import { useWorkouts } from '../../workouts/store';
import { EXERCISE_LIBRARY } from '../../workouts/library';
import { SERVER_MODE } from '../../data/cloudSync';
import { MIN_SAMPLES, TAG_LABEL } from '../../insights/engine';
import { GOOGLE_HEALTH_SCOPES } from '../../auth/session';
import type { JournalTag } from '../../domain/types';

export function Sheets() {
  const { sheet, openSheet } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openSheet(null);
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, openSheet]);
  if (!sheet) return null;
  const title = { insights: 'Insights', coach: 'FITBITRACK Coach', journal: 'Journal', connect: 'Connect your Fitbit', privacy: 'Privacy' }[sheet];
  return (
    <div className="sheet-wrap" onClick={() => openSheet(null)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} ref={ref} tabIndex={-1}>
        <div className="sheet__grip" aria-hidden="true" />
        <header className="sheet__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={() => openSheet(null)} aria-label="Close" type="button">
            <IconClose size={18} />
          </button>
        </header>
        <div className="sheet__body">
          {sheet === 'insights' && <InsightsSheet />}
          {sheet === 'coach' && <CoachSheet />}
          {sheet === 'journal' && <JournalSheet />}
          {sheet === 'connect' && <ConnectSheet />}
          {sheet === 'privacy' && <PrivacySheet />}
        </div>
      </div>
    </div>
  );
}

function InsightsSheet() {
  const { analysis: a } = useApp();
  if (!a) return null;
  return (
    <div className="stack">
      <p className="fine">Compared with your own baseline (rolling 30 days, excluding today). These describe patterns and are not medical advice.</p>
      {a.insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}

type ChatMsg = { question: string; text?: string; local?: CoachAnswer; note?: string; pending?: boolean };

/** Tiny, safe renderer for the coach's markdown-ish replies: paragraphs, bullets, **bold**. */
function RichText({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <React.Fragment key={i}>{part}</React.Fragment>));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>);
    }
  }
  flush();
  return <div className="rich">{blocks}</div>;
}

function CoachSheet() {
  const { analysis: a } = useApp();
  const wk = useWorkouts();
  const [local] = useState(() => new LocalCoach());
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiOff, setAiOff] = useState(!SERVER_MODE);
  const endRef = useRef<HTMLDivElement>(null);
  const scroll = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 30);

  const ask = async (question: string) => {
    if (!a || !question.trim() || busy) return;
    const qq = question.trim();
    setBusy(true);
    setQ('');
    const prior = thread;
    setThread((t) => [...t, { question: qq, pending: true }]);
    scroll();
    let msg: ChatMsg;
    if (!aiOff) {
      try {
        const history: CoachTurn[] = prior.flatMap((m) => [
          { role: 'user' as const, text: m.question },
          { role: 'model' as const, text: m.text ?? (m.local ? [m.local.lead, ...m.local.points].join('\n') : '') },
        ]);
        const context = buildCoachContext(a, wk.data?.history ?? [], [...EXERCISE_LIBRARY, ...(wk.data?.customExercises ?? [])]);
        msg = { question: qq, text: await askGemini(qq, context, history) };
      } catch (e) {
        const err = e as CoachUnavailable;
        if (err.code === 'coach_not_configured') setAiOff(true);
        msg = { question: qq, local: await local.ask(qq, a), note: err.message };
      }
    } else {
      msg = { question: qq, local: await local.ask(qq, a) };
    }
    setThread((t) => [...t.slice(0, -1), msg]);
    setBusy(false);
    scroll();
  };

  return (
    <div className="coach-chat">
      {thread.length === 0 && (
        <p className="fine">
          {aiOff
            ? 'Answers come from your own FITBITRACK data: scores, baselines, workouts and journal.'
            : 'Ask anything, in any language. Gemini answers using a summary of your last weeks of sleep, recovery, activity and workouts.'}
        </p>
      )}
      {thread.map((t, i) => (
        <div key={i} className="qa">
          <div className="qa__q">{t.question}</div>
          <div className="qa__a">
            <span className="coach__mark">
              <IconSpark size={14} />
            </span>
            <div>
              {t.pending && <p className="qa__thinking">Thinking…</p>}
              {t.text && <RichText text={t.text} />}
              {t.local && (
                <>
                  <p className="qa__lead">{t.local.lead}</p>
                  <ul>
                    {t.local.points.map((p, k) => (
                      <li key={k}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {t.note && <p className="fine qa__note">{t.note}</p>}
            </div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
      {thread.length === 0 && (
        <div className="chips">
          {SUGGESTED_QUESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => ask(s)} type="button" disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor="coach-q" className="sr-only">
          Ask FITBITRACK
        </label>
        <input id="coach-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={aiOff ? 'Ask about your recovery, sleep or training' : 'Ask your coach anything…'} autoComplete="off" />
        <button className="ask__go" type="submit" disabled={busy || !q.trim()} aria-label="Ask">
          <IconArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}

const JOURNAL_TAGS: JournalTag[] = ['alcohol', 'caffeine_late', 'late_meal', 'stress', 'workout', 'basketball', 'football', 'poor_sleep', 'travel', 'hydration', 'rest_day', 'sickness'];

function JournalSheet() {
  const { analysis: a, todayJournal, toggleJournalTag, setJournalNote } = useApp();
  const [note, setNote] = useState(todayJournal.note ?? '');
  if (!a) return null;
  return (
    <div className="stack">
      <p className="fine">What happened today? Tap everything that applies.</p>
      <div className="chips">
        {JOURNAL_TAGS.map((t) => {
          const on = todayJournal.tags.includes(t);
          return (
            <button key={t} className={`chip ${on ? 'is-on' : ''}`} onClick={() => toggleJournalTag(t)} aria-pressed={on} type="button">
              {on && <IconCheck size={14} />} {TAG_LABEL[t]}
            </button>
          );
        })}
      </div>
      <label htmlFor="journal-note" className="eyebrow">
        Custom note
      </label>
      <textarea id="journal-note" className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => setJournalNote(note)} placeholder="Anything else worth remembering about today" />

      <div className="eyebrow eyebrow--sp">What your journal shows</div>
      {a.correlations.length ? (
        <>
          {a.correlations.slice(0, 5).map((c) => (
            <div key={`${c.tag}-${c.metric}`} className="corr">
              <p>{c.text}</p>
              <span className="fine">
                {c.nWith} days with vs {c.nWithout} without · correlation, not proof of cause
              </span>
            </div>
          ))}
        </>
      ) : (
        <div className="na-block">Keep logging. Patterns appear once a tag has at least {MIN_SAMPLES} days with and without it.</div>
      )}
    </div>
  );
}

function ConnectSheet() {
  const { raw, openSheet } = useApp();
  const [tried, setTried] = useState(false);
  const isSample = raw?.source.isSample ?? true;
  return (
    <div className="connect">
      <div className="connect__mark">
        <LogoMark size={34} />
      </div>
      <p className="connect__lead">FITBITRACK needs access to your health data to build your personal health dashboard.</p>
      <ul className="perm-list">
        {PERMISSIONS.map((p) => (
          <li key={p.key}>
            <span className="perm-list__check">
              <IconCheck size={14} />
            </span>
            <span>
              <b>{p.label}</b>
              <span className="fine">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="fine">Read-only access. FITBITRACK never writes to your Fitbit account and only requests these Google Health scopes:</p>
      <ul className="scope-list">
        {GOOGLE_HEALTH_SCOPES.map((s) => (
          <li key={s}>
            <code>{s.replace('https://www.googleapis.com/auth/', '')}</code>
          </li>
        ))}
      </ul>
      <button
        className="btn btn--primary btn--block"
        onClick={() => ((import.meta as any).env?.VITE_DATA_PROVIDER === 'google' ? window.location.assign('/auth/google/start') : setTried(true))}
        type="button"
      >
        <span className="g-dot" aria-hidden="true">
          G
        </span>
        Connect with Google Health
      </button>
      {tried && isSample && (
        <div className="notice">
          This preview runs without the FITBITRACK server, so it can't open Google sign-in. Deploy the included backend with your Google Cloud OAuth client and set <code>VITE_DATA_PROVIDER=google</code> to connect real data.
        </div>
      )}
      <button className="btn btn--ghost btn--block" onClick={() => openSheet(null)} type="button">
        Continue with sample data
      </button>
    </div>
  );
}

function PrivacySheet() {
  return (
    <div className="stack privacy">
      <div className="privacy__badge">
        <IconShield size={22} />
        <b>Your health data stays yours.</b>
      </div>
      <ul>
        <li>Sign-in uses Google OAuth 2.0. FITBITRACK never sees your Google password.</li>
        <li>Access and refresh tokens live only on the FITBITRACK server, encrypted at rest (AES-256-GCM). The app holds an httpOnly session cookie, never a token.</li>
        <li>Only read-only scopes are requested, and only for the data types you allow.</li>
        <li>Health values are never written to logs or analytics.</li>
        <li>No API secrets ship in the app. Keys stay in server environment variables.</li>
        <li>Coach answers are computed from your data on your device. If a cloud model is enabled, it receives a short summary (scores and percentages), not your raw history.</li>
        <li>You can export everything or delete your account at any time from Profile.</li>
      </ul>
      <p className="fine">FITBITRACK scores and insights describe patterns in your data. They are not a medical device and do not diagnose conditions.</p>
    </div>
  );
}
