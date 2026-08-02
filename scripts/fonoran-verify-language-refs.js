#!/usr/bin/env node
/**
 * Fail when a document or a lesson teaches a Fonoran form the language no longer has.
 *
 * WHY THIS EXISTS
 *
 * Compound spellings are DERIVED: `yenan` is what you get by concatenating the roots for
 * water and path, assembled at build time. Nothing stops a document or a lesson fixture
 * from writing those letters by hand, and once written, that copy has forked from the
 * seeds with nothing to detect it. Respell a root and every hand-copied spelling silently
 * becomes a lie.
 *
 * Not hypothetical. In one sitting a core doc was found describing `law` as
 * collective + path when it is collective + still, the grammar reference carried three
 * retired spellings (`pedal`, `daktopa`, `tampe`), and the Learn practice fixture was
 * teaching `mi le` and `mi sak telto`, neither of which exists in the seeds. A learner
 * doing that lesson was being taught words the language does not contain.
 *
 * HOW IT AVOIDS FALSE POSITIVES
 *
 * Fonoran is phonetically plain, so many English words are Fonoran-shaped ("not", "so",
 * "data"). Flagging anything that merely looks Fonoran produced 744 findings, nearly all
 * of them filenames and CLI words inside backticks. So the two surfaces are checked with
 * different rules:
 *
 * - PROSE is checked for tokens that fully decompose into known ROOT spellings but are not
 *   themselves a current form. That is the signature of a retired or hand-assembled
 *   compound: `daktopa` is dak+to+pa, all real roots, yet no longer a word. Measured on
 *   the ops docs, this flags none of git/data/zip/admin/notes/login/github, because those
 *   do not decompose into roots. It cannot catch a bare non-root syllable like `le`, which
 *   is the deliberate cost of having no noise.
 * - LEARN FIXTURES are checked strictly: every token in a Fonoran-bearing field must be a
 *   current form. These fields hold Fonoran by definition, so `le` is caught here.
 *
 * Research notes are exempt: they are historical records and are supposed to quote the
 * spelling that was current when they were written.
 *
 * Usage:
 *   node scripts/fonoran-verify-language-refs.js
 *   node scripts/fonoran-verify-language-refs.js --verbose
 */

import { readFileSync, existsSync, globSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = rel => JSON.parse(readFileSync(`${ROOT}/${rel}`, 'utf8'));
const VERBOSE = process.argv.includes('--verbose');

/** Marker that exempts a whole file, for records that must preserve historical spellings. */
const ARCHIVAL_MARKER = 'language-ref: archival';

/**
 * Generated snapshots, exempt by path rather than by marker: they are overwritten by their
 * generators, which would strip an in-file marker on the next run. They record the state of
 * the lexicon at a past moment and are supposed to keep the spellings of that moment.
 * Empty today: generated reports now land in untracked `reports/`, outside the scan.
 */
const ARCHIVAL_FILES = new Set();

/**
 * Tokens that are deliberately not words. The rulebook teaches the
 * phonotactic rules by showing what they REJECT, so these must survive the check or those
 * documents cannot explain themselves.
 */
const ILLUSTRATIVE = new Set([
  'ka', 'kat',           // Rule 5: if `ka` is a root, `kat` cannot be
  'sannan', 'sannnan',   // Rule 7: doubled-consonant collision
  'kaso',                // worked example in the compound graph
  'bem', 'mam',          // boundary-collision example
  'sesakhu',             // the deleted `what` compound, cited as the interrogative-ownership cautionary tale
]);

/**
 * English words that happen to decompose into Fonoran roots.
 *
 * Fonoran's phonology is deliberately plain, so collisions like this are expected: `human`
 * splits as hu+man and `modules` as mo+du+les, all real roots. Each of these was verified
 * to be ordinary English prose inside backticks (a field name, a CLI word, an authority
 * tier), not a Fonoran form. Keep this list short: if it starts growing, the heuristic
 * rather than the list is the thing to revisit.
 */
const ENGLISH_COLLISIONS = new Set([
  'human', 'panel', 'modules', 'hope', 'token', 'side', 'files', 'beside', 'woman',
  'wakes', 'mode',
]);

/**
 * Forms quoted verbatim as evidence of a past defect, kept because rewriting them would
 * falsify the record. `kelto` is the clearest case: the model invented it for *machine*, a
 * concept the language does not have, and the gap assessment quotes the resulting sentence
 * to show a negation leak. The grammar reference used to teach the same sentence as a
 * correct example, which was a genuine error and has been replaced with a verified golden.
 */
const QUOTED_DEFECT_OUTPUT = new Set(['kelto']);

/** Learn fields that hold Fonoran by definition, and are therefore checked strictly. */
const FONORAN_FIELDS = /^(answerRoman|promptFonoran|roman|fonoran|answer_roman|surface)$/;

// ── Legal forms, derived from the seeds exactly as the build derives them ─────────────

const bucket = readJson('data/fonoran-sound-bucket.json');
const particles = readJson('data/fonoran-grammar-particles.json').particles ?? [];
const policy = existsSync(`${ROOT}/data/fonoran-grammar-policy.json`)
  ? readJson('data/fonoran-grammar-policy.json')
  : { lexicalized: {} };

const rootSpelling = new Map();
for (const entry of bucket.sounds ?? []) {
  if (entry.concept_id && entry.spelling) rootSpelling.set(entry.concept_id, entry.spelling);
}
const rootForms = new Set(rootSpelling.values());
const particleForm = new Map(particles.map(p => [p.id, p.form]));

const legalForms = new Set(rootForms);
for (const form of particleForm.values()) if (form) legalForms.add(form);
for (const compound of bucket.compounds ?? []) {
  if (compound.spelling) legalForms.add(compound.spelling);
  // Accept the form implied by the composition too, so a document is not punished for a
  // spelling the lab has not rebuilt yet.
  const parts = (compound.composition ?? []).map(id => rootSpelling.get(id));
  if (parts.length && parts.every(Boolean)) legalForms.add(parts.join(''));
}
for (const def of Object.values(policy.lexicalized ?? {})) {
  const parts = (def?.composition ?? []).map(id => rootSpelling.get(id) ?? particleForm.get(id));
  if (parts.length && parts.every(Boolean)) legalForms.add(parts.join(''));
}

/** True when the token splits completely into known root spellings. */
const segmentCache = new Map();
function decomposesIntoRoots(word) {
  if (segmentCache.has(word)) return segmentCache.get(word);
  let ok = rootForms.has(word);
  for (let i = 2; i <= word.length - 2 && !ok; i += 1) {
    if (rootForms.has(word.slice(0, i)) && decomposesIntoRoots(word.slice(i))) ok = true;
  }
  segmentCache.set(word, ok);
  return ok;
}

/** In prose: a compound-shaped token built from real roots that is no longer a word. */
function isStaleCompound(token) {
  const word = token.toLowerCase();
  if (word.length < 4) return false;        // bare syllables are indistinguishable from English
  if (legalForms.has(word) || ILLUSTRATIVE.has(word) || ENGLISH_COLLISIONS.has(word)) return false;
  if (QUOTED_DEFECT_OUTPUT.has(word)) return false;
  return decomposesIntoRoots(word);
}

// ── Scanning ─────────────────────────────────────────────────────────────────────────

const findings = [];
const record = (file, line, token, context, reason) => {
  findings.push({ file, line, token, reason, context: String(context).trim().slice(0, 110) });
};

/** Only inline code spans and fenced blocks are read: that is where this project writes Fonoran. */
function scanMarkdown(relPath) {
  if (ARCHIVAL_FILES.has(relPath)) return { skipped: true };
  const text = readFileSync(`${ROOT}/${relPath}`, 'utf8');
  if (text.includes(ARCHIVAL_MARKER)) return { skipped: true };

  let inFence = false;
  text.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    const segments = inFence ? [line] : [...line.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    for (const segment of segments) {
      // Square brackets are the translator's own marker for a form that is NOT a word:
      // an unresolved gap or an unapproved proposal, as in `dan les mas [tetsas]`. A doc
      // quoting one is documenting the gap, so the bracket is the point.
      for (const token of segment.replace(/\[[^\]]*\]/g, ' ').split(/[^A-Za-z]+/)) {
        if (isStaleCompound(token)) {
          record(relPath, index + 1, token.toLowerCase(), line, 'retired or hand-assembled compound');
        }
      }
    }
  });
  return { skipped: false };
}

function scanFixture(relPath) {
  if (!existsSync(`${ROOT}/${relPath}`)) return;
  const raw = readFileSync(`${ROOT}/${relPath}`, 'utf8');
  const lines = raw.split('\n');

  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value !== 'string' || !FONORAN_FIELDS.test(key)) { walk(value); continue; }
      // Brackets mark an honest gap or an unapproved composition, and guillemets mark a
      // loan. Both are deliberately not words, so their contents are not checked here.
      const surface = value.replace(/\[[^\]]*\]/g, ' ').replace(/«[^»]*»/g, ' ');
      for (const token of surface.split(/[^A-Za-z]+/)) {
        const word = token.toLowerCase();
        if (!word || legalForms.has(word)) continue;
        const lineNo = lines.findIndex(l => l.includes(`"${key}"`) && l.includes(value)) + 1;
        record(relPath, lineNo, word, `${key}: ${value}`, 'not a current form');
      }
    }
  };
  walk(JSON.parse(raw));
}

const docs = globSync('docs/*.md', { cwd: ROOT });
let archived = 0;
for (const doc of docs) {
  if (scanMarkdown(doc).skipped) archived += 1;
}
const fixtures = [
  // Seed of English + tip templates: any Fonoran-bearing field appearing here is a bug.
  'data/fonoran-grammar-lessons.json',
  // The published lesson corpus (phrases + compiled grammar basics): an unapproved
  // runtime composition reaching this file would teach a word the lexicon does not own.
  'data/fonoran-course-phrases.json',
];
for (const fixture of fixtures) scanFixture(fixture);

// ── Report ───────────────────────────────────────────────────────────────────────────

console.log(
  `Language reference check: ${legalForms.size} legal forms, `
  + `${docs.length - archived} live doc(s)${archived ? ` (${archived} archival)` : ''} `
  + `+ ${fixtures.length} Learn fixture(s).`,
);

if (!findings.length) {
  console.log('✓ no stale Fonoran forms in live docs or Learn fixtures.');
  process.exit(0);
}

const byFile = new Map();
for (const finding of findings) {
  if (!byFile.has(finding.file)) byFile.set(finding.file, []);
  byFile.get(finding.file).push(finding);
}

console.error(`\n✗ ${findings.length} reference(s) to forms the language does not have:\n`);
for (const [file, items] of byFile) {
  console.error(`  ${file}`);
  for (const item of items) {
    console.error(`    line ${item.line}: ${item.token}  (${item.reason})`);
    if (VERBOSE) console.error(`      ${item.context}`);
  }
}
console.error(`
Each is a spelling that has been retired, or a word that never existed. Compound
spellings are DERIVED from roots, so never hand-copy one: check the seeds instead.

  Deliberate non-word used to teach a rule -> add it to ILLUSTRATIVE in this script.
  Historical record that must keep old spellings -> add "${ARCHIVAL_MARKER}" to the file.
`);
process.exit(1);
