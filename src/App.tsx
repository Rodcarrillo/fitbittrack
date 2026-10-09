import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAuth, setStorageScope, type Account } from './auth/account';
import { LoginScreen } from './ui/screens/Login';
import { AppProvider, useApp, type Tab } from './state/store';
import { TodayScreen } from './ui/screens/Today';
import { HealthScreen } from './ui/screens/Health';
import { TrainScreen } from './ui/workouts/WorkoutsTab';
import { TrendsScreen } from './ui/screens/Trends';
import { ProfileScreen } from './ui/screens/Profile';
import { Sheets } from './ui/screens/Sheets';
import { BandIcon, Splash, Wordmark } from './ui/components/Logo';
import { WorkoutProvider } from './workouts/store';
import { ActiveWorkoutLayer } from './ui/workouts/ActiveWorkout';
import { IconAuto, IconMoon, IconSun, IconDumbbell, IconHeart, IconProfile, IconRefresh, IconSpark, IconToday, IconTrends } from './ui/components/Icons';

const NAV: { tab: Tab; label: string; icon: React.ReactNode }[] = [
  { tab: 'today', label: 'Today', icon: <IconToday size={22} /> },
  { tab: 'health', label: 'Health', icon: <IconHeart size={22} /> },
  { tab: 'train', label: 'Train', icon: <IconDumbbell size={22} /> },
  { tab: 'trends', label: 'Trends', icon: <IconTrends size={22} /> },
  { tab: 'profile', label: 'Profile', icon: <IconProfile size={22} /> },
];

function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);
  useEffect(() => {
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const down = (e: TouchEvent) => {
      // only from the very top of the page, and never inside sheets / scrollable panels
      const inPanel = (e.target as HTMLElement | null)?.closest?.('.sheet-wrap, .aw, .chips--scroll, .subnav, input, textarea');
      start.current = window.scrollY <= 0 && !inPanel ? { y: e.touches[0].clientY, x: e.touches[0].clientX } : null;
    };
    const move = (e: TouchEvent) => {
      if (!start.current) return;
      if (window.scrollY > 0) {
        start.current = null;
        set(0);
        return;
      }
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dx > Math.abs(dy)) return; // horizontal swipe
      set(dy > 12 ? Math.min(90, (dy - 12) * 0.5) : 0);
    };
    const up = () => {
      if (pullRef.current >= 60) onRefresh();
      set(0);
      start.current = null;
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, [onRefresh]);
  return pull;
}

function Shell() {
  const { tab, setTab, loading, error, analysis, refresh, refreshing, openSheet, raw, theme, setTheme } = useApp();
  const nextTheme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  const pull = usePullToRefresh(refresh);
  const device = raw?.devices[0];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <Wordmark />
          <span className="sidebar__tag">Your Fitbit data. Reimagined.</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map((n) => (
            <button key={n.tab} className={`navitem ${tab === n.tab ? 'is-active' : ''}`} onClick={() => setTab(n.tab)} aria-current={tab === n.tab ? 'page' : undefined} type="button">
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar__coach" onClick={() => openSheet('coach')} type="button">
          <IconSpark size={16} /> Ask FITBITRACK
        </button>
        {device && (
          <div className="sidebar__device">
            <BandIcon size={22} />
            <span>
              {device.name}
              <span className="fine">{device.battery}% battery</span>
            </span>
          </div>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <Wordmark />
          <div className="topbar__right">
            {raw?.source.isSample && (
              <button className="sample-chip" onClick={() => openSheet('connect')} type="button">
                Sample
              </button>
            )}
            {device && (
              <span className="battery" title={`${device.name} battery`}>
                <span className="num">{device.battery}%</span>
                <BandIcon size={20} />
              </span>
            )}
            <button className="icon-btn theme-btn" onClick={() => setTheme(nextTheme)} aria-label={`Appearance: ${theme}. Switch to ${nextTheme}`} title={`Appearance: ${theme === 'auto' ? 'Auto (device)' : theme}`} type="button">
              {theme === 'light' ? <IconSun size={18} /> : theme === 'dark' ? <IconMoon size={18} /> : <IconAuto size={18} />}
            </button>
            <button className={`icon-btn refresh-btn ${refreshing ? 'is-spinning' : ''}`} onClick={refresh} aria-label="Refresh data" type="button">
              <IconRefresh size={18} />
            </button>
          </div>
        </header>

        <div className="ptr" style={{ opacity: Math.min(1, pull / 60), transform: `rotate(${pull * 3}deg)` }} aria-hidden="true">
          <IconRefresh size={18} className={pull >= 60 ? 'is-ready' : ''} />
        </div>

        <main className="content" key={tab}>
          {loading && !analysis ? (
            <Skeleton />
          ) : error ? (
            <div className="card notice">
              {error}
              <button className="btn btn--ghost" onClick={refresh} type="button">
                Try again
              </button>
            </div>
          ) : (
            <>
              {tab === 'today' && <TodayScreen />}
              {tab === 'health' && <HealthScreen />}
              {tab === 'train' && <TrainScreen />}
              {tab === 'trends' && <TrendsScreen />}
              {tab === 'profile' && <ProfileScreen />}
            </>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="Main navigation">
        {NAV.map((n) => (
          <button key={n.tab} className={`tabbar__item ${tab === n.tab ? 'is-active' : ''}`} onClick={() => setTab(n.tab)} aria-current={tab === n.tab ? 'page' : undefined} type="button">
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <Sheets />
      <ActiveWorkoutLayer />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="screen skeleton" aria-busy="true" aria-label="Loading your data">
      <div className="sk sk--line" style={{ width: '40%' }} />
      <div className="sk sk--title" style={{ width: '70%' }} />
      <div className="sk sk--card" style={{ height: 180 }} />
      <div className="sk sk--card" style={{ height: 110 }} />
      <div className="sk sk--card" style={{ height: 150 }} />
    </div>
  );
}

/** Applies the saved appearance before any provider mounts, so the login screen matches too. */
function applySavedTheme() {
  try {
    const t = JSON.parse(localStorage.getItem('fitbitrack:theme') ?? '"auto"');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-fbt-theme', t);
  } catch {
    /* default: follow the device */
  }
}

export default function App() {
  const [splash, setSplash] = useState(true);
  const done = useCallback(() => setSplash(false), []);
  const auth = useMemo(() => createAuth(), []);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  useEffect(() => {
    applySavedTheme();
    auth.current().then((a) => setAccount(a));
  }, [auth]);

  const signedIn = (a: Account) => {
    setStorageScope(a.id);
    setAccount(a);
  };
  const logout = async () => {
    await auth.logout();
    setAccount(null);
  };
  if (account) setStorageScope(account.id);

  return (
    <>
      {account ? (
        <AppProvider key={account.id} account={account} onLogout={logout}>
          <WorkoutProvider>
            <Shell />
          </WorkoutProvider>
        </AppProvider>
      ) : account === null ? (
        <LoginScreen auth={auth} onAuthed={signedIn} />
      ) : null}
      {splash && <Splash ready={account !== undefined} onDone={done} />}
    </>
  );
}
