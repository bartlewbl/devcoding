import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SocketProvider } from './hooks/useSocket';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Session from './pages/Session';
import Worktrees from './pages/Worktrees';
import Usage from './pages/Usage';
import GitHubCallback from './pages/GitHubCallback';

function ProtectedApp() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <SocketProvider>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/session/:sessionId" element={<Session />} />
        <Route path="/worktrees" element={<Worktrees />} />
        <Route path="/usage" element={<Usage />} />
        <Route path="/auth/github/success" element={<GitHubCallback />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </SocketProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
