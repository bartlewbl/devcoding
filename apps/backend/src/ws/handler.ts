import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Octokit } from '@octokit/rest';
import {
  createSession,
  getSession,
  listSessions,
  spawnCLI,
  watchFiles,
  endSession,
  pushSession,
  updateSessionConfig,
  touchSession,
  restartSession,
  toSummary,
  stopSession,
  addMessage,
  mergeToMainSession,
  persistSessions,
  renameSession,
} from '../services/session';
import { getDiff } from '../services/git';
import { githubTokens } from '../routes/github';
import { JwtPayload } from '../middleware/auth';
import { ChatMessage } from '../types';
import { detectAuthPrompt } from '../services/auth-detector';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Track auth URLs already emitted per session to avoid spam
const emittedAuthUrls = new Map<string, Set<string>>();

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

    // Join a user-specific room so multi-tab sync works for session metadata
    socket.join(userId);

    // Send existing sessions on connect (scoped to user)
    socket.emit('sessions:list', listSessions(userId));

    // ── Create session ──────────────────────────────────────
    socket.on('session:create', async ({ repoUrl, repoFullName, model, effort, modelName }) => {
      const token = githubTokens.get(userId);
      if (!token) {
        socket.emit('session:error', { error: 'GitHub not connected' });
        return;
      }

      try {
        socket.emit('session:status', { status: 'creating', message: 'Cloning repository…' });
        const session = await createSession(userId, repoUrl, repoFullName, model, effort, token, modelName);

        // Join the session room so this socket receives room-scoped events
        socket.join(session.id);

        const summary = toSummary(session);
        socket.emit('session:created', summary);

        // Spawn CLI — emit to the session room so any viewer gets updates
        spawnCLI(
          session,
          (raw) => {
            io.to(session.id).emit('terminal:data', { sessionId: session.id, data: raw });
            const auth = detectAuthPrompt(session.model, raw);
            if (auth) {
              const seen = emittedAuthUrls.get(session.id) || new Set();
              if (!seen.has(auth.url)) {
                seen.add(auth.url);
                emittedAuthUrls.set(session.id, seen);
                io.to(session.id).emit('session:auth-required', { sessionId: session.id, ...auth });
              }
            }
          },
          (chunk) => {
            const message: ChatMessage = { id: uuidv4(), ...chunk, timestamp: Date.now() };
            addMessage(session.id, message);
            io.to(session.id).emit('chat:message', { sessionId: session.id, message });
          },
          () => io.to(session.id).emit('session:ended', { sessionId: session.id })
        );

        // Watch files — emit to the session room
        watchFiles(session, async (files) => {
          io.to(session.id).emit('files:update', { sessionId: session.id, files });
          // Send diffs for up to 5 files
          for (const f of files.slice(0, 5)) {
            const diff = await getDiff(session.worktreePath, f);
            if (diff) io.to(session.id).emit('diff:update', { sessionId: session.id, file: f, diff });
          }
        });

      } catch (err: any) {
        console.error('[session:create] error:', err);
        socket.emit('session:error', { error: err.message });
      }
    });

    // ── Terminal I/O ─────────────────────────────────────────
    socket.on('terminal:input', ({ sessionId, data }: { sessionId: string; data: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      s.pty?.write(data);
    });

    socket.on('terminal:resize', ({ sessionId, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      s.pty?.resize(cols, rows);
    });

    // ── Chat input → PTY ─────────────────────────────────────
    socket.on('session:chat', ({ sessionId, message, streamId }: { sessionId: string; message: string; streamId?: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      // Persist user message so other tabs / late joiners see it. The client
      // passes its optimistic streamId so the broadcast replaces the local
      // bubble in place instead of appending a duplicate.
      const msg: ChatMessage = {
        id: uuidv4(),
        type: 'user' as const,
        content: message,
        timestamp: Date.now(),
        streamId,
      };
      addMessage(sessionId, msg);
      io.to(sessionId).emit('chat:message', { sessionId, message: msg });
      s.pty?.write(message + '\r');
    });

    // ── Update session config (provider / model / effort) ─────
    socket.on('session:update-config', ({ sessionId, model, modelName, effort }: { sessionId: string; model?: 'claude' | 'kimi' | 'codex'; modelName?: string; effort?: 'low' | 'medium' | 'high' }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;

      const oldModelName = s.modelName;
      const oldModel = s.model;
      const summary = updateSessionConfig(sessionId, { model, modelName, effort });
      if (!summary) return;

      // If the model changed and a PTY is active, try to send the CLI command to switch model
      if (s.pty && modelName && (modelName !== oldModelName || model !== oldModel)) {
        if (s.model === 'claude' || s.model === 'kimi' || s.model === 'codex') {
          s.pty.write(`/model ${modelName}\r`);
        }
      }

      io.to(userId).emit('session:updated', summary);
    });

    // ── Rename session ───────────────────────────────────────
    socket.on('session:rename', ({ sessionId, name }: { sessionId: string; name: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      const summary = renameSession(sessionId, name);
      if (!summary) return;
      io.to(userId).emit('session:updated', summary);
    });

    // ── Reconnect: replay terminal buffer + chat history ─────
    socket.on('session:join', ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;

      touchSession(sessionId);
      socket.join(sessionId);

      // Send chat history so the joining tab sees previous messages
      if (s.messages.length > 0) {
        socket.emit('chat:history', { sessionId, messages: s.messages });
      }

      if (s.outputBuffer) {
        socket.emit('terminal:data', { sessionId, data: s.outputBuffer });
      }
    });

    // ── Manual session stop ──────────────────────────────────
    socket.on('session:stop', ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      if (stopSession(sessionId)) {
        io.to(sessionId).emit('session:stopped', { sessionId });
        io.to(userId).emit('session:updated', toSummary(s));
      }
    });

    // ── Manual session start / restart ───────────────────────
    socket.on('session:start', ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      if (s.status !== 'stopped') return;

      const restarted = restartSession(
        sessionId,
        (raw) => {
          io.to(sessionId).emit('terminal:data', { sessionId, data: raw });
          const auth = detectAuthPrompt(s.model, raw);
          if (auth) {
            const seen = emittedAuthUrls.get(sessionId) || new Set();
            if (!seen.has(auth.url)) {
              seen.add(auth.url);
              emittedAuthUrls.set(sessionId, seen);
              io.to(sessionId).emit('session:auth-required', { sessionId, ...auth });
            }
          }
        },
        (chunk) => {
          const message: ChatMessage = { id: uuidv4(), ...chunk, timestamp: Date.now() };
          addMessage(sessionId, message);
          io.to(sessionId).emit('chat:message', { sessionId, message });
        },
        () => io.to(sessionId).emit('session:ended', { sessionId }),
        async (files) => {
          io.to(sessionId).emit('files:update', { sessionId, files });
          for (const f of files.slice(0, 5)) {
            const diff = await getDiff(s.worktreePath, f);
            if (diff) io.to(sessionId).emit('diff:update', { sessionId, file: f, diff });
          }
        }
      );
      if (restarted) {
        io.to(sessionId).emit('session:started', { sessionId });
        io.to(userId).emit('session:updated', toSummary(restarted));
      }
    });

    // ── Push branch ──────────────────────────────────────────
    socket.on('session:push', async ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      try {
        await pushSession(sessionId);
        socket.emit('session:pushed', {
          sessionId,
          branch: s.branch,
          url: `https://github.com/${s.repoFullName}/tree/${s.branch}`,
        });
      } catch (err: any) {
        socket.emit('session:error', { sessionId, error: err.message });
      }
    });

    // ── Create PR ────────────────────────────────────────────
    socket.on('session:create-pr', async ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      const token = githubTokens.get(userId);
      if (!token) {
        socket.emit('session:error', { sessionId, error: 'GitHub not connected' });
        return;
      }

      try {
        const octokit = new Octokit({ auth: token });
        const [owner, repo] = s.repoFullName.split('/');
        const { data } = await octokit.pulls.create({
          owner,
          repo,
          title: `AI: ${s.branch}`,
          body: '',
          head: s.branch,
          base: 'main',
        });

        socket.emit('session:pr-created', {
          sessionId,
          url: data.html_url,
          prNumber: data.number,
        });
      } catch (err: any) {
        socket.emit('session:error', { sessionId, error: err.message });
      }
    });

    // ── Merge to main ────────────────────────────────────────
    socket.on('session:merge-to-main', async ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      try {
        await mergeToMainSession(sessionId);
        socket.emit('session:merged-to-main', {
          sessionId,
          url: `https://github.com/${s.repoFullName}`,
        });
      } catch (err: any) {
        socket.emit('session:error', { sessionId, error: err.message });
      }
    });

    // ── Diff on demand ───────────────────────────────────────
    socket.on('diff:request', async ({ sessionId, file }: { sessionId: string; file: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      touchSession(sessionId);
      const diff = await getDiff(s.worktreePath, file);
      socket.emit('diff:update', { sessionId, file, diff });
    });

    // ── End session ──────────────────────────────────────────
    socket.on('session:end', async ({ sessionId }: { sessionId: string }) => {
      const s = getSession(sessionId);
      if (!s || s.userId !== userId) return;
      await endSession(sessionId);
      io.to(sessionId).emit('session:ended', { sessionId });
    });
  });

  // ── Periodic session persistence ───────────────────────────
  setInterval(() => {
    persistSessions();
  }, 30_000);
}
