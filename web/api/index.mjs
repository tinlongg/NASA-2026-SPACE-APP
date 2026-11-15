// Vercel Function: the whole website (pages, assets, /api, /sync) is the same handler the local server runs.
// `npm run build` produces both imports; Turso's integration provides TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
import worker from '../dist/server/index.js';
import migrations from '../dist/server/migrations.js';
import { tursoDB } from '../turso-db.mjs';

const DB = process.env.TURSO_DATABASE_URL
  ? tursoDB({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN, migrations })
  : undefined;

export default {
  fetch(request) { return worker.fetch(request, { ...process.env, DB }); },
};
