import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';
import api from '../lib/api';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function startGitHubAuth(token: string) {
  window.location.href = `${BACKEND}/api/github/authorize?token=${token}`;
}

function shouldAttemptReconnect(): boolean {
  const wasConnected = localStorage.getItem('githubConnected') === 'true';
  const alreadyAttempted = sessionStorage.getItem('githubAutoReconnectAttempted') === 'true';
  const onAuthPage = window.location.pathname.includes('/auth/github');
  return wasConnected && !alreadyAttempted && !onAuthPage;
}

export function useGitHubAutoReconnect() {
  const { token } = useAuth();
  const socket = useSocket();

  // On mount / auth change: if backend says GitHub is disconnected but
  // we were previously connected, automatically start OAuth again.
  useEffect(() => {
    if (!token) return;

    api.get('/github/status')
      .then((res) => {
        if (!res.data.connected && shouldAttemptReconnect()) {
          sessionStorage.setItem('githubAutoReconnectAttempted', 'true');
          startGitHubAuth(token);
        }
      })
      .catch(() => {});
  }, [token]);

  // Also react to real-time socket errors that indicate the token is missing.
  useEffect(() => {
    if (!socket || !token) return;

    const handleError = (data: any) => {
      if (data?.error === 'GitHub not connected' && shouldAttemptReconnect()) {
        sessionStorage.setItem('githubAutoReconnectAttempted', 'true');
        startGitHubAuth(token);
      }
    };

    socket.on('session:error', handleError);
    return () => {
      socket.off('session:error', handleError);
    };
  }, [socket, token]);
}
