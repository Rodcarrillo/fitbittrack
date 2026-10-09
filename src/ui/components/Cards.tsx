import React from 'react';
import type { Exercise, HrZoneMinutes, SleepStages as Stages, ActivityKind } from '../../domain/types';
import type { Insight } from '../../insights/engine';
import { fmtClock, clockMinutes, fmtDuration, fmtNum } from '../../calc/stats';
import { sessionIntensity } from '../../calc/scores';
import { IconArrowRight, IconBall, IconBike, IconChevron, IconDumbbell, IconLotus, IconRun, IconSpark, IconWalk, IconMoon } from './Icons';
import { Sparkline } from './Charts';

/* ---------------- BaselineComparison ---------------- */

interface BCProps {
  delta: number;
  unit?: string;
  /** which direction is good for this metric */
  better: 'higher' | 'lower' | 'neutral';
  digits?: number;
  suffix?: string;
  pct?: boolean;
}

export function BaselineComparison({ delta, unit = '', better, digits = 0, suffix = 'vs baseline', pct }: BCProps) {
  const rounded = Number(delta.toFixed(digits));
  const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const good = better === 'neutral' || dir === 'flat' ? 'neutral' : (dir === 'up') === (better === 'higher') ? 'good' : 'bad';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  return (
    <span className={`bc bc--${good}`}>
      <span aria-hidden="true">{arrow}</span> {fmtNum(Math.abs(rounded), digits)}
      {pct ? '%' : unit ? ` ${unit}` : ''} <span className="bc__suffix">{suffix}</span>
    </span>
  );
}

/* ---------------- MetricCard ---------------- */

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  unit?: string;
  comparison?: React.ReactNode;
  explanation?: string;
  spark?: (number | null)[];
  color?: string;
  onClick?: () => void;
  footer?: React.ReactNode;
  compact?: boolean;
}

export function MetricCard({ icon, label, value, unit, comparison, explanation, spark, color = 'var(--accent)', onClick, footer, compact }: MetricProps) {
  const Tag: any = onClick ? 'button' : 'div';
  const unavailable = value == null;
  return (
    <Tag className={`card metric ${compact ? 'metric--compact' : ''} ${onClick ? 'is-interactive' : ''} ${unavailable ? 'is-unavailable' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className="metric__head">
        <span className="metric__icon" style={{ color }}>{icon}</span>
        <span className="eyebrow">{label}</span>
        {onClick && <IconChevron size={16} className="metric__chev" />}
      </div>
      {unavailable ? (
        <div className="metric__na">Not available</div>
      ) : (
        <div className="metric__value">
          <span className="num">{value}</span>
          {unit && <span className="metric__unit">{unit}</span>}
        </div>
      )}
      {!unavailable && comparison && <div className="metric__cmp">{comparison}</div>}
      {!unavailable && spark && spark.filter((v) => v != null).length > 2 && (
        <div className="metric__spark">
          <Sparkline values={spark} color={color} />
        </div>
      )}
      {explanation && <p className="metric__expl">{unavailable ? 'Not shared by your device or not permitted. Turn it on under Profile → Data permissions.' : explanation}</p>}
      {footer}
    </Tag>
  );
}

/* ---------------- ActivityCard ---------------- */

const KIND_ICON: Record<ActivityKind, React.ReactNode> = {
  strength: <IconDumbbell />,
  basketball: <IconBall />,
  football: <IconBall />,
  run: <IconRun />,
  walk: <IconWalk />,
  bike: <IconBike />,
  hiit: <IconRun />,
  yoga: <IconLotus />,
};

export function ActivityCard({ e, trimp, showDate }: { e: Exercise; trimp: number; showDate?: string }) {
  const intensity = sessionIntensity(trimp);
  const start = clockMinutes(e.start);
  return (
    <div className="activity">
      <span className={`activity__badge activity__badge--${intensity}`}>{KIND_ICON[e.kind]}</span>
      <div className="activity__main">
        <div className="activity__name">{e.name}</div>
        <div className="activity__meta">
          {showDate ? `${showDate} · ` : ''}
          {fmtClock(start)} · {fmtDuration(e.durationMin)}
        </div>
      </div>
      <div className="activity__stats">
        {e.calories != null && (
          <span>
            <b className="num">{fmtNum(e.calories)}</b> kcal
          </span>
        )}
        {e.avgHr != null && (
          <span>
            <b className="num">{e.avgHr}</b> bpm
          </span>
        )}
      </div>
      <span className={`pill pill--${intensity}`}>{intensity}</span>
    </div>
  );
}

export function SleepActivityCard({ start, end, minutes }: { start: string; end: string; minutes: number }) {
  return (
    <div className="activity">
      <span className="activity__badge activity__badge--sleep">
        <IconMoon />
      </span>
      <div className="activity__main">
        <div className="activity__name">Sleep</div>
        <div className="activity__meta">
          {fmtClock(clockMinutes(start))} – {fmtClock(clockMinutes(end))}
        </div>
      </div>
      <div className="activity__stats">
        <span>
          <b className="num">{fmtDuration(minutes)}</b>
        </span>
      </div>
      <span className="pill pill--sleep">rest</span>
    </div>
  );
}

/* ---------------- InsightCard ---------------- */

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={`insight insight--${insight.tone}`}>
      <span className="insight__dot" aria-hidden="true" />
      <div>
        <div className="insight__title">
          {insight.title}
          <span className="insight__area">{insight.area}</span>
        </div>
        <p className="insight__body">{insight.body}</p>
      </div>
    </article>
  );
}

/* ---------------- CoachCard ---------------- */

export function CoachCard({ lead, lines, onAsk }: { lead: string; lines: React.ReactNode[]; onAsk: () => void }) {
  return (
    <section className="card coach">
      <div className="coach__head">
        <span className="coach__mark">
          <IconSpark size={16} />
        </span>
        <span className="eyebrow">FITBITRACK Coach</span>
      </div>
      <p className="coach__lead">“{lead}”</p>
      <ul className="coach__list">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <button className="cta" onClick={onAsk} type="button">
        Ask FITBITRACK <IconArrowRight size={16} />
      </button>
    </section>
  );
}

/* ---------------- SleepStages ---------------- */

const STAGE_META = [
  { key: 'deepMin', label: 'Deep', color: 'var(--stage-deep)' },
  { key: 'lightMin', label: 'Light', color: 'var(--stage-light)' },
  { key: 'remMin', label: 'REM', color: 'var(--stage-rem)' },
  { key: 'awakeMin', label: 'Awake', color: 'var(--stage-awake)' },
] as const;

export function SleepStages({ stages }: { stages: Stages | null }) {
  if (!stages) return <div className="na-block">Sleep stages not available from your device for this night.</div>;
  const total = stages.deepMin + stages.lightMin + stages.remMin + stages.awakeMin;
  return (
    <div className="stages">
      <div className="stages__bar" role="img" aria-label="Sleep stage breakdown">
        {STAGE_META.map((s) => (
          <span key={s.key} style={{ flexGrow: stages[s.key], background: s.color }} />
        ))}
      </div>
      <div className="stages__legend">
        {STAGE_META.map((s) => (
          <div key={s.key} className="stages__item">
            <span className="stages__label">
              <i style={{ background: s.color }} />
              {s.label}
            </span>
            <b className="num">{fmtDuration(stages[s.key])}</b>
            <span className="stages__pct">{Math.round((stages[s.key] / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- HeartRateZones ---------------- */

const ZONES = [
  { k: 'z5', label: 'Zone 5', range: '90–100%', color: 'var(--z5)' },
  { k: 'z4', label: 'Zone 4', range: '80–90%', color: 'var(--z4)' },
  { k: 'z3', label: 'Zone 3', range: '70–80%', color: 'var(--z3)' },
  { k: 'z2', label: 'Zone 2', range: '60–70%', color: 'var(--z2)' },
  { k: 'z1', label: 'Zone 1', range: '50–60%', color: 'var(--z1)' },
] as const;

export function HeartRateZones({ zones }: { zones: HrZoneMinutes | null }) {
  if (!zones) return <div className="na-block">Heart-rate zones are not available for this workout.</div>;
  const total = zones.z1 + zones.z2 + zones.z3 + zones.z4 + zones.z5 || 1;
  return (
    <div className="zones">
      {ZONES.map((z) => {
        const pct = (zones[z.k] / total) * 100;
        return (
          <div className="zones__row" key={z.k}>
            <span className="zones__label">
              <i style={{ background: z.color }} />
              {z.label}
              <span className="zones__range">{z.range} max</span>
            </span>
            <span className="zones__track">
              <span className="zones__fill" style={{ width: `${pct}%`, background: z.color }} />
            </span>
            <span className="zones__pct num">{Math.round(pct)}%</span>
            <span className="zones__min num">{zones[z.k]}m</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Section header ---------------- */

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="sec-head">
      <h2 className="sec-title">{title}</h2>
      {action && (
        <button className="link" onClick={onAction} type="button">
          {action} <IconChevron size={14} />
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}
