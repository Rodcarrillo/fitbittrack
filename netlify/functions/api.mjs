/**
 * FITBITRACK server on Netlify (one Netlify Function + Netlify Blobs as the database).
 *
 *  Accounts   POST /auth/register · POST /auth/login · GET /auth/me · POST /auth/logout
 *  Google     GET /auth/google/start · GET /auth/google/callback · GET /auth/session
 *             POST /auth/google/disconnect · GET /api/profile · GET /api/devices
 *             GET /api/health/:type/dataPoints · POST /api/health/:type/dailyRollUp
 *  Hevy       POST /api/hevy/connect · POST /api/hevy/disconnect · GET|POST /api/hevy/v1/...
 *  Your data  GET|PUT /api/data/:key   (workouts, journal, settings — synced between devices)
 *
 * Environment variables (Netlify → Site configuration → Environment variables):
 *   SECRET_KEY            any long random text (signs the login cookie)
 *   ENCRYPTION_KEY        any long random text (encrypts Google/Hevy credentials)
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   URL                   set automatically by Netlify (your site's address)
 *
 * Passwords: scrypt hashes. Tokens & Hevy key: AES-256-GCM. Cookie: signed, httpOnly, Secure.
 */
import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const config = { path: ['/api/*', '/auth/*'] };

const HEALTH_API = 'https://health.googleapis.com/v4';
const HEVY_API = 'https://api.hevyapp.com';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
];
const ALLOWED_TYPES = new Set([
  'sleep', 'exercise', 'steps', 'total-calories', 'weight',
  'daily-resting-heart-rate', 'daily-heart-rate-variability', 'daily-respiratory-rate',
  'daily-oxygen-saturation', 'daily-sleep-temperature-derivations', 'daily-vo2-max', 'daily-heart-rate-zones',
]);
const HEVY_PATHS = new Set(['/v1/workouts', '/v1/workouts/events', '/v1/exercise_templates', '/v1/user/info']);
const DATA_KEYS = new Set(['workouts', 'journal', 'settings']);
const MAX_BLOB = 3 * 1024 * 1024;
const SESSION_DAYS = 30;

/* ---------------------------------------------------------------- helpers */
// trimmed: a pasted value with a stray space/newline would otherwise break OAuth
const env = (k) => String((typeof Netlify !== 'undefined' ? Netlify.env.get(k) : undefined) ?? process.env[k] ?? '').trim();
const keyFrom = (name) => crypto.createHash('sha256').update(env(name)).digest();

function assertConfig() {
  if (env('SECRET_KEY').length < 16 || env('ENCRYPTION_KEY').length < 16) {
    throw new HttpError(503, 'server_not_configured', 'Set SECRET_KEY and ENCRYPTION_KEY (16+ characters) in Netlify environment variables.');
  }
}

class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.detail = detail;
  }
}

const json = (body, status = 200, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
const redirect = (location, headers = {}) => new Response(null, { status: 302, headers: { Location: location, ...headers } });

const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom('ENCRYPTION_KEY'), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
};
const decrypt = (b64) => {
  const raw = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', keyFrom('ENCRYPTION_KEY'), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
};

/* signed cookie: base64url(json).hmac */
const sign = (obj) => {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const mac = crypto.createHmac('sha256', keyFrom('SECRET_KEY')).update(body).digest('base64url');
  return `${body}.${mac}`;
};
const unsign = (token) => {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = crypto.createHmac('sha256', keyFrom('SECRET_KEY')).update(body).digest('base64url');
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString());
    return v.exp > Date.now() ? v : null;
  } catch {
    return null;
  }
};
const cookies = (req) => Object.fromEntries((req.headers.get('cookie') ?? '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const secureFlag = (req) => (new URL(req.url).protocol === 'https:' ? '; Secure' : '');
const setCookie = (req, name, value, maxAgeSec) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureFlag(req)}`;
const sessionCookie = (req, uid) => setCookie(req, 'fbt_session', sign({ uid, exp: Date.now() + SESSION_DAYS * 864e5 }), SESSION_DAYS * 86400);

const scrypt = (password, salt) =>
  new Promise((res, rej) => crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

const nowIso = () => new Date().toISOString();
const publicAccount = (u) => ({ id: u.id, username: u.username ?? '', displayName: u.displayName, createdAt: u.createdAt });
const readJson = async (req) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

/* ---------------------------------------------------------------- storage */
const store = () => getStore({ name: 'fitbitrack', consistency: 'strong' });
const getUser = (id) => store().get(`user:${id}`, { type: 'json' });
const saveUser = (u) => store().setJSON(`user:${u.id}`, u);

async function rateLimited(req, context) {
  const ip = context?.ip ?? req.headers.get('x-nf-client-connection-ip') ?? 'x';
  const key = `rl:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
  const now = Date.now();
  const list = ((await store().get(key, { type: 'json' })) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  await store().setJSON(key, list);
  return list.length > 10;
}

async function currentUser(req) {
  const s = unsign(cookies(req).fbt_session);
  return s ? getUser(s.uid) : null;
}

/* ---------------------------------------------------------------- Google */
const origin = (req) => (env('URL') || new URL(req.url).origin).replace(/\/$/, '');
const googleRedirect = (req) => `${origin(req)}/auth/google/callback`;

async function googleToken(u) {
  if (u.googleAccess && u.googleAccessExp > Date.now() + 60_000) return decrypt(u.googleAccess);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: decrypt(u.googleRefresh) }),
  });
  if (!r.ok) throw new HttpError(401, 'google_reauth_needed');
  const t = await r.json();
  u.googleAccess = encrypt(t.access_token);
  u.googleAccessExp = Date.now() + (t.expires_in ?? 3600) * 1000;
  await saveUser(u);
  return t.access_token;
}

async function googleCall(u, method, path, body) {
  if (!u.googleRefresh) return json({ error: 'google_not_connected' }, 409);
  const r = await fetch(`${HEALTH_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await googleToken(u)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) console.warn(`google health ${method} ${path.split('?')[0]} -> ${r.status}`);
  return json(await r.json().catch(() => ({})), r.status);
}

/* ---------------------------------------------------------------- handler */
export default async (req, context) => {
  try {
    return await route(req, context);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, detail: e.detail }, e.status);
    console.error(`[api] ${new URL(req.url).pathname} failed: ${e?.name ?? 'Error'}`); // never log bodies or health data
    return json({ error: 'server_error' }, 500);
  }
};

async function route(req, context) {
  assertConfig();
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;

  /* ---------- setup check (no secrets: the client ID is public, it appears in every Google sign-in URL) ---------- */
  if (path === '/auth/check') {
    const id = env('GOOGLE_CLIENT_ID');
    const sec = env('GOOGLE_CLIENT_SECRET');
    return json({
      google_client_id: id || '(empty)',
      client_id_looks_valid: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id),
      client_secret_set: sec.length > 0,
      client_secret_looks_valid: sec.startsWith('GOCSPX-'),
      redirect_uri_to_register_in_google: googleRedirect(req),
    });
  }

  /* ---------- accounts ---------- */
  if (path === '/auth/register' && method === 'POST') {
    if (await rateLimited(req, context)) return json({ error: 'too_many_attempts' }, 429);
    const b = await readJson(req);
    const username = String(b.username ?? '').trim().toLowerCase();
    const password = String(b.password ?? '');
    const displayName = String(b.displayName ?? '').trim().slice(0, 60);
    if (!/^[a-z0-9._]{3,24}$/.test(username) || password.length < 8 || !displayName) return json({ error: 'invalid' }, 400);
    if (await store().get(`username:${username}`)) return json({ error: 'taken' }, 409);
    const salt = crypto.randomBytes(16);
    const u = { id: crypto.randomUUID(), username, displayName, createdAt: nowIso(), salt: salt.toString('base64'), hash: (await scrypt(password, salt)).toString('base64') };
    await store().set(`username:${username}`, u.id);
    await saveUser(u);
    return json(publicAccount(u), 201, { 'Set-Cookie': sessionCookie(req, u.id) });
  }

  if (path === '/auth/login' && method === 'POST') {
    if (await rateLimited(req, context)) return json({ error: 'too_many_attempts' }, 429);
    const b = await readJson(req);
    const id = await store().get(`username:${String(b.username ?? '').trim().toLowerCase()}`);
    const u = id ? await getUser(id) : null;
    const hash = await scrypt(String(b.password ?? ''), u?.salt ? Buffer.from(u.salt, 'base64') : Buffer.alloc(16));
    if (!u?.hash || !crypto.timingSafeEqual(hash, Buffer.from(u.hash, 'base64'))) return json({ error: 'invalid_credentials' }, 401);
    return json(publicAccount(u), 200, { 'Set-Cookie': sessionCookie(req, u.id) });
  }

  if (path === '/auth/me') {
    const u = await currentUser(req);
    return json({ account: u ? publicAccount(u) : null });
  }

  if (path === '/auth/logout' && method === 'POST') return json(undefined, 204, { 'Set-Cookie': setCookie(req, 'fbt_session', '', 0) });

  /* ---------- Google OAuth ---------- */
  if (path === '/auth/google/start') {
    if (!env('GOOGLE_CLIENT_ID')) return new Response('Google sign-in is not configured yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify.', { status: 503 });
    const state = crypto.randomBytes(24).toString('base64url');
    const q = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      redirect_uri: googleRedirect(req),
      response_type: 'code',
      scope: ['openid', 'email', 'profile', ...GOOGLE_SCOPES].join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, { 'Set-Cookie': setCookie(req, 'fbt_oauth', sign({ state, exp: Date.now() + 10 * 60_000 }), 600) });
  }

  if (path === '/auth/google/callback') {
    if (url.searchParams.get('error')) return redirect('/?google=denied');
    const st = unsign(cookies(req).fbt_oauth);
    if (!st || st.state !== url.searchParams.get('state')) return new Response('Sign-in expired. Go back to FITBITRACK and try again.', { status: 400 });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), code: url.searchParams.get('code') ?? '', grant_type: 'authorization_code', redirect_uri: googleRedirect(req) }),
    });
    if (!r.ok) {
      console.warn(`google token exchange -> ${r.status}`);
      return redirect('/?google=failed');
    }
    const t = await r.json();
    let u = await currentUser(req);
    const headers = { 'Set-Cookie': setCookie(req, 'fbt_oauth', '', 0) };
    if (!u) {
      // "Continue with Google" without an account → create one
      const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } })
        .then((x) => x.json())
        .catch(() => ({}));
      u = { id: crypto.randomUUID(), username: null, displayName: String(info.given_name || info.name || 'Athlete').slice(0, 60), createdAt: nowIso() };
    }
    u.googleAccess = encrypt(t.access_token);
    u.googleAccessExp = Date.now() + (t.expires_in ?? 3600) * 1000;
    if (t.refresh_token) u.googleRefresh = encrypt(t.refresh_token);
    await saveUser(u);
    return new Response(null, { status: 302, headers: [['Location', '/?google=connected'], ['Set-Cookie', headers['Set-Cookie']], ['Set-Cookie', sessionCookie(req, u.id)]] });
  }

  if (path === '/auth/session') {
    const u = await currentUser(req);
    return json({ connected: !!u?.googleRefresh });
  }

  /* everything below needs a signed-in user */
  const u = await currentUser(req);
  if (!u) return json({ error: 'not_signed_in' }, 401);

  if (path === '/auth/google/disconnect' && method === 'POST') {
    if (u.googleRefresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(u.googleRefresh))}`, { method: 'POST' }).catch(() => {});
    delete u.googleRefresh;
    delete u.googleAccess;
    delete u.googleAccessExp;
    await saveUser(u);
    return json(undefined, 204);
  }

  if (path === '/api/profile') return googleCall(u, 'GET', '/users/me/profile');
  if (path === '/api/devices') return googleCall(u, 'GET', '/users/me/pairedDevices');

  const hm = path.match(/^\/api\/health\/([a-z0-9-]+)\/(dataPoints|dailyRollUp)$/);
  if (hm) {
    const [, type, op] = hm;
    if (!ALLOWED_TYPES.has(type)) return json({ error: 'type_not_allowed' }, 403);
    if (op === 'dataPoints' && method === 'GET') {
      const q = new URLSearchParams();
      for (const k of ['filter', 'pageToken', 'pageSize']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k));
      return googleCall(u, 'GET', `/users/me/dataTypes/${type}/dataPoints?${q}`);
    }
    if (op === 'dailyRollUp' && method === 'POST') {
      const b = await readJson(req);
      return googleCall(u, 'POST', `/users/me/dataTypes/${type}/dataPoints:dailyRollUp`, { range: b.range, windowSizeDays: b.windowSizeDays ?? 1 });
    }
  }

  /* ---------- Hevy ---------- */
  if (path === '/api/hevy/connect' && method === 'POST') {
    const apiKey = String((await readJson(req)).apiKey ?? '').trim();
    if (!apiKey) return json({ error: 'missing_key' }, 400);
    let r;
    try {
      r = await fetch(`${HEVY_API}/v1/user/info`, { headers: { 'api-key': apiKey } });
    } catch {
      return json({ error: 'hevy_unreachable' }, 502);
    }
    if (r.status === 401 || r.status === 403) return json({ error: 'hevy_rejected' }, 401);
    if (!r.ok) return json({ error: 'hevy_error' }, 502);
    const info = await r.json().catch(() => ({}));
    u.hevyKey = encrypt(apiKey);
    await saveUser(u);
    const d = info?.data ?? info ?? {};
    return json({ username: d.name ?? d.username ?? '' });
  }
  if (path === '/api/hevy/disconnect' && method === 'POST') {
    delete u.hevyKey;
    await saveUser(u);
    return json(undefined, 204);
  }
  if (path.startsWith('/api/hevy/')) {
    const sub = path.slice('/api/hevy'.length);
    if (!HEVY_PATHS.has(sub) || (method === 'POST' && sub !== '/v1/workouts') || !['GET', 'POST'].includes(method)) return json({ error: 'not_allowed' }, 403);
    if (!u.hevyKey) return json({ error: 'hevy_not_connected' }, 409);
    const q = new URLSearchParams();
    for (const k of ['page', 'pageSize', 'since']) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k));
    let r;
    try {
      r = await fetch(`${HEVY_API}${sub}${[...q].length ? `?${q}` : ''}`, {
        method,
        headers: { 'api-key': decrypt(u.hevyKey), 'Content-Type': 'application/json' },
        body: method === 'POST' ? await req.text() : undefined,
      });
    } catch {
      return json({ error: 'hevy_unreachable' }, 502);
    }
    return json(await r.json().catch(() => ({})), r.status);
  }

  /* ---------- your data (sync between devices) ---------- */
  const dm = path.match(/^\/api\/data\/([a-z]+)$/);
  if (dm && DATA_KEYS.has(dm[1])) {
    const key = `data:${u.id}:${dm[1]}`;
    if (method === 'GET') {
      const v = await store().get(key, { type: 'json' });
      return json(v ? { value: v.value, updatedAt: v.updatedAt } : { value: null, updatedAt: null });
    }
    if (method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_BLOB) return json({ error: 'too_large' }, 413);
      const b = JSON.parse(text || '{}');
      const updatedAt = Date.now();
      await store().setJSON(key, { value: b.value ?? null, updatedAt });
      return json({ updatedAt });
    }
  }

  return json({ error: 'not_found' }, 404);
}
