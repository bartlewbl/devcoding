import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function GitHubCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (!key) { setError('Missing key'); return; }

    api.get(`/github/redeem?key=${key}`)
      .then(() => {
        localStorage.setItem('githubConnected', 'true');
        navigate('/dashboard');
      })
      .catch(() => setError('Failed to connect GitHub'));
  }, [navigate]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 text-sm">
      {error ? <span className="text-red-400">{error}</span> : 'Connecting GitHub…'}
    </div>
  );
}
