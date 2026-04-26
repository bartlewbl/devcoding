import { CLIProvider } from '../types';

export interface AuthPrompt {
  url: string;
  code?: string;
  provider: CLIProvider;
}

// Provider-specific auth URL patterns
const AUTH_PATTERNS: Record<CLIProvider, RegExp[]> = {
  claude: [
    /https?:\/\/[^\s"')]*anthropic\.com\/[^\s"')]+/i,
    /https?:\/\/[^\s"')]*claude\.ai\/[^\s"')]+/i,
  ],
  codex: [
    /https?:\/\/[^\s"')]*openai\.com\/[^\s"')]+/i,
    /https?:\/\/[^\s"')]*chatgpt\.com\/[^\s"')]+/i,
  ],
  kimi: [
    /https?:\/\/[^\s"')]*kimi\.com\/[^\s"')]+/i,
    /https?:\/\/[^\s"')]*moonshot\.cn\/[^\s"')]+/i,
    /https?:\/\/[^\s"')]*moonshot\.ai\/[^\s"')]+/i,
  ],
};

// Device code pattern: e.g. ABCD-1234, XXXX-XXXX
const DEVICE_CODE_RE = /\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/;

// Generic HTTPS URL matcher for fallback
const GENERIC_URL_RE = /https?:\/\/[^\s"')]+/g;

// Keywords that suggest an auth/login flow (to reduce false positives)
const AUTH_KEYWORDS = [
  'login', 'signin', 'sign-in', 'authorize', 'authenticate', 'auth',
  'device', 'oauth', 'callback', 'code', 'token', 'verify',
];

function looksLikeAuthUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AUTH_KEYWORDS.some((k) => lower.includes(k));
}

function findDeviceCode(text: string): string | undefined {
  const match = text.match(DEVICE_CODE_RE);
  return match ? match[1] : undefined;
}

export function detectAuthPrompt(provider: CLIProvider, raw: string): AuthPrompt | null {
  const patterns = AUTH_PATTERNS[provider] || [];
  const text = raw.replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI colors

  // Try provider-specific patterns first
  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      const url = match[0];
      // If it's a generic provider match, try to ensure it looks auth-related
      // (provider-specific domains are usually auth-related anyway)
      const code = findDeviceCode(text);
      return { url, code, provider };
    }
  }

  // Fallback: any HTTPS URL that contains auth keywords
  const genericMatches = text.match(GENERIC_URL_RE);
  if (genericMatches) {
    for (const url of genericMatches) {
      if (looksLikeAuthUrl(url)) {
        const code = findDeviceCode(text);
        return { url, code, provider };
      }
    }
  }

  return null;
}
