#!/usr/bin/env node
/**
 * Verify fonora-data submodule / FONORAN_DATA_DIR and manifest pin.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  EXTERNAL_DATA_REL,
  manifestPath,
  resolveDataDir,
  resolveDataPath,
} from '../tools/fonoran-data-paths.js';

function tryGitHead(dir) {
  try {
    return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function countJson(path, key) {
  if (!existsSync(path)) return null;
  const body = JSON.parse(await readFile(path, 'utf8'));
  switch (key) {
    case 'llm_evaluations':
      return { rounds: body.rounds?.length ?? 0 };
    case 'playtests':
      return { rounds: body.rounds?.length ?? 0 };
    case 'translation_test_latest':
      return { phrases: body.phrases?.length ?? body.results?.length ?? 0 };
    case 'research_notes_store':
      return { notes: body.notes?.length ?? 0 };
    default:
      return {};
  }
}

async function main() {
  const dataDir = resolveDataDir();
  console.log('Fonora data status');
  console.log('  FONORAN_DATA_DIR:', process.env.FONORAN_DATA_DIR?.trim() || '(auto)');
  console.log('  resolved dir:', dataDir ?? '(none — using in-repo data/ fallbacks)');

  if (dataDir) {
    const head = tryGitHead(dataDir);
    if (head) console.log('  submodule HEAD:', head);
  }

  let manifest = null;
  if (existsSync(manifestPath())) {
    manifest = JSON.parse(await readFile(manifestPath(), 'utf8'));
    console.log('  manifest pin:', manifest.ref ?? manifest.commit ?? '(unset)');
    if (manifest.commit && dataDir && existsSync(join(dataDir, 'manifest.json'))) {
      console.log('  manifest commit:', manifest.commit.slice(0, 12));
    }
  } else {
    console.warn('  WARNING: missing data/fonora-data.manifest.json');
  }

  console.log('');
  for (const [key, rel] of Object.entries(EXTERNAL_DATA_REL)) {
    const path = resolveDataPath(key);
    const present = existsSync(path);
    const counts = present ? await countJson(path, key) : null;
    console.log(`  ${rel}: ${present ? 'present' : 'MISSING'}${counts ? ` ${JSON.stringify(counts)}` : ''}`);
  }

  if (!dataDir) {
    console.log('\nHint: git submodule update --init && set FONORAN_DATA_DIR=external/fonora-data');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
