/**
 * FocusAI — Express Server
 *
 * Entry point for the FocusAI backend.
 * Serves the SPA (index.html) and all API routes.
 * Never exposes Supabase service role key or Ollama endpoint to the browser.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { requestIdMiddleware, rateLimiter } from './middleware/auth.js';
import { authRouter } from './routes/authRoutes.js';
import { classRouter } from './routes/classRoutes.js';
import { materialRoutes } from './routes/materialRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { aiRoutes } from './routes/aiRoutes.js';
import { analyticsRoutes } from './routes/analyticsRoutes.js';
import { testRoutes } from './routes/testRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// ─── Startup Checks ────────────────────────────────────────────────────────────
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.error('\n❌ FATAL: Supabase credentials not configured.');
  console.error('   Copy .env.example to .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n');
  if (config.env === 'production') process.exit(1);
  console.warn('   Running in degraded mode — database operations will fail.\n');
}

const app = express();

// ─── Core Middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: config.env === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);

// ─── Request Logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Skip static asset logs to reduce noise
    if (!req.path.match(/\.(css|js|png|jpg|mp4|ico|woff2?)$/)) {
      const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
      console.log(`[${level}] ${new Date().toISOString()} ${req.method} ${req.path} → ${res.statusCode} (${duration}ms) [${req.id}]`);
    }
  });
  next();
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', rateLimiter, authRouter);
app.use('/api/v1/classes', classRouter);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/materials', materialRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/tests', testRoutes);

// ─── Static File Serving ───────────────────────────────────────────────────────
app.use(express.static(rootDir, {
  maxAge: config.env === 'production' ? '1d' : '0',
  index: false, // we handle root separately
}));

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(rootDir, 'index.html'));
});

// ─── 404 Handler (API only) ────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'endpoint_not_found',
      message: `API endpoint '${req.originalUrl}' does not exist.`,
      request_id: req.id,
    },
  });
});

// ─── Centralised Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'internal_server_error' : 'request_failed');
  const message = err.message || 'An unexpected error occurred.';

  if (status >= 500) {
    console.error(`[ERROR ${req.id}]:`, err.stack || err);
  }

  res.status(status).json({
    error: {
      code,
      message,
      details: err.details || null,
      request_id: req.id,
    },
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
const server = app.listen(config.port, config.host, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           FocusAI Platform — Server Running              ║
╠══════════════════════════════════════════════════════════╣
║  🌐 App URL:        http://localhost:${config.port}               ║
║  🔑 Auth API:       http://localhost:${config.port}/api/v1/auth   ║
║  📚 Classes API:    http://localhost:${config.port}/api/v1/classes ║
║  ✅ Health:         http://localhost:${config.port}/api/v1/auth/health ║
║  🤖 Ollama Model:   ${config.ollama.model.padEnd(36)}  ║
╚══════════════════════════════════════════════════════════╝
`);
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received — shutting down gracefully...');
  server.close(() => console.log('[SERVER] HTTP server closed.'));
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received — shutting down...');
  server.close(() => process.exit(0));
});
