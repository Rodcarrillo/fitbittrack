import React, { useEffect, useState } from 'react';

interface Props {
  value: number | null;
  max?: number;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
  caption?: string;
  captionColor?: string;
  inner?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

/** Large animated score ring. `value === null` renders an honest empty state, never 0. */
export function ScoreRing({ value, max = 100, color, size = 108, stroke = 8, label, caption, captionColor, inner, onClick, ariaLabel }: Props) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value == null) {
      setShown(value ?? 0);
      return;
    }
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, shown / max));
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag className={`ring ${onClick ? 'ring--btn' : ''}`} onClick={onClick} aria-label={ariaLabel} type={onClick ? 'button' : undefined}>
      <span className="ring__svgwrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
          {value != null && (
            <circle
              className="ring__arc"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - frac)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <span className="ring__center">
          <span className="ring__value" style={{ fontSize: size * 0.3 }}>
            {value == null ? '—' : Math.round(value)}
          </span>
          {inner && <span className="ring__inner" style={{ color: captionColor ?? color }}>{inner}</span>}
        </span>
      </span>
      {label && <span className="ring__label">{label}</span>}
      {caption && (
        <span className="ring__caption" style={{ color: captionColor ?? color }}>
          {caption}
        </span>
      )}
    </Tag>
  );
}
