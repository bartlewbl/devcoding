import { useState } from 'react';
import { ExternalLink, Copy, Check, X } from 'lucide-react';

interface Props {
  provider: 'claude' | 'kimi' | 'codex';
  url: string;
  code?: string;
  onClose: () => void;
}

const PROVIDER_META: Record<string, { name: string; color: string; description: string }> = {
  claude: {
    name: 'Claude Code',
    color: 'text-orange-300',
    description: 'Claude Code needs you to authenticate. Click the link below to sign in with your Anthropic account. After authorizing, return to this session.',
  },
  codex: {
    name: 'OpenAI Codex',
    color: 'text-green-300',
    description: 'OpenAI Codex needs you to authenticate. Click the link below to sign in with your ChatGPT or OpenAI account. After authorizing, return to this session.',
  },
  kimi: {
    name: 'Kimi CLI',
    color: 'text-blue-300',
    description: 'Kimi CLI needs you to authenticate. Click the link below to sign in with your Kimi (Moonshot) account. After authorizing, return to this session.',
  },
};

export default function AuthPromptModal({ provider, url, code, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const meta = PROVIDER_META[provider] || PROVIDER_META.claude;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <h3 className={`text-lg font-semibold ${meta.color}`}>{meta.name} — Sign In Required</h3>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Dismiss"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-zinc-300 mb-5 leading-relaxed">{meta.description}</p>

        <div className="space-y-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-sm font-medium transition-colors"
          >
            <ExternalLink size={16} />
            Open Authentication Link
          </a>

          <button
            onClick={copyUrl}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 text-xs transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy link to clipboard'}
          </button>
        </div>

        {code && (
          <div className="mt-5 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Device Code</div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-lg font-mono text-zinc-100 tracking-widest">{code}</code>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                  } catch {
                    // ignore
                  }
                }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                title="Copy code"
              >
                <Copy size={14} />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Enter this code on the authentication page if prompted.</p>
          </div>
        )}

        <div className="mt-5 text-[11px] text-zinc-500 leading-relaxed">
          Tip: If the link uses a localhost callback, authentication may complete automatically on the server. If not, consider setting an API key environment variable for headless setups.
        </div>
      </div>
    </div>
  );
}
