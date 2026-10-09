import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { HealthDataset, JournalEntry, JournalTag, MetricKey } from '../domain/types';
import { createProvider } from '../data/providers';
import { scoped, type Account } from '../auth/account';
import { useCloudSync } from '../data/cloudSync';
import { computeAllScores } from '../calc/scores';
import { analyze, type Analysis } from '../insights/engine';

/* ---------------- permissions ---------------- */

export type PermissionKey = 'sleep' | 'heartRate' | 'hrv' | 'exercise' | 'steps' | 'calories' | 'weight' | 'respiratory' | 'spo2' | 'other';

export const PERMISSIONS: { key: PermissionKey; label: string; detail: string; metrics: MetricKey[] }[] = [
  { key: 'sleep', label: 'Sleep', detail: 'Sleep sessions and stages', metrics: ['sleep', 'sleepStages'] },
  { key: 'heartRate', label: 'Heart rate', detail: 'Resting HR and heart-rate zones', metrics: ['restingHr', 'hrZones'] },
  { key: 'hrv', label: 'HRV', detail: 'Nightly heart rate variability', metrics: ['hrv'] },
  { key: 'exercise', label: 'Exercise', detail: 'Workouts, duration and intensity', metrics: ['exercise'] },
  { key: 'steps', label: 'Steps', detail: 'Daily step count', metrics: ['steps'] },
  { key: 'calories', label: 'Calories', detail: 'Energy burned', metrics: ['calories'] },
  { key: 'weight', label: 'Weight', detail: 'Logged body weight', metrics: ['weight'] },
  { key: 'respiratory', label: 'Respiratory data', detail: 'Breathing rate during sleep', metrics: ['respiratoryRate'] },
  { key: 'spo2', label: 'Oxygen saturation', detail: 'Overnight SpO₂', metrics: ['spo2'] },
  { key: 'other', label: 'Other supported metrics', detail: 'Skin temperature, VO₂ max', metrics: ['skinTemp', 'vo2max'] },
];

const ALL_ON = Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])) as Record<PermissionKey, boolean>;

/** Per-viewer convenience storage. Never holds tokens or raw health data. */
const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(k === 'theme' ? 'fitbitrack:theme' : scoped(k));
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k === 'theme' ? 'fitbitrack:theme' : scoped(k), JSON.stringify(v));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
};

/** Strip any metric the user hasn't granted, so the UI and calculations never see it. */
function applyPermissions(ds: HealthDataset, perms: Record<PermissionKey, boolean>): HealthDataset {
  const availability = { ...ds.availability };
  for (const p of PERMISSIONS) if (!perms[p.key]) p.metrics.forEach((m) => (availability[m] = false));
  return {
    ...ds,
    availability,
    days: ds.days.map((d) => ({
      ...d,
      restingHr: availability.restingHr ? d.restingHr : null,
      hrv: availability.hrv ? d.hrv : null,
      respiratoryRate: availability.respiratoryRate ? d.respiratoryRate : null,
      spo2: availability.spo2 ? d.spo2 : null,
      skinTempDelta: availability.skinTemp ? d.skinTempDelta : null,
      steps: availability.steps ? d.steps : null,
      calories: availability.calories ? d.calories : null,
      weightKg: availability.weight ? d.weightKg : null,
      vo2max: availability.vo2max ? d.vo2max : null,
    })),
    sleep: availability.sleep ? ds.sleep.map((s) => (availability.sleepStages ? s : { ...s, stages: null })) : [],
    exercises: availability.exercise ? ds.exercises.map((e) => (availability.hrZones ? e : { ...e, zones: null })) : [],
  };
}

/* ---------------- navigation ---------------- */

/** 'auto' follows the device (prefers-color-scheme). */
export type ThemePref = 'auto' | 'light' | 'dark';

export type Tab = 'today' | 'health' | 'train' | 'trends' | 'profile';
export type HealthView = 'recovery' | 'sleep' | 'age';
export type Sheet = null | 'insights' | 'coach' | 'journal' | 'connect' | 'privacy';

export type BodyOverrides = { age?: number; heightCm?: number; weightKg?: number };

interface Ctx {
  body: BodyOverrides;
  setBody: (b: BodyOverrides) => void;
  loading: boolean;
  error: string | null;
  analysis: Analysis | null;
  raw: HealthDataset | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  healthView: HealthView;
  setHealthView: (v: HealthView) => void;
  sheet: Sheet;
  openSheet: (s: Sheet, payload?: string) => void;
  sheetPayload: string | null;
  permissions: Record<PermissionKey, boolean>;
  setPermission: (k: PermissionKey, on: boolean) => void;
  toggleJournalTag: (tag: JournalTag) => void;
  setJournalNote: (note: string) => void;
  todayJournal: JournalEntry;
  refresh: () => Promise<void>;
  refreshing: boolean;
  account: Account | null;
  logout: () => void;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

export function AppProvider({ children, account, onLogout }: { children: React.ReactNode; account?: Account; onLogout?: () => void }) {
  const provider = useMemo(() => createProvider(), []);
  const [raw, setRaw] = useState<HealthDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setThemeState] = useState<ThemePref>(() => store.get<ThemePref>('theme', 'auto'));
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-fbt-theme');
    else root.setAttribute('data-fbt-theme', theme);
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#07090e' : '#f3f5fa');
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);
  const setTheme = (t: ThemePref) => {
    setThemeState(t);
    store.set('theme', t);
    haptic();
  };
  const [error, setError] = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(() => {
    const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
    return (['today', 'health', 'train', 'trends', 'profile'].includes(h) ? h : store.get<Tab>('tab', 'today')) as Tab;
  });
  const [healthView, setHealthView] = useState<HealthView>('recovery');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetPayload, setSheetPayload] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(() => ({ ...ALL_ON, ...store.get('permissions', {}) }));
  const [journalEdits, setJournalEdits] = useState<Record<string, JournalEntry>>(() => store.get('journal', {}));

  const [body, setBodyState] = useState<BodyOverrides>(() => store.get('body', {}));
  const setBody = (b: BodyOverrides) => {
    setBodyState(b);
    store.set('body', b);
  };
  useCloudSync<{ body?: BodyOverrides }>('settings', { body }, (v) => {
    if (v?.body) {
      setBodyState(v.body);
      store.set('body', v.body);
    }
  });

  useCloudSync<Record<string, JournalEntry>>('journal', journalEdits, (v) => {
    setJournalEdits(v);
    store.set('journal', v);
  });

  const load = useCallback(async () => {
    try {
      setError(null);
      const ds = await provider.load();
      // the signed-in account's name wins over the data source's profile name
      setRaw(account ? { ...ds, profile: { ...ds.profile, name: account.displayName.split(' ')[0] || ds.profile.name } } : ds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your data.');
    }
  }, [provider]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    haptic(12);
    await load();
    setRefreshing(false);
  }, [load]);

  const setTab = (t: Tab) => {
    setTabState(t);
    store.set('tab', t);
    haptic();
  };

  const setPermission = (k: PermissionKey, on: boolean) => {
    setPermissions((p) => {
      const next = { ...p, [k]: on };
      store.set('permissions', next);
      return next;
    });
  };

  const merged = useMemo(() => {
    if (!raw) return null;
    const journal = [...raw.journal.filter((j) => !journalEdits[j.date])];
    Object.values(journalEdits).forEach((j) => journal.push(j));
    journal.sort((a, b) => a.date.localeCompare(b.date));
    const profile = { ...raw.profile, ...Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'number' && v > 0)) };
    if (body.age && !raw.profile.maxHr) profile.maxHr = 220 - body.age;
    return applyPermissions({ ...raw, profile, journal }, permissions);
  }, [raw, permissions, journalEdits, body]);

  const analysis = useMemo(() => (merged ? analyze(merged, computeAllScores(merged)) : null), [merged]);

  const todayDate = raw?.today ?? '';
  const todayJournal: JournalEntry = merged?.journal.find((j) => j.date === todayDate) ?? { date: todayDate, tags: [] };

  const saveJournal = (entry: JournalEntry) =>
    setJournalEdits((prev) => {
      const next = { ...prev, [entry.date]: entry };
      store.set('journal', next);
      return next;
    });

  const toggleJournalTag = (tag: JournalTag) => {
    haptic();
    const has = todayJournal.tags.includes(tag);
    saveJournal({ ...todayJournal, tags: has ? todayJournal.tags.filter((t) => t !== tag) : [...todayJournal.tags, tag] });
  };
  const setJournalNote = (note: string) => saveJournal({ ...todayJournal, note });

  const openSheet = (s: Sheet, payload?: string) => {
    setSheet(s);
    setSheetPayload(payload ?? null);
    if (s) haptic();
  };

  return (
    <AppCtx.Provider
      value={{ body, setBody, loading, error, analysis, raw, tab, setTab, healthView, setHealthView, sheet, openSheet, sheetPayload, permissions, setPermission, toggleJournalTag, setJournalNote, todayJournal, refresh, refreshing, theme, setTheme, account: account ?? null, logout: () => onLogout?.() }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
};
