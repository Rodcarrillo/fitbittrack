import React, { useEffect, useId, useRef, useState } from 'react';

function useWidth<T extends HTMLElement>(fallback = 300) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

interface TrendProps {
  values: (number | null)[];
  labels?: string[];
  color: string;
  height?: number;
  baseline?: number | null;
  axis?: boolean;
  format?: (v: number) => string;
  /** Draw the series as bars instead of a line (for counts like steps). */
  bars?: boolean;
  ariaLabel?: string;
}

/**
 * TrendChart — line/area or bars, one shared scale for marks, gridlines and labels.
 * Nulls break the line instead of dropping to zero.
 */
export function TrendChart({ values, labels, color, height = 140, baseline, axis = true, format = (v) => String(Math.round(v)), bars = false, ariaLabel }: TrendProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gid = useId().replace(/:/g, '');
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
  if (pts.length < 2) {
    return (
      <div ref={ref} className="chart chart--empty" style={{ height }}>
        Not enough data in this range
      </div>
    );
  }
  const padL = 4;
  const padR = axis ? 40 : 4;
  const padT = 10;
  const padB = axis && labels ? 22 : 6;
  const vals = pts.map((p) => p.v).concat(baseline != null ? [baseline] : []);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (bars) lo = 0;
  const span = hi - lo || Math.abs(hi) * 0.1 || 1;
  if (!bars) {
    lo -= span * 0.12;
    hi += span * 0.12;
  } else hi += span * 0.08;
  const n = values.length;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * innerH;

  // break into segments where nulls appear
  const segs: { v: number; i: number }[][] = [];
  let cur: { v: number; i: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push({ v, i });
  });
  if (cur.length) segs.push(cur);

  const line = (s: { v: number; i: number }[]) => s.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = (s: { v: number; i: number }[]) => `${line(s)}L${x(s[s.length - 1].i).toFixed(1)},${(padT + innerH).toFixed(1)}L${x(s[0].i).toFixed(1)},${(padT + innerH).toFixed(1)}Z`;
  const lastPt = pts[pts.length - 1];
  const ticks = [lo + (hi - lo) * 0.15, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.85].map((t) => (bars ? Math.round(t) : t));
  const barW = Math.max(2, Math.min(18, (innerW / n) * 0.62));

  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {axis &&
          ticks.map((t, k) => (
            <g key={k}>
              <line x1={padL} x2={padL + innerW} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
              <text x={width - 2} y={y(t) + 3.5} textAnchor="end" className="chart__tick" fill="var(--dim)">
                {format(t)}
              </text>
            </g>
          ))}
        {baseline != null && (
          <line x1={padL} x2={padL + innerW} y1={y(baseline)} y2={y(baseline)} stroke="var(--muted)" strokeDasharray="3 4" strokeWidth="1" opacity="0.7" />
        )}
        {bars
          ? pts.map((p) => (
              <rect
                key={p.i}
                className="chart__bar"
                x={x(p.i) - barW / 2}
                y={y(p.v)}
                width={barW}
                height={Math.max(1, padT + innerH - y(p.v))}
                rx={Math.min(3, barW / 2)}
                fill={p.i === lastPt.i ? color : color}
                opacity={p.i === lastPt.i ? 1 : 0.45}
              />
            ))
          : segs.map((s, k) => (
              <g key={k}>
                <path d={area(s)} fill={`url(#g${gid})`} className="chart__area" />
                <path d={line(s)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="chart__line" />
              </g>
            ))}
        {!bars && (
          <>
            <circle cx={x(lastPt.i)} cy={y(lastPt.v)} r="6" fill={color} opacity="0.2" />
            <circle cx={x(lastPt.i)} cy={y(lastPt.v)} r="3.2" fill={color} stroke="var(--card)" strokeWidth="1.5" />
          </>
        )}
        {axis && labels && labels.length > 1 && (
          <>
            <text x={padL} y={height - 5} className="chart__tick" fill="var(--dim)">
              {labels[0]}
            </text>
            <text x={padL + innerW} y={height - 5} textAnchor="end" className="chart__tick" fill="var(--dim)">
              {labels[labels.length - 1]}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

export function Sparkline({ values, color, height = 36 }: { values: (number | null)[]; color: string; height?: number }) {
  return <TrendChart values={values} color={color} height={height} axis={false} />;
}

interface WeekBar {
  label: string;
  value: number;
  sub?: string;
  today?: boolean;
}

/** Seven labelled bars on a fixed 0–100 scale (training load / scores). */
export function WeekBars({ bars, color, max = 100, height = 120 }: { bars: WeekBar[]; color: string; max?: number; height?: number }) {
  return (
    <div className="weekbars" style={{ height }}>
      {bars.map((b, i) => (
        <div key={i} className={`weekbars__col ${b.today ? 'is-today' : ''}`}>
          <span className="weekbars__val">{b.value > 0 ? Math.round(b.value) : '–'}</span>
          <span className="weekbars__track">
            <span className="weekbars__bar" style={{ height: `${Math.max(2, (b.value / max) * 100)}%`, background: color, opacity: b.today ? 1 : 0.38 + (b.value / max) * 0.5, animationDelay: `${i * 40}ms` }} />
          </span>
          <span className="weekbars__label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
