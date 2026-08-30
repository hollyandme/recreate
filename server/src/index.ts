import './lib/env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { errorHandler } from './lib/http.js';
import { tags } from './routes/tags.js';
import { ideas } from './routes/ideas.js';
import { briefs } from './routes/briefs.js';
import { shots } from './routes/shots.js';
import { files } from './routes/files.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// In dev the client runs on Vite's own port and proxies /api across; in
// production it is served from here and same-origin, so CORS is dev-only.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
}

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/tags', tags);
app.use('/api/ideas', ideas);
app.use('/api/briefs', briefs);
app.use('/api/shots', shots);
app.use('/api/files', files);

// Production: serve the built client and let the router own every non-API path,
// so a deep link to /briefs/7/print survives a hard refresh.
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
  app.use(express.static(dist));
  app.get('/*path', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Recreate API listening on http://localhost:${PORT}`);
});
