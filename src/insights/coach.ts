/**
 * FITBITRACK COACH
 *
 * CoachService is the seam for an LLM. LocalCoach answers from the user's own data with
 * deterministic reasoning (works offline, no data leaves the device). RemoteCoach sends a
 * compact, de-identified summary (never raw minute-level data) to the backend /api/coach,
 * which can call an LLM with the same grounding facts.
 */
import type { Analysis } from './engine';
import { fmtDuration, fmtNum, mean, nonNull, signed } from '../calc/stats';
import { api } from '../auth/session';

export interface CoachAnswer {
  question: string;
  lead: string;
  points: string[];
}

export interface CoachService {
  ask(question: string, a: Analysis): Promise<CoachAnswer>;
}

export const SUGGESTED_QUESTIONS = [
  'How recovered am I?',
  'Should I train today?',
  'Why was my sleep bad?',
  'Why is my HRV lower?',
  'How has my sleep changed this month?',
  'Am I training too much?',
  "What's affecting my readiness?",
];

type Intent = 'recovered' | 'train' | 'sleepBad' | 'hrv' | 'sleepMonth' | 'tooMuch' | 'readiness';

function intentOf(q: string): Intent {
  const s = q.toLowerCase();
  if (/too much|overtrain|over-train|too hard/.test(s)) return 'tooMuch';
  if (/hrv|variability/.test(s)) return 'hrv';
  if (/month|changed|trend/.test(s) && /sleep/.test(s)) return 'sleepMonth';
  if (/sleep|tired|bed/.test(s)) return 'sleepBad';
  if (/train|workout|gym|run|exercise|play/.test(s)) return 'train';
  if (/affect|why.*readiness|contribut|factor/.test(s)) return 'readiness';
  return 'recovered';
}

/** Compact facts block shared by local and remote coaches. */
export function coachFacts(a: Analysis) {
  const t = a.today;
  const r = t.readiness;
  const contribs = r ? [...r.contributors].sort((x, y) => y.impactPct - x.impactPct) : [];
  return {
    readiness: r?.score ?? null,
    sleepScore: t.sleep?.score ?? null,
    sleepMin: t.sleep?.session.minutesAsleep ?? null,
    sleepNeedMin: t.sleep?.needMin ?? null,
    loadScore: t.load.score,
    acwr: r?.acwr ?? null,
    hrvPct: r?.hrv?.pct ?? null,
    rhrDelta: r?.restingHr?.delta ?? null,
    best: contribs[0] ?? null,
    worst: contribs[contribs.length - 1] ?? null,
    consistency: t.sleep?.components.consistency ?? null,
  };
}

export function biggestOpportunity(a: Analysis): string {
  const t = a.today;
  const c = t.sleep?.components;
  if (c?.consistency != null && c.consistency < 80) return 'sleep consistency';
  if (t.sleep && t.sleep.session.minutesAsleep < t.sleep.needMin - 20) return 'sleep duration';
  const acwr = t.readiness?.acwr;
  if (acwr != null && acwr > 1.3) return 'balancing your training load';
  return 'keeping your bedtime steady';
}

export class LocalCoach implements CoachService {
  async ask(question: string, a: Analysis): Promise<CoachAnswer> {
    const f = coachFacts(a);
    const t = a.today;
    const scores = a.scores;
    const intent = intentOf(question);
    const pts: string[] = [];
    let lead = '';

    switch (intent) {
      case 'recovered':
      case 'readiness': {
        if (f.readiness == null) return { question, lead: "I can't score recovery yet.", points: ['Wear your Fitbit overnight so HRV and resting heart rate can sync.'] };
        lead = f.readiness >= 80 ? "You're well recovered today." : f.readiness >= 60 ? "You're reasonably recovered." : 'Your body is still recovering.';
        pts.push(`Readiness is ${f.readiness}/100.`);
        if (f.best) pts.push(`The biggest positive contributor is your ${f.best.label === 'HRV' ? 'HRV' : f.best.label.toLowerCase()}, ${fmtNum(Math.abs(f.best.impactPct))}% ${f.best.impactPct >= 0 ? 'better' : 'worse'} than your baseline.`);
        if (f.worst && f.worst !== f.best) pts.push(`The weakest factor is ${f.worst.label.toLowerCase()} (${signed(f.worst.impactPct)}%).`);
        pts.push(`Your biggest opportunity is ${biggestOpportunity(a)}.`);
        break;
      }
      case 'train': {
        if (f.readiness == null) return { question, lead: 'Go by feel today.', points: ['Recovery data is missing, so keep intensity moderate.'] };
        if (f.readiness >= 80) {
          lead = 'Yes. Today is a good day to push.';
          pts.push(`Readiness ${f.readiness} supports a moderate-to-high intensity session.`);
          pts.push(`You've already logged a training load of ${f.loadScore}. Aim to stay below High if you have a hard day planned tomorrow.`);
        } else if (f.readiness >= 60) {
          lead = 'Yes, at a moderate effort.';
          pts.push('Steady zone 2–3 work fits your recovery today. Keep zone 4–5 efforts short.');
        } else {
          lead = 'Consider an easy day.';
          pts.push('Your recovery markers are below baseline. Mobility, a walk or light technical work may serve you better.');
        }
        if (f.acwr != null) pts.push(`Your last 7 days carry ${fmtNum(f.acwr * 100)}% of your usual 4-week load.`);
        break;
      }
      case 'sleepBad': {
        const s = t.sleep;
        if (!s) return { question, lead: 'No sleep was recorded last night.', points: ['Make sure the device is snug and charged before bed.'] };
        lead = s.score >= 80 ? 'Your sleep actually scored well last night.' : 'A few things held your sleep back.';
        pts.push(`You slept ${fmtDuration(s.session.minutesAsleep)} against a need of ${fmtDuration(s.needMin)}.`);
        if (s.components.consistency != null && s.components.consistency < 80) pts.push(`Your bedtime has varied by about ${fmtNum(s.bedtimeSdMin ?? 0)} minutes this week, which lowers consistency.`);
        const lastJ = a.ds.journal.find((j) => j.date === scores[scores.length - 2]?.date);
        if (lastJ?.tags.includes('alcohol')) pts.push('You logged alcohol yesterday, which often reduces deep sleep.');
        if (lastJ?.tags.includes('caffeine_late')) pts.push('You logged caffeine after 3 PM yesterday.');
        const corr = a.correlations.find((c) => c.metric === 'sleep');
        if (corr) pts.push(`Pattern from your journal: ${corr.text} This is a correlation, not proof of cause.`);
        break;
      }
      case 'hrv': {
        if (f.hrvPct == null) return { question, lead: 'HRV is not available from your connected data.', points: ['Check that HRV is allowed under Data permissions.'] };
        lead = f.hrvPct >= 0 ? `Your HRV is actually ${fmtNum(f.hrvPct)}% above baseline today.` : `Your HRV is ${fmtNum(-f.hrvPct)}% below baseline today.`;
        const prev = a.ds.journal.find((j) => j.date === scores[scores.length - 2]?.date);
        if (scores[scores.length - 2]?.load.score >= 80) pts.push('Yesterday was a high-load day, which commonly lowers HRV the next morning.');
        if (prev?.tags.includes('alcohol')) pts.push('Alcohol the evening before can lower overnight HRV.');
        if (t.sleep && t.sleep.session.minutesAsleep < t.sleep.needMin - 30) pts.push('Short sleep last night may also play a part.');
        if (pts.length === 0) pts.push('Nothing unusual stands out. Day-to-day HRV naturally varies; the 7-day trend matters more than one night.');
        break;
      }
      case 'sleepMonth': {
        const avg = (from: number, to: number) => mean(nonNull(scores.slice(from, to).map((s) => s.sleep?.session.minutesAsleep ?? null)));
        const sc = (from: number, to: number) => mean(nonNull(scores.slice(from, to).map((s) => s.sleep?.score ?? null)));
        const now = avg(-30, scores.length);
        const prev = avg(-60, -30);
        lead = now >= prev ? 'Your sleep has improved over the last month.' : 'You slept a little less this month.';
        pts.push(`Average sleep: ${fmtDuration(now)} vs ${fmtDuration(prev)} the month before.`);
        pts.push(`Average sleep score: ${fmtNum(sc(-30, scores.length))} vs ${fmtNum(sc(-60, -30))}.`);
        break;
      }
      case 'tooMuch': {
        const acwr = f.acwr;
        if (acwr == null) return { question, lead: 'Not enough training history yet.', points: ['After two weeks of logged workouts I can compare short- and long-term load.'] };
        lead = acwr > 1.3 ? 'Your recent load is high relative to your usual.' : acwr < 0.8 ? "You're training less than usual." : 'Your training load looks balanced.';
        pts.push(`Last 7 days are at ${fmtNum(acwr * 100)}% of your 4-week average.`);
        const hard = scores.slice(-7).filter((s) => s.load.score >= 80).length;
        pts.push(`${hard} of the last 7 days were high load.`);
        if (f.readiness != null) pts.push(f.readiness >= 70 ? 'Your recovery markers are keeping up.' : 'Recovery markers are lagging, so an easier day could help.');
        break;
      }
    }
    return { question, lead, points: pts };
  }
}

export class RemoteCoach implements CoachService {
  async ask(question: string, a: Analysis): Promise<CoachAnswer> {
    return api<CoachAnswer>('/api/coach', { method: 'POST', body: JSON.stringify({ question, facts: coachFacts(a) }) });
  }
}
