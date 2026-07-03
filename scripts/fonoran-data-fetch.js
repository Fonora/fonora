#!/usr/bin/env node
/**
 * Fetch Fonora/fonora-data into external/fonora-data when git submodules are absent
 * (e.g. Heroku GitHub deploy). Uses the commit/ref pin in data/fonora-data.manifest.json.
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestPath } from '../tools/fonoran-data-paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function resolveDest() {
  const explicit = process.env.FONORAN_DATA_DIR?.trim();
  if (explicit && !explicit.startsWith('/')) {
    return join(ROOT, explicit);
  }
  return explicit || join(ROOT, 'external/fonora-data');
}

function repoSlug(repository) {
  const raw = (repository || 'https://github.com/Fonora/fonora-data').trim();
  return raw
    .replace(/\.git$/, '')
    .replace(/^https?:\/\/github\.com\//, '');
}

export async function fetchFonoraDataIfNeeded({ dest = resolveDest(), force = false } = {}) {
  if (process.env.FONORAN_SKIP_DATA_FETCH === '1') {
    console.log('fonora-data fetch skipped (FONORAN_SKIP_DATA_FETCH=1)');
    return { skipped: true, reason: 'env' };
  }

  const marker = join(dest, 'manifest.json');
  if (!force && existsSync(marker)) {
    console.log('fonora-data already present at', dest);
    return { skipped: true, reason: 'present', dest };
  }

  const manifest = JSON.parse(await readFile(manifestPath(), 'utf8'));
  const slug = repoSlug(manifest.repository);
  const ref = manifest.commit || manifest.ref;
  if (!ref) throw new Error('data/fonora-data.manifest.json missing commit/ref');

  const url = `https://github.com/${slug}/archive/${ref}.tar.gz`;
  console.log('Fetching fonora-data:', url);

  const tmpDir = join(ROOT, '.tmp-fonora-data-fetch');
  const tgz = join(tmpDir, 'archive.tar.gz');
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fonora-data fetch failed (${res.status}): ${url}`);
  }

  await writeFile(tgz, Buffer.from(await res.arrayBuffer()));
  execSync(`tar -xzf ${shellQuote(tgz)} -C ${shellQuote(tmpDir)}`, { stdio: 'inherit' });

  const entries = await readdir(tmpDir);
  const extracted = entries.find(e => e.startsWith('fonora-data-'));
  if (!extracted) {
    throw new Error(`fonora-data archive missing fonora-data-* directory (got: ${entries.join(', ')})`);
  }

  await rm(dest, { recursive: true, force: true });
  await cp(join(tmpDir, extracted), dest, { recursive: true });
  await rm(tmpDir, { recursive: true, force: true });

  console.log('fonora-data installed at', dest, `(${ref})`);
  return { fetched: true, dest, ref };
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const force = process.argv.includes('--force');
  fetchFonoraDataIfNeeded({ force })
    .catch(err => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
