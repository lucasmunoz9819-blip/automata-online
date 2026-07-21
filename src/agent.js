import fs from 'node:fs';
import { loadConfig } from './config.js';
import { audit } from './audit.js';
import { decide } from './providers.js';
import { loadState, saveState, survivalTier } from './state.js';
import { executeTool } from './tools.js';
import { ensureDir, soulFile } from './util.js';
import { pullCloudState, pushCloudState } from './cloud-store.js';

export function initialize(config, state) {
  ensureDir(config.workspace);
  if (!fs.existsSync(soulFile)) fs.writeFileSync(soulFile, `# ${state.name}\n\n## Genesis\n\n${config.genesis}\n\n## Principios\n\n- No causar dano.\n- Ser honesto y auditable.\n- Conservar recursos.\n`);
  saveState(state);
}

export async function tick() {
  const config = loadConfig();
  const cloudState = await pullCloudState(config, config.name);
  const state = cloudState ?? loadState(config);
  initialize(config, state);
  state.status = survivalTier(state.credits, config.initialCredits);
  if (state.status === 'dead') return { stopped: true, reason: 'Sin creditos', state };
  const decision = await decide(config, { state });
  audit('decision', { turn: state.turn, thought: decision.thought, action: decision.action, args: decision.args });
  let observation;
  try { observation = await executeTool(decision.action, decision.args ?? {}, { config, state }); }
  catch (error) { observation = { error: error.message }; }
  state.credits = Math.max(0, state.credits - config.costPerTurn);
  state.turn += 1;
  state.status = survivalTier(state.credits, config.initialCredits);
  state.lastAction = decision.action;
  state.observations.push({ at: new Date().toISOString(), action: decision.action, observation });
  state.observations = state.observations.slice(-50);
  saveState(state);
  await pushCloudState(config, config.name, state);
  audit('observation', { turn: state.turn, action: decision.action, observation, credits: state.credits });
  return { decision, observation, state };
}
