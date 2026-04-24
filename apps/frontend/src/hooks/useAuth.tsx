import { createContext, useContext, useState, ReactNode } from 'react';
import api from '../lib/api';

interface AuthCtx {
  isAuthenticated: boolean;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({
  isAuthenticated: false,
  token: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const login = async (username: string, password: string) => {
    const { data } = await api.post<{ token: string }>('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('githubConnected');
    setToken(null);
  };

  return (
    <Ctx.Provider value={{ isAuthenticated: !!token, token, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
