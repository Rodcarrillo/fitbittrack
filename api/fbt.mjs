// Vercel entry point. vercel.json rewrites /api/* and /auth/* here with ?__route=<original path>;
// all logic lives in server/core.mjs (shared with Netlify).
import { handle } from '../server/core.mjs';

async function run(req) {
  const u = new URL(req.url);
  const route = u.searchParams.get('__route');
  if (route) {
    u.searchParams.delete('__route');
    u.pathname = route.startsWith('/') ? route : `/${route}`;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    req = new Request(u.toString(), { method: req.method, headers: req.headers, body: hasBody ? await req.arrayBuffer() : undefined, redirect: 'manual' });
  }
  return handle(req, {});
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
