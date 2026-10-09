import React from 'react';

type P = { size?: number; className?: string };
const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconToday = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>
);
export const IconHeart = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 19s-7-4.4-7-9.6A4 4 0 0 1 12 7a4 4 0 0 1 7 2.4C19 14.6 12 19 12 19Z" /></svg>
);
export const IconRun = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="14.5" cy="4.8" r="1.7" /><path d="m7 21 3-5.5 3 2.5v4" /><path d="M5 11.5 8.5 9l4 .5 2.5 3.5 3.5 1" /><path d="m12.5 9.5-2.5 6" /></svg>
);
export const IconTrends = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 19h16" /><path d="M6 15v4M10 11v8M14 13v6M18 7v12" /></svg>
);
export const IconProfile = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18.2a6.5 6.5 0 0 1 11 0" /></svg>
);
export const IconMoon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" /></svg>
);
export const IconSun = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3.6" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>
);
export const IconPulse = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
);
export const IconLungs = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4v8M12 12c-1 1-2 1.5-3 1.5M12 12c1 1 2 1.5 3 1.5" /><path d="M8.5 7C6 7 4 11 4 15.5 4 18 5 19.5 7 19.5S10 18 10 16v-6" /><path d="M15.5 7C18 7 20 11 20 15.5c0 2.5-1 4-3 4S14 18 14 16v-6" /></svg>
);
export const IconDrop = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" /></svg>
);
export const IconThermo = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z" /><path d="M12 9v6.5" /></svg>
);
export const IconSteps = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M8 3c2 0 3 2 3 4.5S10 12 8 12s-3-1.5-3-4.5S6 3 8 3Z" /><path d="M5.5 14.5h5l-.5 3a2.5 2.5 0 0 1-4 0Z" /><path d="M16 8c2 0 3 2 3 4.5S18 17 16 17s-3-1.5-3-4.5S14 8 16 8Z" /></svg>
);
export const IconFlame = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1 2-2 3-3.5 3.5C9 9 8 7 8 6c-1.5 2-2 4.5-2 6.5A6 6 0 0 0 12 21Z" /></svg>
);
export const IconScale = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9.5a4 4 0 0 1 6 0l-2 2.5" /></svg>
);
export const IconChevron = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconBack = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m15 6-6 6 6 6" /></svg>
);
export const IconClose = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconArrowRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconSpark = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.5 13.8 10l6.2 2-6.2 2L12 20.5 10.2 14 4 12l6.2-2Z" /></svg>
);
export const IconCheck = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconPlus = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconBook = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" /><path d="M5 17a3 3 0 0 1 3-3h10M9 8h5" /></svg>
);
export const IconWatch = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 6V3h6v3M9 18v3h6v-3" /></svg>
);
export const IconShield = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconBell = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2h-14Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
);
export const IconDownload = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
);
export const IconTrash = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /></svg>
);
export const IconRuler = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="8" width="18" height="8" rx="1.5" /><path d="M7 8v3M11 8v4M15 8v3M19 8v2" /></svg>
);
export const IconTarget = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>
);
export const IconBall = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5v17M6 6c2.5 2 3.5 4 3.5 6S8.5 16 6 18M18 6c-2.5 2-3.5 4-3.5 6s1 4 3.5 6" /></svg>
);
export const IconDumbbell = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="4.5" y="7" width="3" height="10" rx="1.2" /><rect x="16.5" y="7" width="3" height="10" rx="1.2" /><path d="M2.5 10v4M21.5 10v4M7.5 12h9" /></svg>
);
export const IconWalk = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="13" cy="4.5" r="1.7" /><path d="m9 21 2-6 3 2.5V21" /><path d="m8 12 3-4 3 1 2 3 2 .5" /><path d="m11 8-1 5" /></svg>
);
export const IconBike = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="m6 16 4-7h5l3 7M10 9 8.5 6.5H7M14 6h2" /></svg>
);
export const IconLotus = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 19c-4 0-8-2-8-6 3 0 5 1 8 6Zm0 0c4 0 8-2 8-6-3 0-5 1-8 6Zm0 0c-2-3-2-7 0-11 2 4 2 8 0 11Z" /></svg>
);
export const IconRefresh = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V8h-3.5" /></svg>
);
export const IconAuto = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" /></svg>
);
