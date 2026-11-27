/**
 * server.ts
 *
 * Spotify Companion AI — Express server entry point.
 *
 * Startup sequence:
 * 1. Load and validate environment variables
 * 2. Initialize SQLite database (creates schema if needed)
 * 3. Configure Express middleware (security, sessions, CORS)
 * 4. Register API routes
 * 5. Serve the test HTML page (pre-React, Phase 3 only)
 * 6. Register global error handler
 * 7. Start listening
 */

// Must be first — loads .env before anything else imports `env`
import './config/env';

import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { getDb } from './db/database';
import { authRouter } from './routes/auth.routes';
import { spotifyRouter } from './routes/spotify.routes';
import { dataRouter } from './routes/data.routes';
import { aiRouter } from './routes/ai.routes';

// ---------------------------------------------------------------------------
// Initialize database (creates tables if they don't exist)
// ---------------------------------------------------------------------------
getDb();

// ---------------------------------------------------------------------------
// Create Express app
// ---------------------------------------------------------------------------
const app = express();

// Trust proxy headers from Render, Cloudflare, etc. for secure cookies behind reverse proxy
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers (helmet)
// In dev mode, relax CSP so the test HTML page can load inline scripts
// ---------------------------------------------------------------------------
if (env.server.isDev) {
  app.use(helmet({
    contentSecurityPolicy: false, // relaxed for local dev test page
  }));
} else {
  app.use(helmet());
}

// ---------------------------------------------------------------------------
// CORS
// Allow local dev (localhost, 127.0.0.1, LAN IPs for phone testing) and production
// ---------------------------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile browsers direct navigation, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost, 127.0.0.1, and private local network IPs (e.g. 192.168.x.x, 10.x.x.x)
    if (
      env.server.isDev ||
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin) ||
      origin.endsWith('.onrender.com') ||
      origin === process.env['FRONTEND_URL']
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true, // Required for session cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Session configuration
//
// WHY: We use express-session with the SQLite session store.
// The session cookie holds a session ID; the actual session data
// (including spotifyUserId) lives in the SQLite database.
//
// connect-sqlite3 creates a separate `sessions` table in our DB.
// ---------------------------------------------------------------------------

// Dynamic import because connect-sqlite3 needs session to be defined first
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SQLiteStore = require('connect-sqlite3')(session);

app.use(session({
  store: new SQLiteStore({
    db: 'spotify-companion.db',
    dir: path.resolve(__dirname, '../data'),
    table: 'sessions',
  }),
  secret: env.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: !env.server.isDev, // HTTPS only in production
    httpOnly: true,            // Prevent JS access to cookie
    sameSite: 'lax',           // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  name: 'sc.sid', // Custom name — don't use default 'connect.sid'
}));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/auth', authRouter);
app.use('/spotify', spotifyRouter);
app.use('/data', dataRouter);
app.use('/ai', aiRouter);

// Health check — useful for deployment monitoring
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'spotify-companion-backend',
    timestamp: new Date().toISOString(),
    environment: env.server.nodeEnv,
  });
});

// ---------------------------------------------------------------------------
// Serve Frontend (React Single Page App) or test page
// ---------------------------------------------------------------------------
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

if (fs.existsSync(frontendDistPath)) {
  console.log(`[server] Serving production React frontend from ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (
      req.path.startsWith('/auth') || 
      req.path.startsWith('/spotify') || 
      req.path.startsWith('/data') || 
      req.path.startsWith('/ai') || 
      req.path.startsWith('/health')
    ) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else if (env.server.isDev) {
  app.get('/', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  });
}

// ---------------------------------------------------------------------------
// Global error handler — must have 4 parameters for Express to recognize it
// ---------------------------------------------------------------------------
app.use((
  err: Error,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  console.error('[error]', err.message, err.stack);

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: env.server.isDev ? err.message : 'Something went wrong. Please try again.',
  });
});

// ---------------------------------------------------------------------------
// Start server
// Bind to 0.0.0.0 so cloud providers like Render can detect the open port
// ---------------------------------------------------------------------------
const host = process.env.HOST || '0.0.0.0';
const server = app.listen(env.server.port, host, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🎵 Spotify Companion AI — Backend Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Host:    http://${host}:${env.server.port}`);
  console.log(`  Connect: http://${host}:${env.server.port}/auth/spotify`);
  console.log(`  Health:  http://${host}:${env.server.port}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[server] SIGINT received — shutting down');
  server.close(() => process.exit(0));
});

export default app;
