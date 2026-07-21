import fs from 'node:fs';
import path from 'node:path';
import { inside, ensureDir, root, id } from './util.js';
import { audit } from './audit.js';

export async function executeTool(action, args, ctx) {
  const { config, state } = ctx;
  ensureDir(config.workspace);
  if (action === 'list_files') {
    const target = inside(config.workspace, args.path ?? '.');
    return fs.existsSync(target) ? fs.readdirSync(target).slice(0, 100) : [];
  }
  if (action === 'read_file') {
    const target = inside(config.workspace, args.path);
    return fs.readFileSync(target, 'utf8').slice(0, 100_000);
  }
  if (action === 'write_file') {
    const target = inside(config.workspace, args.path);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, String(args.content).slice(0, 100_000));
    return { written: path.relative(config.workspace, target) };
  }
  if (action === 'reflect') return { recorded: String(args.note ?? '').slice(0, 2000) };
  if (action === 'propose_modification') {
    if (!config.allowSelfModification) throw new Error('Automodificacion desactivada');
    const proposalId = id('change');
    const target = path.join(root, '.automata', 'proposals', `${proposalId}.json`);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, JSON.stringify({
      id: proposalId, createdAt: new Date().toISOString(),
      reason: String(args.reason ?? '').slice(0, 4000),
      file: String(args.file ?? '').slice(0, 500),
      patch: String(args.patch ?? '').slice(0, 50_000), status: 'pending_review'
    }, null, 2));
    audit('modification_proposed', { proposalId, file: args.file });
    return { proposalId, status: 'pending_review' };
  }
  if (action === 'replicate') {
    if (!config.allowReplication) throw new Error('Replicacion desactivada');
    if (state.children.length >= config.maxChildren) throw new Error('Limite de descendientes alcanzado');
    const childId = id('child');
    const target = path.join(root, 'children', childId);
    ensureDir(target);
    fs.writeFileSync(path.join(target, 'genesis.json'), JSON.stringify({ parent: state.id, genesis: args.genesis ?? state.goals[0], createdAt: new Date().toISOString() }, null, 2));
    state.children.push(childId);
    audit('child_created', { childId, target });
    return { childId, state: 'dormant', activation: 'manual' };
  }
  throw new Error(`Herramienta desconocida: ${action}`);
}
