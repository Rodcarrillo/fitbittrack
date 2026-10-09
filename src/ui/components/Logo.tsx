import React, { useEffect, useRef, useState } from 'react';
import bandPng from './band.png';

/*
 * FITBITRACK mark: a heartbeat line in royal blue with a soft glow.
 * The splash morphs an "F" into the same 7-point line, so both shapes share one path.
 */
type Pt = [number, number];
const PULSE: Pt[] = [[2, 13], [7.5, 13], [9.6, 15.6], [12.4, 5.5], [15.4, 19], [17.4, 13], [22, 13]];
// F drawn as one stroke (the middle arm doubles back), padded to 7 points.
const F: Pt[] = [[17, 4], [7.5, 4], [7.5, 12], [14.5, 12], [7.5, 12], [7.5, 20.5], [7.5, 20.5]];

const toPath = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('');
const lerp = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
const PULSE_D = toPath(PULSE);

export function LogoMark({ size = 30, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <span className={`logomark ${tile ? 'logomark--tile' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * (tile ? 0.72 : 1)} height={size * (tile ? 0.72 : 1)} fill="none" aria-hidden="true">
        <path d={PULSE_D} stroke="var(--logo-glow)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="logomark__glow" />
        <path d={PULSE_D} stroke="var(--logo)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span className="wordmark__text">FITBITRACK</span>
    </span>
  );
}

/** The Fitbit band outline used next to the battery level. Colored via CSS mask. */
export function BandIcon({ size = 20 }: { size?: number }) {
  return <span className="bandicon" aria-hidden="true" style={{ width: size, height: size, WebkitMaskImage: `url(${bandPng})`, maskImage: `url(${bandPng})` }} />;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Opening animation: an F is drawn, then reshapes into the heartbeat mark, then the app fades in. */
export function Splash({ onDone }: { onDone: () => void }) {
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const [phase, setPhase] = useState<'draw' | 'morph' | 'word' | 'out'>('draw');

  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      onDone();
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const DRAW = 620;
    const HOLD = 160;
    const MORPH = 680;
    const tick = (now: number) => {
      const t = now - t0;
      if (t > DRAW + HOLD) {
        const k = ease(Math.min(1, (t - DRAW - HOLD) / MORPH));
        const d = toPath(lerp(F, PULSE, k));
        pathRef.current?.setAttribute('d', d);
        glowRef.current?.setAttribute('d', d);
        if (k >= 1) {
          setPhase('word');
          return;
        }
        setPhase('morph');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  useEffect(() => {
    if (phase !== 'word') return;
    const a = setTimeout(() => setPhase('out'), 650);
    const b = setTimeout(onDone, 1050);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [phase, onDone]);

  const fd = toPath(F);
  return (
    <div className={`splash splash--${phase}`} aria-hidden="true">
      <div className="splash__mark">
        <svg viewBox="0 0 24 24" width="104" height="104" fill="none">
          <path ref={glowRef} d={fd} stroke="var(--logo-glow)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="splash__glow" pathLength={1} />
          <path ref={pathRef} d={fd} stroke="var(--logo)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="splash__line" pathLength={1} />
        </svg>
      </div>
      <div className="splash__word">FITBITRACK</div>
      <div className="splash__tag">Your Fitbit data. Reimagined.</div>
    </div>
  );
}
