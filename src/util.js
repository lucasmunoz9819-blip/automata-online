import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const root = path.resolve(process.cwd());
export const dataDir = path.join(root, '.automata');
export const stateFile = path.join(dataDir, 'state.json');
export const auditFile = path.join(dataDir, 'audit.jsonl');
export const soulFile = path.join(root, 'SOUL.md');

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
export function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}
export function id(prefix = 'evt') { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
export function inside(base, candidate) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, candidate);
  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) throw new Error('Ruta fuera del espacio autorizado');
  return resolved;
}
