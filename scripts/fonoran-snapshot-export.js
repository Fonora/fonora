#!/usr/bin/env node
/**
 * Export Fonoran snapshot (lab + editorial docs) to zip or seed directory.
 *
 * Usage:
 *   npm run fonoran:snapshot:export
 *   npm run fonoran:snapshot:export -- --to=data/
 *   npm run fonoran:snapshot:export -- backups/custom.zip
 */
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exportSnapshotToFile,
  exportSnapshotToDir,
  exportSnapshotDir,
} from '../tools/fonoran-snapshot.js';
import { closeStore } from '../tools/fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function defaultZipPath() {
  const stamp = new Date().toISOString().slice(0, 10);
  return join(ROOT, 'backups', `fonoran-${stamp}.zip`);
}

function parseArgs(argv) {
  const toIdx = argv.indexOf('--to');
  if (toIdx !== -1) {
    return { mode: 'seed', target: argv[toIdx + 1] || join(ROOT, 'data') };
  }
  const dirIdx = argv.indexOf('--dir');
  if (dirIdx !== -1) {
    return { mode: 'dir', target: argv[dirIdx + 1] || join(ROOT, 'backups', 'fonoran-snapshot') };
  }
  const positional = argv.find(a => !a.startsWith('--'));
  return { mode: 'zip', target: positional || defaultZipPath() };
}

try {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  if (opts.mode === 'seed') {
    result = await exportSnapshotToDir(opts.target);
    console.log(`Exported snapshot to seed paths under ${opts.target}`);
    console.log(`  ${result.sounds} roots, ${result.compounds} words, ${result.files} files`);
  } else if (opts.mode === 'dir') {
    result = await exportSnapshotDir(opts.target);
    console.log(`Exported unzipped snapshot to ${result.to}`);
    console.log(`  ${JSON.stringify(result.summary)}`);
  } else {
    mkdirSync(dirname(opts.target), { recursive: true });
    result = await exportSnapshotToFile(opts.target);
    console.log(`Exported snapshot zip to ${result.to}`);
    console.log(`  ${JSON.stringify(result.summary)}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeStore();
}
