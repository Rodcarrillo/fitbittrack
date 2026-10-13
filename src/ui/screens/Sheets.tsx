import React, { useEffect, useRef, useState } from 'react';
import { PERMISSIONS, useApp } from '../../state/store';
import { InsightCard } from '../components/Cards';
import { IconCheck, IconClose, IconSpark, IconArrowRight, IconShield } from '../components/Icons';
import { LogoMark } from '../components/Logo';
import { LocalCoach, SUGGESTED_QUESTIONS, askGemini, buildCoachContext, type CoachAnswer, type CoachTurn, CoachUnavailable } from '../../insights/coach';
import { useWorkouts } from '../../workouts/store';
import { EXERCISE_LIBRARY } from '../../workouts/library';
import { SERVER_MODE } from '../../data/cloudSync';
import { estimateBattery, fmtHoursLeft, typicalHours } from '../../insights/battery';
import { analyzeFood, compressImage, mealForHour, MEAL_LABEL, type FoodGuess } from '../../data/nutrition';
import type { MealType } from '../../domain/types';
import { IconCamera } from '../components/Icons';
import { BandIcon } from '../components/Logo';
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
  const title = { insights: 'Insights', coach: 'FITBITRACK Coach', journal: 'Journal', connect: 'Connect your Fitbit', privacy: 'Privacy', battery: 'Band battery', food: 'Add food' }[sheet];
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
          {sheet === 'battery' && <BatterySheet />}
          {sheet === 'food' && <FoodSheet />}
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

function BatterySheet() {
  const { raw } = useApp();
  const d = raw?.devices[0];
  const diag = raw?.source.diagnostics?.devices ?? '';
  if (!d) {
    const forbidden = /403/.test(diag);
    return (
      <div className="battery-sheet">
        <p>{forbidden ? "Google hasn't given FITBITRACK permission to read your band (devices & settings)." : "Google Health didn't return a paired band yet."}</p>
        {forbidden ? (
          <>
            <ol className="hevy-steps">
              <li>Tap Reconnect below.</li>
              <li>
                On Google's screen, tick <b>every</b> box, including the one about your devices / settings.
              </li>
              <li>If that box doesn't appear: Google Cloud → Data access → add <code>googlehealth.settings.readonly</code>, save, and reconnect.</li>
            </ol>
            <a className="btn btn--primary btn--block" href="/auth/google/start">
              Reconnect Google Health
            </a>
          </>
        ) : (
          <p className="fine">Open the Fitbit app on your phone so the band syncs, then pull down to refresh.</p>
        )}
        <p className="fine">Status from Google: {diag || '—'}</p>
      </div>
    );
  }
  const est = estimateBattery(d);
  const ago = d.lastSync ? Math.max(1, Math.round((Date.now() - new Date(d.lastSync).getTime()) / 60000)) : null;
  return (
    <div className="battery-sheet">
      <div className="battery-hero">
        <BandIcon size={40} />
        <div>
          <div className="big num">{est ? `${est.level}%` : d.batteryStatus ?? '—'}</div>
          <div className="fine">{d.name}</div>
        </div>
      </div>
      {est ? (
        <>
          <div className="battery-left">
            <span className="eyebrow">Time left</span>
            <b>≈ {fmtHoursLeft(est.hoursLeft)}</b>
          </div>
          <p className="fine">
            {est.method === 'measured'
              ? `Based on how fast your band drained over the last ${Math.round(est.basisHours)} hours (${est.ratePerHour.toFixed(1)}% per hour).`
              : `Estimate based on the typical battery life of the ${d.name} (~${Math.round(typicalHours(d.name) / 24)} days). It gets personal after a few syncs, as FITBITRACK learns how fast yours drains.`}
          </p>
        </>
      ) : (
        <p className="fine">Google didn't send a battery level yet.</p>
      )}
      <p className="fine">
        Reported by Google Health at your band's last sync{ago ? ` (${ago < 60 ? `${ago} min` : ago < 1440 ? `${Math.round(ago / 60)} h` : `${Math.round(ago / 1440)} days`} ago)` : ''}
        {d.battery != null && est && est.level !== d.battery ? `: ${d.battery}% then, ~${est.level}% now` : ''}.
      </p>
    </div>
  );
}

type Draft = FoodGuess & { key: number };

/** Add food: photo (Gemini estimates), a description, or manual entry. Review, then save to Google Health. */
function FoodSheet() {
  const { sheetPayload, addFood, openSheet } = useApp();
  const initialImage = sheetPayload?.startsWith('data:image') ? sheetPayload : null;
  const forDate = sheetPayload?.startsWith('date:') ? sheetPayload.slice(5) : null;
  const [image, setImage] = useState<string | null>(initialImage);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Draft[]>([]);
  const [note, setNote] = useState('');
  const [meal, setMeal] = useState<MealType>(mealForHour(new Date().getHours()));
  const [state, setState] = useState<'idle' | 'analyzing' | 'saving' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const keyRef = useRef(1);

  const analyze = async (img: string | null, t: string) => {
    setState('analyzing');
    setErr(null);
    try {
      const r = await analyzeFood({ image: img ?? undefined, text: t || undefined });
      setItems(r.items.map((x) => ({ ...x, key: keyRef.current++ })));
      setNote(r.note);
      if (!r.items.length) setErr(r.note || "Couldn't find food in that. Try another photo or describe it.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setState('idle');
    }
  };

  useEffect(() => {
    if (initialImage) analyze(initialImage, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: number, patch: Partial<FoodGuess>) => setItems((xs) => xs.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const total = items.reduce((a, x) => a + (Number(x.kcal) || 0), 0);

  const save = async () => {
    setState('saving');
    setErr(null);
    const at = forDate ? new Date(`${forDate}T${meal === 'BREAKFAST' ? '08' : meal === 'LUNCH' ? '14' : meal === 'SNACK' ? '17' : '20'}:00`) : new Date();
    try {
      for (const x of items) {
        if (!x.name.trim()) continue;
        await addFood({ name: x.portion ? `${x.name} (${x.portion})` : x.name, kcal: Number(x.kcal) || 0, proteinG: Number(x.protein_g) || 0, carbsG: Number(x.carbs_g) || 0, fatG: Number(x.fat_g) || 0, meal, at });
      }
      setState('done');
      setTimeout(() => openSheet(null), 700);
    } catch (e) {
      setErr(e instanceof Error ? `Couldn't save to Google Health: ${e.message}` : "Couldn't save.");
      setState('idle');
    }
  };

  return (
    <div className="foodsheet">
      {image && <img className="foodsheet__img" src={image} alt="Your meal" />}
      {!items.length && state !== 'analyzing' && (
        <>
          <div className="nutri-actions">
            <label className="btn btn--primary photo-btn">
              <IconCamera size={18} /> {image ? 'New photo' : 'Take photo'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const img = await compressImage(f);
                  setImage(img);
                  analyze(img, text);
                }}
              />
            </label>
            <button className="btn btn--ghost" onClick={() => setItems([{ key: keyRef.current++, name: '', portion: '', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }])} type="button">
              Enter manually
            </button>
          </div>
          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() || image) analyze(image, text);
            }}
          >
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or describe it: 3 tacos al pastor y una coca" aria-label="Describe your meal" />
            <button className="ask__go" type="submit" disabled={!text.trim() && !image} aria-label="Analyze">
              <IconArrowRight size={18} />
            </button>
          </form>
        </>
      )}
      {state === 'analyzing' && <p className="qa__thinking">Analyzing your meal…</p>}

      {items.length > 0 && (
        <>
          <div className="mealpick" role="radiogroup" aria-label="Meal">
            {(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as MealType[]).map((m) => (
              <button key={m} className={`chip ${meal === m ? 'is-on' : ''}`} onClick={() => setMeal(m)} role="radio" aria-checked={meal === m} type="button">
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>
          {items.map((x) => (
            <div key={x.key} className="fooditem card">
              <div className="fooditem__head">
                <input className="input" value={x.name} onChange={(e) => set(x.key, { name: e.target.value })} placeholder="Food" aria-label="Food name" />
                <button className="setdel" onClick={() => setItems((xs) => xs.filter((y) => y.key !== x.key))} aria-label="Remove" type="button">
                  ×
                </button>
              </div>
              <input className="input fooditem__portion" value={x.portion} onChange={(e) => set(x.key, { portion: e.target.value })} placeholder="Portion (e.g. 1 plate)" aria-label="Portion" />
              <div className="fooditem__nums">
                {(
                  [
                    ['kcal', 'kcal'],
                    ['protein_g', 'Protein g'],
                    ['carbs_g', 'Carbs g'],
                    ['fat_g', 'Fat g'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k}>
                    <span className="fine">{label}</span>
                    <input className="input num" inputMode="decimal" value={String(x[k])} onChange={(e) => set(x.key, { [k]: e.target.value.replace(',', '.') as unknown as number })} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button className="link fine" onClick={() => setItems((xs) => [...xs, { key: keyRef.current++, name: '', portion: '', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }])} type="button">
            + Add another item
          </button>
          {note && <p className="fine">{note}</p>}
          <p className="fine">Estimates from the photo can be off. Adjust portions and numbers before saving.</p>
          <button className="btn btn--primary btn--block btn--xl" disabled={state === 'saving' || state === 'done' || !items.some((x) => x.name.trim())} onClick={save} type="button">
            {state === 'saving' ? 'Saving to Google Health…' : state === 'done' ? '✓ Saved' : `Save ${Math.round(total)} kcal`}
          </button>
        </>
      )}
      {err && <div className="notice">{err}</div>}
    </div>
  );
}
