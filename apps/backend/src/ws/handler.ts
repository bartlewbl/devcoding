import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  createSession,
  getSession,
  listSessions,
  spawnCLI,
  watchFiles,
  endSession,
  pushSession,
} from '../services/session';
import { getDiff } from '../services/git';
import { githubTokens } from '../routes/github';
import { JwtPayload } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function setupWebSocketHandler(io: Server): void {
  io.use((socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth.token, JWT_SECRET) as JwtPayload;
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: string = (socket as any).userId;

    // Send existing sessions on connect
    socket.emit('sessions:list', listSessions());

    // ── Create session ──────────────────────────────────────
    socket.on('session:create', async ({ repoUrl, repoFullName, model, effort }) => {
      const token = githubTokens.get(userId);
      if (!token) {
        socket.emit('session:error', { error: 'GitHub not connected' });
        return;
      }

      try {
        socket.emit('session:status', { status: 'cloning', message: 'Cloning repository…' });
        const session = await createSession(repoUrl, repoFullName, model, effort, token);

        socket.emit('session:created', {
          id: session.id,
          branch: session.branch,
          model: session.model,
          effort: session.effort,
          status: session.status,
          repoFullName: session.repoFullName,
          createdAt: session.createdAt,
        });

        // Spawn CLI
        spawnCLI(
          session,
          (raw) => socket.emit('terminal:data', { sessionId: session.id, data: raw }),
          (chunk) => socket.emit('chat:message', {
            sessionId: session.id,
            message: { id: uuidv4(), ...chunk, timestamp: Date.now() },
          }),
          () => socket.emit('session:ended', { sessionId: session.id })
        );

        // Watch files
        watchFiles(session, async (files) => {
          socket.emit('files:update', { sessionId: session.id, files });
          // Send diffs for up to 5 files
          for (const f of files.slice(0, 5)) {
            const diff = await getDiff(session.worktreePath, f);
            if (diff) socket.emit('diff:update', { sessionId: session.id, file: f, diff });
          }
        });

      } catch (err: any) {
        console.error('[session:create] error:', err);
        socket.emit('session:error', { error: err.message });
      }
    });

    // ── Terminal I/O ─────────────────────────────────────────
    socket.on('terminal:input', ({ sessionId, data }: { sessionId: string; data: string }) => {
      getSession(sessionId)?.pty?.write(data);
    });

    socket.on('terminal:resize', ({ sessionId, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
      getSession(sessionId)?.pty?.resize(cols, rows);
    });

    // ── Chat input → PTY ─────────────────────────────────────
    socket.on('session:chat', ({ sessionId, message }: { sessionId: string; message: string }) => {
      getSession(sessionId)?.pty?.write(message + '\r');
    });

    // ── Reconnect: replay terminal buffer ────────────────────
    socket.on('session:join', ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s) return;
      if (s.outputBuffer) {
        socket.emit('terminal:data', { sessionId, data: s.outputBuffer });
      }
    });

    // ── Push branch ──────────────────────────────────────────
    socket.on('session:push', async ({ sessionId }: { sessionId: string }) => {
      try {
        await pushSession(sessionId);
        const s = getSession(sessionId);
        socket.emit('session:pushed', {
          sessionId,
          branch: s?.branch,
          url: `https://github.com/${s?.repoFullName}/tree/${s?.branch}`,
        });
      } catch (err: any) {
        socket.emit('session:error', { sessionId, error: err.message });
      }
    });

    // ── Diff on demand ───────────────────────────────────────
    socket.on('diff:request', async ({ sessionId, file }: { sessionId: string; file: string }) => {
      const s = getSession(sessionId);
      if (!s) return;
      const diff = await getDiff(s.worktreePath, file);
      socket.emit('diff:update', { sessionId, file, diff });
    });

    // ── End session ──────────────────────────────────────────
    socket.on('session:end', async ({ sessionId }: { sessionId: string }) => {
      await endSession(sessionId);
      socket.emit('session:ended', { sessionId });
    });
  });
}
