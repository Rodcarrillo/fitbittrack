import React from 'react';
import { useWorkouts, type WorkoutView } from '../../workouts/store';
import { LoadView } from '../screens/Train';
import { WorkoutsHome } from './Home';
import { RoutinesView, RoutineEditor } from './Routines';
import { HistoryView, WorkoutDetail } from './History';
import { ExercisesView, ExerciseDetail } from './Exercises';
import { PRsView } from './PRs';
import { HevyPage } from './Hevy';

const VIEWS: { v: WorkoutView; label: string }[] = [
  { v: 'home', label: 'Workouts' },
  { v: 'routines', label: 'Routines' },
  { v: 'history', label: 'History' },
  { v: 'exercises', label: 'Exercises' },
  { v: 'prs', label: 'PRs' },
  { v: 'load', label: 'Load' },
];

/** Train tab: the strength tracker (FITBITRACK-owned) + Fitbit training load. */
export function TrainScreen() {
  const { view, setView, page, data } = useWorkouts();

  if (page) {
    return (
      <div className="screen">
        {page.kind === 'routine' && <RoutineEditor id={page.id} />}
        {page.kind === 'workout' && <WorkoutDetail id={page.id} />}
        {page.kind === 'exercise' && <ExerciseDetail id={page.id} />}
        {page.kind === 'hevy' && <HevyPage />}
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen__head screen__head--tight">
        <h1 className="screen__title">Train</h1>
      </header>
      <nav className="subnav" aria-label="Train sections">
        {VIEWS.map((x) => (
          <button key={x.v} className={`subnav__item ${view === x.v ? 'is-on' : ''}`} onClick={() => setView(x.v)} aria-current={view === x.v ? 'page' : undefined} type="button">
            {x.label}
          </button>
        ))}
      </nav>
      {!data && view !== 'load' ? (
        <div className="sk sk--card" style={{ height: 220 }} />
      ) : (
        <div className="wview" key={view}>
          {view === 'home' && <WorkoutsHome />}
          {view === 'routines' && <RoutinesView />}
          {view === 'history' && <HistoryView />}
          {view === 'exercises' && <ExercisesView />}
          {view === 'prs' && <PRsView />}
          {view === 'load' && <LoadView />}
        </div>
      )}
    </div>
  );
}

export function BackBar({ title, onBack, right }: { title?: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="backbar">
      <button className="backbar__btn" onClick={onBack} type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
        {title ?? 'Back'}
      </button>
      {right}
    </div>
  );
}
