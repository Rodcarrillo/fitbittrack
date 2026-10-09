import { useEffect, useRef } from 'react';
import { api } from '../auth/session';

export const SERVER_MODE = (import.meta as any).env?.VITE_DATA_PROVIDER === 'google';

/**
 * Keeps one piece of per-account state in sync with the FITBITRACK server
 * (GET/PUT /api/data/<key>), so workouts and journal follow you between devices.
 * On start the server copy wins if it exists; afterwards every change is saved
 * (debounced). Local storage stays as the offline cache.
 */
export function useCloudSync<T>(key: 'workouts' | 'journal' | 'settings', value: T | null, apply: (v: T) => void, enabled = SERVER_MODE) {
  const ready = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const hasValue = value != null;

  // initial pull, once the local value exists
  useEffect(() => {
    if (!enabled || !hasValue || ready.current) return;
    let cancelled = false;
    api<{ value: T | null }>(`/api/data/${key}`)
      .then((r) => {
        if (cancelled) return;
        if (r.value != null) applyRef.current(r.value);
        ready.current = true;
        if (r.value == null) push(value);
      })
      .catch(() => {
        ready.current = true; // offline: keep working locally, push on next change
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasValue, key]);

  // debounced push on change
  useEffect(() => {
    if (!enabled || !ready.current || value == null) return;
    const t = setTimeout(() => push(value), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function push(v: T | null) {
    if (v == null) return;
    api(`/api/data/${key}`, { method: 'PUT', body: JSON.stringify({ value: v }) }).catch(() => {
      /* retried on the next change */
    });
  }
}
