import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiRouter } from './routes.js';
import { closeDb, getDb } from './db.js';
import { loadLevels } from './levels.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const publicOrigin = process.env.PUBLIC_ORIGIN || 'http://localhost:5173';
const clientDist = resolve(process.cwd(), 'client', 'dist');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({ origin: publicOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', apiRouter);

if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: '服务器处理请求时发生错误' });
});

getDb();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[coin-competition] http://0.0.0.0:${port}`);
  console.log(`[coin-competition] ${loadLevels().length} levels loaded; database WAL enabled`);
});

function shutdown() {
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
