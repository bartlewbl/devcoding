import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import githubRoutes from './routes/github';
import sessionRoutes from './routes/sessions';
import worktreeRoutes from './routes/worktrees';
import usageRoutes from './routes/usage';
import kimiRoutes from './routes/kimi';
import { authMiddleware } from './middleware/auth';
import { setupWebSocketHandler } from './ws/handler';
import { reconcileWorktreesOnStartup } from './services/worktree-manager';
import { getActiveSessionIds, initSessions, persistSessions } from './services/session';
import { startBackgroundUpdater } from './services/updater';

const app = express();
const httpServer = createServer(app);

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: { origin: FRONTEND, credentials: true },
});

app.use(cors({ origin: FRONTEND, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/sessions', authMiddleware, sessionRoutes);
app.use('/api/worktrees', authMiddleware, worktreeRoutes);
app.use('/api/usage', authMiddleware, usageRoutes);
app.use('/api/kimi', authMiddleware, kimiRoutes);

setupWebSocketHandler(io);

initSessions();
startBackgroundUpdater();

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  reconcileWorktreesOnStartup(getActiveSessionIds());
});

// Graceful shutdown: persist sessions before exiting
process.on('SIGTERM', () => {
  console.log('[shutdown] SIGTERM received, persisting sessions…');
  persistSessions();
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[shutdown] SIGINT received, persisting sessions…');
  persistSessions();
  process.exit(0);
});
