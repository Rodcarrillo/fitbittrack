/**
 * Thin client for the FITBITRACK backend. Auth is a server-side session cookie
 * (httpOnly, Secure, SameSite=Lax) — no tokens are stored in JS, localStorage or logs.
 */
const BASE: string = (import.meta as any).env?.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new ApiError(401, 'Your Google Health session expired. Reconnect to keep syncing.');
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Read-only scopes FITBITRACK requests. Never ask for write scopes we don't use. */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly', // paired devices + battery
];
