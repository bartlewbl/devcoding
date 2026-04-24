import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const Ctx = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { token, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const s = io(BACKEND, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    s.on('connect_error', (err) => console.error('Socket error:', err.message));
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [isAuthenticated, token]);

  return <Ctx.Provider value={socket}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);
