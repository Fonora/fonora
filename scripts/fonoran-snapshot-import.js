#!/usr/bin/env node
/**
 * Import Fonoran snapshot from zip or seed directory into active store.
 *
 * Usage:
 *   npm run fonoran:snapshot:import -- backups/fonoran-2026-06-28.zip
 *   npm run fonoran:snapshot:import -- --from=data/
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importSnapshotZip,
  importSnapshotFromDir,
  importSnapshotDir,
  readZipFile,
} from '../tools/fonoran-snapshot.js';
import { closeStore } from '../tools/fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const fromIdx = argv.indexOf('--from');
  if (fromIdx !== -1) {
    return { mode: 'seed', target: argv[fromIdx + 1] || join(ROOT, 'data') };
  }
  const dirIdx = argv.indexOf('--dir');
  if (dirIdx !== -1) {
    return { mode: 'dir', target: argv[dirIdx + 1] };
  }
  const positional = argv.find(a => !a.startsWith('--'));
  if (!positional) throw new Error('Provide a zip path, --from=data/, or --dir=path');
  return { mode: positional.endsWith('.zip') ? 'zip' : 'seed', target: positional };
}

try {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  if (opts.mode === 'seed') {
    result = await importSnapshotFromDir(opts.target);
    console.log(`Imported snapshot from seed paths under ${opts.target}`);
  } else if (opts.mode === 'dir') {
    result = await importSnapshotDir(opts.target);
    console.log(`Imported unzipped snapshot from ${opts.target}`);
  } else {
    const buffer = readZipFile(opts.target);
    result = await importSnapshotZip(buffer);
    console.log(`Imported snapshot zip from ${opts.target}`);
  }
  console.log(`  ${result.sounds} roots, ${result.compounds} words, ${result.docs} editorial docs`);
  if (result.summary) console.log(`  ${JSON.stringify(result.summary)}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeStore();
}
