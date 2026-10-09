import React, { useEffect, useRef, useState } from 'react';
import bandPng from './band.png';

/*
 * FITBITRACK mark: a black heartbeat line on a white tile.
 * All three splash icons (F, dumbbell, heartbeat) share one 600×600 drawing space
 * traced from the brand reference, so they sit at the same scale and center.
 */
const PULSE_D = 'M100 305H225L250 355L305 205L355 410L390 305H515';
// stylized italic "F" (filled)
const F_D =
  'M197 436L281 254Q292 227 322 227H478Q462 266 410 268H310Q285 270 273 306Q285 298 305 298H430Q414 343 385 345H306L268 420Q260 436 245 436Z';
// dumbbell pieces: [x, y, w, h], symmetric around x = 300
const BELL: [number, number, number, number][] = [
  [80, 270, 20, 50],
  [112, 242, 30, 106],
  [155, 210, 38, 168],
  [210, 282, 180, 24],
  [407, 210, 38, 168],
  [458, 242, 30, 106],
  [500, 270, 20, 50],
];

export function LogoMark({ size = 30, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <span className={`logomark ${tile ? 'logomark--tile' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="72 72 470 470" width={size * (tile ? 0.74 : 1)} height={size * (tile ? 0.74 : 1)} fill="none" aria-hidden="true">
        <path d={PULSE_D} stroke="var(--logo)" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
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

/**
 * Opening animation on a white screen: F → dumbbell → heartbeat drawn left to right.
 * Holds on the heartbeat until `ready`, then fades into the app. ~2.6 s total.
 */
export function Splash({ ready = true, onDone }: { ready?: boolean; onDone: () => void }) {
  const [finished, setFinished] = useState(false);
  const [out, setOut] = useState(false);
  const reduce = useRef(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const t = setTimeout(() => setFinished(true), reduce.current ? 350 : 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!finished || !ready) return;
    setOut(true);
    const t = setTimeout(onDone, 420);
    return () => clearTimeout(t);
  }, [finished, ready, onDone]);

  return (
    <div className={`splash ${reduce.current ? 'splash--static' : ''} ${out ? 'splash--out' : ''}`} aria-hidden="true">
      <svg className="splash__svg" viewBox="0 0 600 600" fill="none">
        <g transform="translate(-37 -31)">
          <path className="sp-f" d={F_D} fill="#000" />
        </g>
        <g className="sp-bell">
          {BELL.map(([x, y, w, h], i) => (
            <rect key={i} className="sp-bell__p" style={{ animationDelay: `${0.78 + Math.abs(3 - i) * 0.04}s, ${1.62 + (3 - Math.abs(3 - i)) * 0.03}s` }} x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} fill="#000" />
          ))}
        </g>
        <path className="sp-pulse" transform="translate(-7 -7)" d={PULSE_D} pathLength={1} stroke="#000" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
