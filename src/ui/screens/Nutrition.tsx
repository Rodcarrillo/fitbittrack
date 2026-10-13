import React, { useState } from 'react';
import { useApp } from '../../state/store';
import { addDays, fmtISO, toDate } from '../../calc/stats';
import { compressImage, MEAL_LABEL } from '../../data/nutrition';
import type { FoodEntry, MealType } from '../../domain/types';
import { IconCamera, IconPlus, IconTrash, IconWater } from '../components/Icons';

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER', 'ANYTIME'];
export const WATER_GOAL_ML = 2500;

export function dayTotals(food: FoodEntry[], date: string) {
  const xs = food.filter((f) => f.date === date);
  const sum = (k: 'proteinG' | 'carbsG' | 'fatG') => xs.reduce((a, f) => a + (f[k] ?? 0), 0);
  return { items: xs, kcal: xs.reduce((a, f) => a + f.kcal, 0), protein: sum('proteinG'), carbs: sum('carbsG'), fat: sum('fatG') };
}

/** "Take photo" button: opens the camera right away (needs the tap), then the add-food sheet with the photo. */
export function PhotoButton({ className = 'btn btn--primary', label = 'Take photo' }: { className?: string; label?: string }) {
  const { openSheet } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <label className={`${className} photo-btn ${busy ? 'is-busy' : ''}`}>
      <IconCamera size={18} /> {busy ? 'Opening…' : label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            openSheet('food', await compressImage(f));
          } catch {
            openSheet('food');
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

/** Compact card for Today: calories in vs out, macros, and the photo button. */
export function NutritionTodayCard() {
  const { raw, openSheet, setTab } = useApp();
  if (!raw) return null;
  const today = raw.today;
  const t = dayTotals(raw.food ?? [], today);
  const burned = raw.days.find((d) => d.date === today)?.calories ?? null;
  const water = (raw.water ?? []).filter((w) => w.date === today).reduce((a, w) => a + w.ml, 0);
  return (
    <section className="card nutri-today">
      <div className="row-between">
        <div className="eyebrow">Food today</div>
        <button className="link fine" onClick={() => setTab('nutrition')} type="button">
          Details →
        </button>
      </div>
      <div className="nutri-today__row">
        <div>
          <b className="num big">{t.kcal.toLocaleString('en-US')}</b>
          <span className="fine"> kcal eaten</span>
        </div>
        <div className="fine">
          {burned != null ? `${Math.round(burned).toLocaleString('en-US')} burned · ` : ''}
          {Math.round(t.protein)} g protein · {(water / 1000).toFixed(1)} L water
        </div>
      </div>
      <div className="nutri-actions">
        <PhotoButton />
        <button className="btn btn--ghost" onClick={() => openSheet('food')} type="button">
          <IconPlus size={16} /> Add food
        </button>
      </div>
    </section>
  );
}

export function NutritionScreen() {
  const { raw, openSheet, addWater, removeFood, removeWater, analysis } = useApp();
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!raw) return null;
  const today = raw.today;
  const day = date ?? today;
  const food = raw.food ?? [];
  const water = raw.water ?? [];
  const t = dayTotals(food, day);
  const burned = raw.days.find((d) => d.date === day)?.calories ?? null;
  const waterDay = water.filter((w) => w.date === day);
  const waterMl = waterDay.reduce((a, w) => a + w.ml, 0);
  const weight = raw.profile.weightKg > 0 ? raw.profile.weightKg : 75;
  const proteinGoal = Math.round(weight * 1.6);
  const macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  const pct = (g: number, k: number) => (macroKcal > 0 ? Math.round(((g * k) / macroKcal) * 100) : 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const week = days.map((d) => ({ d, eaten: dayTotals(food, d).kcal, burned: raw.days.find((x) => x.date === d)?.calories ?? 0 }));
  const maxK = Math.max(1, ...week.map((w) => Math.max(w.eaten, w.burned)));
  const logged = week.filter((w) => w.eaten > 0);
  const avgEaten = logged.length ? logged.reduce((a, w) => a + w.eaten, 0) / logged.length : 0;
  const avgBalance = logged.length ? logged.reduce((a, w) => a + (w.eaten - w.burned), 0) / logged.length : 0;
  const unavailable = /error 403/.test(raw.source.diagnostics?.food ?? '');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">Food</h1>
          <p className="screen__sub">Saved to Google Health · also shows in the Fitbit app</p>
        </div>
      </header>

      {unavailable && (
        <section className="card connect-banner">
          <div>
            <b>Allow food & water</b>
            <p className="fine">Reconnect Google Health and tick the nutrition boxes so FITBITRACK can read and save your meals.</p>
          </div>
          <a className="btn btn--primary btn--sm" href="/auth/google/start">
            Reconnect
          </a>
        </section>
      )}

      <div className="daynav">
        <button className="icon-btn" onClick={() => setDate(addDays(day, -1))} aria-label="Previous day" type="button">
          ‹
        </button>
        <b>{day === today ? 'Today' : toDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</b>
        <button className="icon-btn" onClick={() => setDate(day >= today ? today : addDays(day, 1))} disabled={day >= today} aria-label="Next day" type="button">
          ›
        </button>
      </div>

      <div className="nutri-grid">
        <section className="card nutri-sum">
          <div className="nutri-sum__top">
            <div>
              <span className="eyebrow">Eaten</span>
              <b className="num big">{t.kcal.toLocaleString('en-US')}</b>
              <span className="fine">kcal</span>
            </div>
            <div>
              <span className="eyebrow">Burned</span>
              <b className="num big">{burned != null ? Math.round(burned).toLocaleString('en-US') : '—'}</b>
              <span className="fine">kcal · Fitbit</span>
            </div>
            <div>
              <span className="eyebrow">Balance</span>
              <b className={`num big ${burned != null && t.kcal - burned > 0 ? 'is-warn' : 'is-good'}`}>{burned != null ? `${t.kcal - burned > 0 ? '+' : ''}${Math.round(t.kcal - burned).toLocaleString('en-US')}` : '—'}</b>
              <span className="fine">{burned != null ? (t.kcal - burned > 0 ? 'surplus' : 'deficit') : ''}</span>
            </div>
          </div>
          <div className="macros">
            <Macro label="Protein" g={t.protein} goal={proteinGoal} pct={pct(t.protein, 4)} color="var(--accent)" />
            <Macro label="Carbs" g={t.carbs} pct={pct(t.carbs, 4)} color="var(--sleep)" />
            <Macro label="Fat" g={t.fat} pct={pct(t.fat, 9)} color="var(--warn)" />
          </div>
          <div className="nutri-actions">
            <PhotoButton />
            <button className="btn btn--ghost" onClick={() => openSheet('food', day === today ? undefined : `date:${day}`)} type="button">
              <IconPlus size={16} /> Add food
            </button>
          </div>
        </section>

        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Water</div>
            <span className="fine">
              {(waterMl / 1000).toFixed(2)} / {(WATER_GOAL_ML / 1000).toFixed(1)} L
            </span>
          </div>
          <div className="water-bar">
            <span style={{ width: `${Math.min(100, (waterMl / WATER_GOAL_ML) * 100)}%` }} />
          </div>
          {day === today && (
            <div className="nutri-actions">
              {[250, 500].map((ml) => (
                <button key={ml} className="btn btn--ghost" disabled={!!busy} onClick={() => run(`w${ml}`, () => addWater(ml))} type="button">
                  <IconWater size={16} /> {busy === `w${ml}` ? 'Saving…' : `+${ml} ml`}
                </button>
              ))}
            </div>
          )}
          {waterDay.length > 0 && (
            <p className="fine">
              {waterDay.map((w) => (
                <span key={w.id} className="water-chip">
                  {w.ml} ml · {new Date(w.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  <button onClick={() => run(w.id, () => removeWater(w.id))} aria-label="Delete water entry" type="button">
                    ×
                  </button>
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="card">
          <div className="eyebrow">Meals</div>
          {!t.items.length && <p className="fine">Nothing logged{day === today ? ' yet today. Take a photo of your plate or add it by hand.' : ' this day.'}</p>}
          {MEAL_ORDER.map((m) => {
            const xs = t.items.filter((f) => f.meal === m);
            if (!xs.length) return null;
            return (
              <div key={m} className="meal">
                <div className="row-between">
                  <b>{MEAL_LABEL[m]}</b>
                  <span className="fine num">{xs.reduce((a, f) => a + f.kcal, 0)} kcal</span>
                </div>
                {xs.map((f) => (
                  <div key={f.id} className="foodrow">
                    <div>
                      <span>{f.name}</span>
                      <span className="fine">
                        {f.proteinG != null ? `P ${Math.round(f.proteinG)} g` : ''}
                        {f.carbsG != null ? ` · C ${Math.round(f.carbsG)} g` : ''}
                        {f.fatG != null ? ` · F ${Math.round(f.fatG)} g` : ''}
                      </span>
                    </div>
                    <span className="num">{f.kcal}</span>
                    <button className="setdel" disabled={busy === f.id} onClick={() => run(f.id, () => removeFood(f.id))} aria-label={`Delete ${f.name}`} type="button">
                      <IconTrash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {err && <div className="notice">{err}</div>}
        </section>

        <section className="card">
          <div className="row-between">
            <div className="eyebrow">Last 7 days</div>
            <span className="fine">
              <span className="dot dot--eat" /> eaten <span className="dot dot--burn" /> burned
            </span>
          </div>
          <div className="kbars" role="img" aria-label="Calories eaten vs burned, last 7 days">
            {week.map((w) => (
              <button key={w.d} className={`kbars__col ${w.d === day ? 'is-on' : ''}`} onClick={() => setDate(w.d)} type="button">
                <span className="kbars__pair">
                  <span className="kbars__bar kbars__bar--eat" style={{ height: `${(w.eaten / maxK) * 100}%` }} />
                  <span className="kbars__bar kbars__bar--burn" style={{ height: `${(w.burned / maxK) * 100}%` }} />
                </span>
                <span className="fine">{toDate(w.d).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              </button>
            ))}
          </div>
          {logged.length > 0 && (
            <p className="fine">
              Logged {logged.length} of 7 days · average {Math.round(avgEaten).toLocaleString('en-US')} kcal eaten · average {avgBalance > 0 ? 'surplus' : 'deficit'} of {Math.abs(Math.round(avgBalance)).toLocaleString('en-US')} kcal.
              {analysis?.today.load.score != null && analysis.today.load.score >= 70 ? ' Training load is high: keep protein up and avoid big deficits.' : ''}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Macro({ label, g, goal, pct, color }: { label: string; g: number; goal?: number; pct: number; color: string }) {
  const fill = goal ? Math.min(100, (g / goal) * 100) : pct;
  return (
    <div className="macro">
      <div className="row-between">
        <span>{label}</span>
        <span className="fine num">
          {Math.round(g)} g{goal ? ` / ${goal}` : ''} · {pct}%
        </span>
      </div>
      <span className="macro__track">
        <span style={{ width: `${fill}%`, background: color }} />
      </span>
    </div>
  );
}

export const todayISO = () => fmtISO(new Date());
