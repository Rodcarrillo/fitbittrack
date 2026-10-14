// Netlify entry point. All logic lives in server/core.mjs (shared with Vercel).
import { handle } from '../../server/core.mjs';

export const config = { path: ['/api/*', '/auth/*'] };
export default handle;
