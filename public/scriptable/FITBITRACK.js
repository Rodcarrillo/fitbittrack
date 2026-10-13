// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: heartbeat;

/*
 * FITBITRACK widgets for Scriptable (iPhone / iPad).
 *
 * One script, several widgets. Long-press the widget → Edit Widget → Parameter:
 *   rings    (default) readiness · sleep · training-load rings
 *   today    full dashboard (best as Large)
 *   sleep    sleep score, hours and tonight's bedtime
 *   battery  band battery and estimated time left
 *   food     calories eaten vs burned, protein, water
 * Lock Screen widgets work too (circular / rectangular / inline).
 *
 * The app fills these in automatically when you copy the script from
 * FITBITRACK → Profile → Widgets. Otherwise paste them below.
 */
const APP_URL = '__APP_URL__';
const WIDGET_KEY = '__WIDGET_KEY__';

/* ------------------------------------------------------------------ */
/* palette (matches the app)                                           */
/* ------------------------------------------------------------------ */
const C = {
  bg1: new Color('#0b0e15'),
  bg2: new Color('#07090e'),
  card: new Color('#ffffff', 0.06),
  track: new Color('#ffffff', 0.09),
  fg: new Color('#eef2fb'),
  muted: new Color('#8d97ab'),
  dim: new Color('#5d6679'),
  ready: new Color('#2ccfa6'),
  sleep: new Color('#8d7dff'),
  train: new Color('#33b6f5'),
  accent: new Color('#6e8af0'),
  warn: new Color('#f3b562'),
  bad: new Color('#ff7272'),
  water: new Color('#3ab0ff'),
  white: new Color('#ffffff'),
  black: new Color('#000000'),
};
const F = {
  num: (s) => Font.boldRoundedSystemFont(s),
  semi: (s) => Font.semiboldRoundedSystemFont(s),
  med: (s) => Font.mediumRoundedSystemFont(s),
  reg: (s) => Font.regularRoundedSystemFont(s),
};

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'fitbitrack-widget.json');

async function loadData() {
  if (!WIDGET_KEY || WIDGET_KEY.startsWith('__')) return { error: 'nokey' };
  try {
    const req = new Request(`${APP_URL.replace(/\/$/, '')}/api/widget`);
    req.headers = { Authorization: `Bearer ${WIDGET_KEY}` };
    req.timeoutInterval = 12;
    const data = await req.loadJSON();
    if (req.response.statusCode === 401) return { error: 'badkey' };
    if (req.response.statusCode >= 400 || !data) throw new Error(String(req.response.statusCode));
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      const d = JSON.parse(fm.readString(cachePath));
      d._offline = true;
      return d;
    }
    return { error: 'offline' };
  }
}

/* ------------------------------------------------------------------ */
/* drawing helpers                                                     */
/* ------------------------------------------------------------------ */
function arc(ctx, cx, cy, r, from, to, color, width) {
  // Scriptable paths have no arcs: approximate with short segments + round caps
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 0.04));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push(new Point(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  const p = new Path();
  p.addLines(pts);
  ctx.addPath(p);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(width);
  ctx.strokePath();
  ctx.setFillColor(color);
  for (const q of [pts[0], pts[pts.length - 1]]) ctx.fillEllipse(new Rect(q.x - width / 2, q.y - width / 2, width, width));
}

/** One ring (value 0–100), optional big number in the middle. */
function ringImage(value, color, opts = {}) {
  const size = opts.size || 120;
  const w = opts.width || size * 0.1;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = size / 2 - w / 2 - 1;
  const c = size / 2;
  // full track
  const tr = new Path();
  tr.addEllipse(new Rect(c - r, c - r, 2 * r, 2 * r));
  ctx.addPath(tr);
  ctx.setStrokeColor(opts.track || C.track);
  ctx.setLineWidth(w);
  ctx.strokePath();
  if (value != null && value > 0) arc(ctx, c, c, r, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * Math.min(100, value)) / 100, color, w);
  if (opts.text != null) {
    ctx.setTextAlignedCenter();
    ctx.setTextColor(opts.textColor || C.fg);
    const fs = opts.fontSize || size * 0.3;
    ctx.setFont(F.num(fs));
    const ty = opts.sub ? c - fs * 0.72 : c - fs * 0.62;
    ctx.drawTextInRect(String(opts.text), new Rect(0, ty, size, fs * 1.3));
    if (opts.sub) {
      ctx.setFont(F.semi(size * 0.1));
      ctx.setTextColor(opts.subColor || color);
      ctx.drawTextInRect(opts.sub, new Rect(0, ty + fs * 1.08, size, size * 0.14));
    }
  }
  return ctx.getImage();
}

/** Three concentric rings (outer → inner). */
function stackedRings(vals, size) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const w = size * 0.085;
  const gap = w * 0.35;
  const c = size / 2;
  vals.forEach(([v, col], i) => {
    const r = size / 2 - w / 2 - 1 - i * (w + gap);
    const tr = new Path();
    tr.addEllipse(new Rect(c - r, c - r, 2 * r, 2 * r));
    ctx.addPath(tr);
    ctx.setStrokeColor(new Color(col.hex, 0.18));
    ctx.setLineWidth(w);
    ctx.strokePath();
    if (v != null && v > 0) arc(ctx, c, c, r, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * Math.min(100, v)) / 100, col, w);
  });
  return ctx.getImage();
}

/** The FITBITRACK mark: black heartbeat on a white tile. */
function logoImage(size) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const tile = new Path();
  tile.addRoundedRect(new Rect(0, 0, size, size), size * 0.28, size * 0.28);
  ctx.addPath(tile);
  ctx.setFillColor(C.white);
  ctx.fillPath();
  const P = [[100, 305], [225, 305], [250, 355], [305, 205], [355, 410], [390, 305], [515, 305]];
  const s = (size * 0.72) / 441;
  const o = size / 2;
  const pts = P.map(([x, y]) => new Point((x - 307.5) * s + o, (y - 307.5) * s + o));
  const p = new Path();
  p.addLines(pts);
  ctx.addPath(p);
  ctx.setStrokeColor(C.black);
  ctx.setLineWidth(Math.max(1.2, 26 * s));
  ctx.strokePath();
  return ctx.getImage();
}

/** Little line chart for the last 7 days. */
function sparkImage(values, color, w, h) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const xs = values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (xs.length < 2) return ctx.getImage();
  const min = Math.min(...xs.map((p) => p.v)) - 5;
  const max = Math.max(...xs.map((p) => p.v)) + 5;
  const pts = xs.map((p) => new Point((p.i / (values.length - 1)) * (w - 8) + 4, h - 4 - ((p.v - min) / (max - min)) * (h - 8)));
  const path = new Path();
  path.addLines(pts);
  ctx.addPath(path);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(2.5);
  ctx.strokePath();
  const last = pts[pts.length - 1];
  ctx.setFillColor(color);
  ctx.fillEllipse(new Rect(last.x - 3.5, last.y - 3.5, 7, 7));
  return ctx.getImage();
}

/* ------------------------------------------------------------------ */
/* layout helpers                                                      */
/* ------------------------------------------------------------------ */
function base(d) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bg1, C.bg2];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}
function text(stack, s, font, color, opts = {}) {
  const t = stack.addText(String(s));
  t.font = font;
  t.textColor = color;
  if (opts.lines) t.lineLimit = opts.lines;
  if (opts.min) t.minimumScaleFactor = opts.min;
  if (opts.center) t.centerAlignText();
  if (opts.right) t.rightAlignText();
  return t;
}
function header(w, title, right) {
  const h = w.addStack();
  h.centerAlignContent();
  const img = h.addImage(logoImage(36));
  img.imageSize = new Size(16, 16);
  h.addSpacer(6);
  text(h, title, F.semi(11), C.muted);
  h.addSpacer();
  if (right) text(h, right, F.semi(11), C.muted);
  return h;
}
const fmtH = (min) => (min == null ? '—' : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`);
const fmtLeft = (h) => (h == null ? '' : h < 36 ? `${Math.round(h)} h left` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h left`);
const fmtK = (n) => (n == null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('en-US'));
function batteryOf(d) {
  if (!d.batteryLive) return d.battery || null;
  const snap = d.battery;
  // reuse the app's measured drain rate (level / hours) with the fresher level from Google
  const rate = snap && snap.hoursLeft ? snap.level / snap.hoursLeft : null;
  return { level: d.batteryLive.level, hoursLeft: rate ? d.batteryLive.level / rate : null, device: d.batteryLive.device || (snap && snap.device) };
}
function staleNote(w, d) {
  const age = d.savedAt ? (Date.now() - d.savedAt) / 3600000 : null;
  if (d._offline || (age != null && age > 12)) {
    w.addSpacer(2);
    text(w, d._offline ? 'Offline · last saved data' : 'Open FITBITRACK to refresh', F.med(9), C.dim, { lines: 1, min: 0.7 });
  }
}

/* ------------------------------------------------------------------ */
/* widgets                                                             */
/* ------------------------------------------------------------------ */
function ringsSmall(d) {
  const w = base(d);
  w.setPadding(12, 12, 12, 12);
  header(w, 'FITBITRACK');
  w.addSpacer();
  const row = w.addStack();
  row.centerAlignContent();
  const img = row.addImage(stackedRings([[d.readiness && d.readiness.score, C.ready], [d.sleep && d.sleep.score, C.sleep], [d.load && d.load.score, C.train]], 160));
  img.imageSize = new Size(78, 78);
  row.addSpacer(10);
  const col = row.addStack();
  col.layoutVertically();
  for (const [lbl, v, c] of [['READY', d.readiness && d.readiness.score, C.ready], ['SLEEP', d.sleep && d.sleep.score, C.sleep], ['LOAD', d.load && d.load.score, C.train]]) {
    text(col, v == null ? '—' : v, F.num(17), c);
    text(col, lbl, F.semi(8), C.muted);
    col.addSpacer(2);
  }
  w.addSpacer();
  staleNote(w, d);
  return w;
}

function ringsMedium(d) {
  const w = base(d);
  w.setPadding(14, 16, 12, 16);
  const b = batteryOf(d);
  header(w, 'FITBITRACK', b ? `▮ ${b.level}%` : null);
  w.addSpacer(8);
  const row = w.addStack();
  const items = [
    ['READINESS', d.readiness && d.readiness.score, d.readiness ? d.readiness.label : '—', C.ready],
    ['SLEEP', d.sleep && d.sleep.score, d.sleep ? fmtH(d.sleep.minutes) : '—', C.sleep],
    ['LOAD', d.load && d.load.score, d.load ? d.load.label : '—', C.train],
  ];
  items.forEach(([lbl, v, sub, c], i) => {
    if (i) row.addSpacer();
    const col = row.addStack();
    col.layoutVertically();
    col.centerAlignContent();
    const ri = col.addImage(ringImage(v, c, { size: 150, width: 13, text: v == null ? '—' : v, fontSize: 46 }));
    ri.imageSize = new Size(66, 66);
    col.addSpacer(4);
    const l = col.addStack();
    l.addSpacer();
    text(l, lbl, F.semi(9), C.fg);
    l.addSpacer();
    const s = col.addStack();
    s.addSpacer();
    text(s, sub, F.semi(9), c);
    s.addSpacer();
  });
  w.addSpacer();
  staleNote(w, d);
  return w;
}

// three equal columns inside a Large widget (works from iPhone mini to Pro Max)
const COL_W = 98;

function today(d) {
  const w = base(d);
  w.setPadding(16, 16, 14, 16);
  const b = batteryOf(d);
  header(w, `FITBITRACK · ${new Date(d.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, b ? `▮ ${b.level}%` : null);
  w.addSpacer(10);
  // rings
  const row = w.addStack();
  [
    ['READINESS', d.readiness && d.readiness.score, d.readiness ? d.readiness.label : '—', C.ready],
    ['SLEEP', d.sleep && d.sleep.score, d.sleep ? fmtH(d.sleep.minutes) : '—', C.sleep],
    ['LOAD', d.load && d.load.score, d.load ? d.load.label : '—', C.train],
  ].forEach(([lbl, v, sub, c], i) => {
    if (i) row.addSpacer();
    const col = row.addStack();
    col.layoutVertically();
    const ri = col.addImage(ringImage(v, c, { size: 150, width: 13, text: v == null ? '—' : v, fontSize: 46 }));
    ri.imageSize = new Size(76, 76);
    col.addSpacer(4);
    const l = col.addStack();
    l.addSpacer();
    text(l, lbl, F.semi(9), C.fg);
    l.addSpacer();
    const s = col.addStack();
    s.addSpacer();
    text(s, sub, F.semi(9), c);
    s.addSpacer();
  });
  w.addSpacer(10);
  text(w, d.outlook || '', F.semi(13), C.fg, { lines: 2, min: 0.8 });
  w.addSpacer(10);
  // stats grid
  const grid = w.addStack();
  const stat = (label, value, unit, note, color) => {
    const s = grid.addStack();
    s.layoutVertically();
    s.backgroundColor = C.card;
    s.cornerRadius = 12;
    s.setPadding(8, 10, 8, 10);
    text(s, label, F.semi(8), C.muted);
    const v = s.addStack();
    v.bottomAlignContent();
    text(v, value, F.num(17), C.fg, { min: 0.6 });
    if (unit) {
      v.addSpacer(2);
      text(v, unit, F.med(9), C.muted);
    }
    text(s, note || ' ', F.semi(8), color || C.muted, { lines: 1, min: 0.7 });
    s.size = new Size(COL_W, 0);
  };
  stat('HRV', d.hrv && d.hrv.ms != null ? Math.round(d.hrv.ms) : '—', 'ms', d.hrv && d.hrv.pct != null ? `${d.hrv.pct > 0 ? '↑' : '↓'} ${Math.abs(d.hrv.pct)}%` : '', d.hrv && d.hrv.pct >= 0 ? C.ready : C.warn);
  grid.addSpacer(6);
  stat('RESTING HR', d.rhr && d.rhr.bpm != null ? Math.round(d.rhr.bpm) : '—', 'bpm', d.rhr && d.rhr.delta != null ? `${d.rhr.delta > 0 ? '↑' : '↓'} ${Math.abs(d.rhr.delta)} bpm` : '', d.rhr && d.rhr.delta <= 0 ? C.ready : C.warn);
  grid.addSpacer(6);
  stat('STEPS', fmtK(d.steps), '', d.steps != null && d.stepGoal ? `${Math.round((d.steps / d.stepGoal) * 100)}% of goal` : '', C.accent);
  w.addSpacer(8);
  const grid2 = w.addStack();
  const st2 = (label, value, note, color) => {
    const s = grid2.addStack();
    s.layoutVertically();
    s.backgroundColor = C.card;
    s.cornerRadius = 12;
    s.setPadding(8, 10, 8, 10);
    text(s, label, F.semi(8), C.muted);
    text(s, value, F.num(14), C.fg, { lines: 1, min: 0.6 });
    text(s, note || ' ', F.semi(8), color || C.muted, { lines: 1, min: 0.7 });
    s.size = new Size(COL_W, 0);
  };
  st2('TONIGHT', d.tonight ? d.tonight.bedtime : '—', d.tonight ? `wake ${d.tonight.wake}` : '', C.sleep);
  grid2.addSpacer(6);
  st2('FOOD', d.food ? `${fmtK(d.food.kcal)} kcal` : '—', d.food ? `P ${d.food.protein} g · ${(d.food.waterMl / 1000).toFixed(1)} L` : '', C.warn);
  grid2.addSpacer(6);
  st2('BAND', b ? `${b.level}%` : '—', b && b.hoursLeft != null ? fmtLeft(b.hoursLeft) : b ? b.device || '' : '', C.train);
  w.addSpacer(8);
  // 7-day readiness trend
  const tr = w.addStack();
  tr.centerAlignContent();
  text(tr, 'READINESS · 7 DAYS', F.semi(8), C.muted);
  tr.addSpacer();
  const sp = tr.addImage(sparkImage(d.readiness7 || [], C.ready, 300, 60));
  sp.imageSize = new Size(150, 30);
  w.addSpacer();
  staleNote(w, d);
  return w;
}

function sleepWidget(d) {
  const w = base(d);
  w.setPadding(12, 14, 12, 14);
  header(w, 'SLEEP');
  w.addSpacer(6);
  const row = w.addStack();
  row.centerAlignContent();
  const ri = row.addImage(ringImage(d.sleep && d.sleep.score, C.sleep, { size: 150, width: 14, text: d.sleep ? d.sleep.score : '—', fontSize: 46 }));
  ri.imageSize = new Size(64, 64);
  row.addSpacer(10);
  const col = row.addStack();
  col.layoutVertically();
  text(col, d.sleep ? fmtH(d.sleep.minutes) : '—', F.num(17), C.fg, { min: 0.7 });
  text(col, d.sleep ? d.sleep.label : '', F.semi(10), C.sleep);
  w.addSpacer();
  text(w, 'TONIGHT', F.semi(8), C.muted);
  text(w, d.tonight ? `${d.tonight.bedtime} → ${d.tonight.wake}` : '—', F.semi(12), C.fg, { lines: 1, min: 0.6 });
  staleNote(w, d);
  return w;
}

function batteryWidget(d) {
  const w = base(d);
  w.setPadding(12, 14, 12, 14);
  const b = batteryOf(d);
  header(w, 'BAND');
  w.addSpacer(6);
  const col = b && b.level <= 20 ? C.bad : b && b.level <= 40 ? C.warn : C.ready;
  const row = w.addStack();
  row.addSpacer();
  const ri = row.addImage(ringImage(b ? b.level : null, col, { size: 150, width: 14, text: b ? `${b.level}%` : '—', fontSize: 36 }));
  ri.imageSize = new Size(78, 78);
  row.addSpacer();
  w.addSpacer();
  const l = w.addStack();
  l.addSpacer();
  text(l, b && b.hoursLeft != null ? `≈ ${fmtLeft(b.hoursLeft)}` : b ? b.device || 'Fitbit' : 'No band data', F.semi(11), C.fg, { lines: 1, min: 0.7 });
  l.addSpacer();
  staleNote(w, d);
  return w;
}

function foodWidget(d) {
  const w = base(d);
  w.setPadding(12, 14, 12, 14);
  header(w, 'FOOD');
  w.addSpacer(4);
  const f = d.food || { kcal: 0, protein: 0, waterMl: 0 };
  const burned = d.calories;
  const row = w.addStack();
  row.centerAlignContent();
  const pct = burned ? (f.kcal / burned) * 100 : 0;
  const ri = row.addImage(ringImage(pct, C.warn, { size: 150, width: 14, text: fmtK(f.kcal), fontSize: 34, sub: 'kcal' }));
  ri.imageSize = new Size(70, 70);
  row.addSpacer(10);
  const col = row.addStack();
  col.layoutVertically();
  text(col, 'BURNED', F.semi(8), C.muted);
  text(col, fmtK(burned), F.num(14), C.fg);
  col.addSpacer(4);
  text(col, 'BALANCE', F.semi(8), C.muted);
  text(col, burned != null ? `${f.kcal - burned > 0 ? '+' : ''}${fmtK(f.kcal - burned)}` : '—', F.num(14), burned != null && f.kcal - burned > 0 ? C.warn : C.ready);
  w.addSpacer();
  text(w, `Protein ${f.protein} g · Water ${(f.waterMl / 1000).toFixed(1)} L`, F.semi(10), C.fg, { lines: 1, min: 0.7 });
  staleNote(w, d);
  return w;
}

/* lock screen */
function accessoryCircular(d, param) {
  const w = new ListWidget();
  w.url = APP_URL;
  const pick = param === 'sleep' ? [d.sleep && d.sleep.score, 'SLP'] : param === 'battery' ? [batteryOf(d) ? batteryOf(d).level : null, 'BAND'] : [d.readiness && d.readiness.score, 'RDY'];
  const img = w.addImage(ringImage(pick[0], C.white, { size: 120, width: 12, track: new Color('#ffffff', 0.25), text: pick[0] == null ? '—' : pick[0], fontSize: 40, sub: pick[1], textColor: C.white, subColor: C.white }));
  img.centerAlignImage();
  return w;
}
function accessoryRectangular(d) {
  const w = new ListWidget();
  w.url = APP_URL;
  const r = w.addStack();
  const cell = (lbl, v) => {
    const s = r.addStack();
    s.layoutVertically();
    text(s, v == null ? '—' : v, F.num(18), C.white);
    text(s, lbl, F.semi(9), C.white);
  };
  cell('READY', d.readiness && d.readiness.score);
  r.addSpacer();
  cell('SLEEP', d.sleep && d.sleep.score);
  r.addSpacer();
  cell('LOAD', d.load && d.load.score);
  r.addSpacer();
  const b = batteryOf(d);
  cell('BAND', b ? `${b.level}%` : null);
  return w;
}
function accessoryInline(d) {
  const w = new ListWidget();
  const b = batteryOf(d);
  text(w, `♥ ${d.readiness ? d.readiness.score : '—'} · ☾ ${d.sleep ? d.sleep.score : '—'}${b ? ` · ▮${b.level}%` : ''}`, F.semi(12), C.white);
  return w;
}

function errorWidget(kind) {
  const w = base({});
  w.setPadding(14, 14, 14, 14);
  header(w, 'FITBITRACK');
  w.addSpacer();
  const msg =
    kind === 'nokey'
      ? 'Add your widget key: FITBITRACK → Profile → Widgets → Copy script.'
      : kind === 'badkey'
        ? 'Widget key not valid anymore. Copy the script again from Profile → Widgets.'
        : 'Can’t reach FITBITRACK right now.';
  text(w, msg, F.semi(12), C.fg, { lines: 4, min: 0.7 });
  w.addSpacer();
  return w;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
const param = String(args.widgetParameter || '').trim().toLowerCase() || 'rings';
const family = config.widgetFamily || 'medium';
const data = await loadData();

let widget;
if (data.error && !data.date) widget = errorWidget(data.error);
else if (family === 'accessoryCircular') widget = accessoryCircular(data, param);
else if (family === 'accessoryRectangular') widget = accessoryRectangular(data);
else if (family === 'accessoryInline') widget = accessoryInline(data);
else if (param === 'today') widget = family === 'small' ? ringsSmall(data) : today(data);
else if (param === 'sleep') widget = sleepWidget(data);
else if (param === 'battery') widget = batteryWidget(data);
else if (param === 'food') widget = foodWidget(data);
else widget = family === 'small' ? ringsSmall(data) : family === 'large' || family === 'extraLarge' ? today(data) : ringsMedium(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // running inside Scriptable: preview every size
  const menu = new Alert();
  menu.title = 'FITBITRACK widgets';
  menu.message = 'Preview a widget';
  ['Rings · small', 'Rings · medium', 'Today · large', 'Sleep · small', 'Battery · small', 'Food · small'].forEach((x) => menu.addAction(x));
  menu.addCancelAction('Close');
  const i = await menu.presentSheet();
  if (data.error && !data.date) await errorWidget(data.error).presentMedium();
  else if (i === 0) await ringsSmall(data).presentSmall();
  else if (i === 1) await ringsMedium(data).presentMedium();
  else if (i === 2) await today(data).presentLarge();
  else if (i === 3) await sleepWidget(data).presentSmall();
  else if (i === 4) await batteryWidget(data).presentSmall();
  else if (i === 5) await foodWidget(data).presentSmall();
}
Script.complete();
