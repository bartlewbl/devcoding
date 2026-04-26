import fs from 'fs';
import path from 'path';
import os from 'os';
import toml from 'toml';

export interface KimiModelInfo {
  key: string;
  displayName: string;
  provider: string;
  model: string;
}

export function getKimiDefaultModel(): KimiModelInfo | undefined {
  const configPath = path.join(os.homedir(), '.kimi', 'config.toml');
  if (!fs.existsSync(configPath)) return undefined;

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = toml.parse(raw);

    const defaultModel: string | undefined = config.default_model;
    if (!defaultModel) return undefined;

    const modelsSection = config.models as Record<string, any> | undefined;
    const modelEntry = modelsSection?.[defaultModel];
    if (!modelEntry) {
      // Fallback: if no models section, just use the default_model value itself
      return {
        key: defaultModel,
        displayName: defaultModel,
        provider: '',
        model: defaultModel,
      };
    }

    return {
      key: defaultModel,
      displayName: modelEntry.display_name || defaultModel,
      provider: modelEntry.provider || '',
      model: modelEntry.model || defaultModel,
    };
  } catch (err) {
    console.error('[kimiConfig] failed to parse config.toml:', err);
    return undefined;
  }
}
