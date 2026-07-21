#!/usr/bin/env node
import fs from 'node:fs';
import { loadConfig } from './config.js';
import { loadState } from './state.js';
import { tick } from './agent.js';
import { auditFile } from './util.js';

const command = process.argv[2] ?? 'help';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (command === 'demo') {
  for (let i = 0; i < 3; i++) console.log(JSON.stringify(await tick(), null, 2));
} else if (command === 'run') {
  const config = loadConfig();
  console.log(`Automata iniciado. Un turno cada ${config.tickSeconds}s. Ctrl+C para detener.`);
  while (true) {
    const result = await tick();
    console.log(`[${new Date().toISOString()}] turno=${result.state.turn} estado=${result.state.status} creditos=${result.state.credits} accion=${result.state.lastAction}`);
    if (result.stopped) break;
    await sleep(config.tickSeconds * 1000);
  }
} else if (command === 'status') {
  const config = loadConfig();
  console.log(JSON.stringify(loadState(config), null, 2));
} else if (command === 'logs') {
  console.log(fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : 'Sin eventos');
} else {
  console.log('Uso: node src/cli.js <run|demo|status|logs>');
}
