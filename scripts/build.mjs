// Build: esbuild bundles the app; output is a single self-contained HTML file.
//   node scripts/build.mjs           → dist/index.html
//   node scripts/build.mjs --serve   → dev server on http://localhost:5173
// Env: VITE_DATA_PROVIDER=sample|google, VITE_API_BASE=https://api.yourdomain.com
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const serve = process.argv.includes('--serve');
const env = {
  VITE_DATA_PROVIDER: process.env.VITE_DATA_PROVIDER ?? 'sample',
  VITE_API_BASE: process.env.VITE_API_BASE ?? '',
};

const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: !serve,
  sourcemap: serve,
  format: 'iife',
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  outdir: 'dist/assets',
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.png': 'dataurl' },
  define: {
    'import.meta.env': JSON.stringify(env),
    'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
  },
  logLevel: 'info',
};

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700&display=swap">';

mkdirSync('dist', { recursive: true });
// icons, favicon and web app manifest (shown by browsers, Google results and "Add to Home Screen")
if (existsSync('public')) cpSync('public', 'dist', { recursive: true });
const HEAD_META =
  '<meta name="description" content="FITBITRACK — your Fitbit data, reimagined: readiness, sleep, training load and a strength workout tracker.">' +
  '<link rel="icon" href="/favicon.ico?v=3" sizes="48x48">' +
  '<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">' +
  '<link rel="manifest" href="/manifest.webmanifest?v=3">' +
  '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-title" content="FITBITRACK"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
  '<meta property="og:title" content="FITBITRACK"><meta property="og:description" content="Your Fitbit data. Reimagined."><meta property="og:image" content="/icon-512.png?v=3">';

if (serve) {
  writeFileSync(
    'dist/index.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>FITBITRACK</title>${HEAD_META}${FONTS}<link rel="stylesheet" href="/assets/main.css"></head><body><div id="root"></div><script src="/assets/main.js"></script></body></html>`,
  );
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173 });
  console.log(`FITBITRACK dev server → http://localhost:${port}`);
} else {
  await esbuild.build(options);
  const js = readFileSync('dist/assets/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = readFileSync('dist/assets/main.css', 'utf8');
  const body = `<title>FITBITRACK</title>${FONTS}<meta name="theme-color" content="#07090e"><style>${css}</style><div id="root"></div><script>${js}</script>`;
  // Fragment (no <html>/<body>) for hosts that add their own document skeleton…
  writeFileSync('dist/fitbitrack.html', body);
  // …and a complete document for normal static hosting.
  writeFileSync(
    'dist/index.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${HEAD_META}${body.replace('<div id="root">', '</head><body><div id="root">')}</body></html>`,
  );
  console.log('Built dist/index.html (' + Math.round(Buffer.byteLength(body) / 1024) + ' KB)');
}
