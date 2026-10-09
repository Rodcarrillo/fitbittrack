/**
 * FITBITRACK accounts (username + password).
 *
 * Two implementations behind one interface:
 *  - ServerAuth  — production. Passwords are hashed with scrypt on the FITBITRACK server and the
 *                  browser only holds an httpOnly session cookie (see server/index.mjs).
 *  - DeviceAuth  — preview / offline. Accounts live on this device only; passwords are never
 *                  stored, only a PBKDF2-SHA256 hash (150k iterations, random salt).
 * Every user's workouts, journal and settings are stored under their own account id.
 */
import { api, ApiError } from './session';

export interface Account {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface AuthService {
  readonly kind: 'server' | 'device';
  current(): Promise<Account | null>;
  register(username: string, password: string, displayName: string): Promise<Account>;
  login(username: string, password: string): Promise<Account>;
  logout(): Promise<void>;
}

export class AuthError extends Error {}

export const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
export const normalizeUsername = (u: string) => u.trim().toLowerCase();

export function validateNew(username: string, password: string, confirm: string, displayName: string): string | null {
  if (!displayName.trim()) return 'Add your name so FITBITRACK can greet you.';
  if (!USERNAME_RE.test(normalizeUsername(username))) return 'Usernames use 3–24 letters, numbers, dots or underscores.';
  if (password.length < 8) return 'Use at least 8 characters for your password.';
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

/* ---------------- device (preview) ---------------- */

interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  salt: string;
  hash: string;
}

const USERS_KEY = 'fitbitrack:accounts:v1';
const SESSION_KEY = 'fitbitrack:session:v1';
const LOCK_KEY = 'fitbitrack:login-lock';

const ls = {
  get<T>(k: string, f: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : f;
    } catch {
      return f;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      throw new AuthError("This browser isn't letting FITBITRACK save data, so the account can't be kept. Check that cookies and site data are allowed.");
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

async function pbkdf2(password: string, saltB64: string) {
  if (!crypto?.subtle) throw new AuthError('Secure sign-in needs HTTPS. Open FITBITRACK from its https:// address.');
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256);
  return b64(bits);
}

const publicAccount = (u: StoredUser): Account => ({ id: u.id, username: u.username, displayName: u.displayName, createdAt: u.createdAt });

export class DeviceAuth implements AuthService {
  readonly kind = 'device' as const;

  async current() {
    const id = ls.get<string | null>(SESSION_KEY, null);
    if (!id) return null;
    const u = Object.values(ls.get<Record<string, StoredUser>>(USERS_KEY, {})).find((x) => x.id === id);
    return u ? publicAccount(u) : null;
  }

  async register(username: string, password: string, displayName: string) {
    const name = normalizeUsername(username);
    const users = ls.get<Record<string, StoredUser>>(USERS_KEY, {});
    if (users[name]) throw new AuthError('That username is already taken on this device. Try signing in instead.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const u: StoredUser = { id: crypto.randomUUID(), username: name, displayName: displayName.trim(), createdAt: new Date().toISOString(), salt, hash: await pbkdf2(password, salt) };
    ls.set(USERS_KEY, { ...users, [name]: u });
    ls.set(SESSION_KEY, u.id);
    return publicAccount(u);
  }

  async login(username: string, password: string) {
    const lock = ls.get<{ fails: number; until: number }>(LOCK_KEY, { fails: 0, until: 0 });
    if (lock.until > Date.now()) throw new AuthError(`Too many attempts. Try again in ${Math.ceil((lock.until - Date.now()) / 1000)} seconds.`);
    const u = ls.get<Record<string, StoredUser>>(USERS_KEY, {})[normalizeUsername(username)];
    const ok = !!u && (await pbkdf2(password, u.salt)) === u.hash;
    if (!ok) {
      const fails = lock.fails + 1;
      ls.set(LOCK_KEY, { fails: fails >= 5 ? 0 : fails, until: fails >= 5 ? Date.now() + 30_000 : 0 });
      throw new AuthError('Wrong username or password.');
    }
    ls.del(LOCK_KEY);
    ls.set(SESSION_KEY, u.id);
    return publicAccount(u);
  }

  async logout() {
    ls.del(SESSION_KEY);
  }
}

/* ---------------- server (production) ---------------- */

export class ServerAuth implements AuthService {
  readonly kind = 'server' as const;
  private wrap = async <T>(p: Promise<T>) => {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) throw new AuthError('That username is already taken.');
      if (e instanceof ApiError && e.status === 401) throw new AuthError('Wrong username or password.');
      if (e instanceof ApiError && e.status === 429) throw new AuthError('Too many attempts. Wait a minute and try again.');
      throw new AuthError("Couldn't reach the FITBITRACK server. Check your connection and try again.");
    }
  };
  async current() {
    try {
      return (await api<{ account: Account | null }>('/auth/me')).account;
    } catch {
      return null;
    }
  }
  register(username: string, password: string, displayName: string) {
    return this.wrap(api<Account>('/auth/register', { method: 'POST', body: JSON.stringify({ username: normalizeUsername(username), password, displayName: displayName.trim() }) }));
  }
  login(username: string, password: string) {
    return this.wrap(api<Account>('/auth/login', { method: 'POST', body: JSON.stringify({ username: normalizeUsername(username), password }) }));
  }
  async logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
  }
}

export function createAuth(): AuthService {
  return (import.meta as any).env?.VITE_DATA_PROVIDER === 'google' ? new ServerAuth() : new DeviceAuth();
}

/* ---------------- per-account storage scope ---------------- */
let scope = 'anon';
export const setStorageScope = (accountId: string) => {
  scope = accountId;
};
/** Prefix for per-account localStorage keys. */
export const scoped = (key: string) => `fitbitrack:${scope}:${key}`;
