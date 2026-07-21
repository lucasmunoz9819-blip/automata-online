import fs from 'node:fs';
import path from 'node:path';
import { root } from './util.js';

const defaults = {
  name: 'Semilla',
  genesis: 'Aprende y crea valor util sin causar dano.',
  provider: 'mock', model: 'qwen3:4b', ollamaUrl: 'http://127.0.0.1:11434',
  tickSeconds: 30, initialCredits: 100, costPerTurn: 1,
  workspace: './workspace', allowShell: false, allowNetwork: false,
  allowSelfModification: true, allowReplication: true, maxChildren: 3,
  maxSpendPerTurn: 5
};

export function loadConfig() {
  const file = path.join(root, 'config.json');
  const disk = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return {
    ...defaults, ...disk,
    provider: process.env.AUTOMATA_PROVIDER ?? disk.provider ?? defaults.provider,
    model: process.env.AUTOMATA_MODEL ?? disk.model ?? defaults.model,
    workspace: path.resolve(root, disk.workspace ?? defaults.workspace),
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    adminToken: process.env.AUTOMATA_ADMIN_TOKEN ?? '',
    autoRun: process.env.AUTOMATA_AUTO_RUN === 'true',
    tickSeconds: Number(process.env.AUTOMATA_TICK_SECONDS ?? disk.tickSeconds ?? defaults.tickSeconds),
    port: Number(process.env.PORT ?? 3000)
  };
}
