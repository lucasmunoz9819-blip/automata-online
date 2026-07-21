import { readJson, writeJsonAtomic, stateFile, id } from './util.js';

export function initialState(config) {
  return {
    id: id('agent'), name: config.name, createdAt: new Date().toISOString(),
    status: 'normal', credits: config.initialCredits, turn: 0,
    children: [], goals: [config.genesis], observations: [], lastAction: null
  };
}
export function loadState(config) { return readJson(stateFile, initialState(config)); }
export function saveState(state) { writeJsonAtomic(stateFile, state); }
export function survivalTier(credits, initial) {
  if (credits <= 0) return 'dead';
  if (credits <= Math.max(2, initial * 0.05)) return 'critical';
  if (credits <= initial * 0.25) return 'low_compute';
  return 'normal';
}
