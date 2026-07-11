/**
 * Community users, learn progress sync, proposals, and votes.
 * Postgres when configured; JSON file fallback for local dev.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { resolveStorageMode, ensurePgSchema } from './fonoran-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(ROOT, 'data/fonoran-community.json');

const COMMUNITY_SQL = `
CREATE TABLE IF NOT EXISTS fonoran_users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_fonoran_users_email ON fonoran_users (lower(email));

CREATE TABLE IF NOT EXISTS fonoran_learn_progress (
  user_id TEXT PRIMARY KEY REFERENCES fonoran_users(id) ON DELETE CASCADE,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fonoran_proposals (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT,
  author_user_id TEXT NOT NULL REFERENCES fonoran_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_fonoran_proposals_status ON fonoran_proposals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS fonoran_votes (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES fonoran_users(id) ON DELETE CASCADE,
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_fonoran_votes_subject ON fonoran_votes (subject_type, subject_id);
`;

const REFERRAL_MIGRATION_SQL = `
ALTER TABLE fonoran_users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE fonoran_users ADD COLUMN IF NOT EXISTS referrals_sent INTEGER NOT NULL DEFAULT 0;
`;

/** @param {string | null | undefined} ref */
export function isValidReferralId(ref) {
  return typeof ref === 'string' && /^usr-[a-z0-9-]+$/i.test(ref);
}

let schemaReady = false;
/** @type {object | null} */
let jsonCache = null;

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function defaultJsonDoc() {
  return {
    version: '1.0-community',
    users: [],
    learn_progress: {},
    proposals: [],
    votes: [],
  };
}

async function readJsonDoc() {
  if (jsonCache) return jsonCache;
  try {
    const raw = await readFile(JSON_PATH, 'utf8');
    jsonCache = JSON.parse(raw);
  } catch {
    jsonCache = defaultJsonDoc();
  }
  if (!Array.isArray(jsonCache.users)) jsonCache.users = [];
  if (!jsonCache.learn_progress || typeof jsonCache.learn_progress !== 'object') {
    jsonCache.learn_progress = {};
  }
  if (!Array.isArray(jsonCache.proposals)) jsonCache.proposals = [];
  if (!Array.isArray(jsonCache.votes)) jsonCache.votes = [];
  return jsonCache;
}

async function writeJsonDoc(doc) {
  jsonCache = doc;
  await mkdir(dirname(JSON_PATH), { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

let communityPool = null;

async function getPool() {
  if (communityPool) return communityPool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const { default: pg } = await import('pg');
  communityPool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });
  return communityPool;
}

async function ensureCommunitySchema() {
  if (schemaReady) return;
  if (resolveStorageMode() === 'postgres') {
    await ensurePgSchema();
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query(COMMUNITY_SQL);
      await client.query(REFERRAL_MIGRATION_SQL);
    } finally {
      client.release();
    }
  }
  schemaReady = true;
}

/**
 * @param {string | null | undefined} userId
 */
export async function getReferralCount(userId) {
  if (!userId) return 0;
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const { rows } = await pool.query(
      'SELECT referrals_sent FROM fonoran_users WHERE id = $1',
      [userId],
    );
    return Number(rows[0]?.referrals_sent ?? 0);
  }
  const doc = await readJsonDoc();
  const user = doc.users.find((u) => u.id === userId);
  return Number(user?.referrals_sent ?? 0);
}

async function referrerExists(referrerId) {
  if (!isValidReferralId(referrerId)) return false;
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const { rows } = await pool.query('SELECT id FROM fonoran_users WHERE id = $1', [referrerId]);
    return Boolean(rows[0]?.id);
  }
  const doc = await readJsonDoc();
  return doc.users.some((u) => u.id === referrerId);
}

/**
 * @param {string} referrerId
 */
async function incrementReferralsSent(referrerId) {
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    await pool.query(
      'UPDATE fonoran_users SET referrals_sent = referrals_sent + 1 WHERE id = $1',
      [referrerId],
    );
    return;
  }
  const doc = await readJsonDoc();
  const referrer = doc.users.find((u) => u.id === referrerId);
  if (referrer) {
    referrer.referrals_sent = (referrer.referrals_sent ?? 0) + 1;
    await writeJsonDoc(doc);
  }
}

/**
 * @param {{ provider: string, providerSub: string, email: string, name?: string, referredBy?: string | null }} profile
 * @returns {Promise<{ id: string, email: string, name: string, isNew: boolean }>}
 */
export async function upsertUser({ provider, providerSub, email, name, referredBy = null }) {
  await ensureCommunitySchema();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();

  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows: existing } = await client.query(
        'SELECT id FROM fonoran_users WHERE provider = $1 AND provider_sub = $2',
        [provider, providerSub],
      );
      if (existing[0]?.id) {
        await client.query(
          `UPDATE fonoran_users SET email = $1, name = $2, last_login = NOW() WHERE id = $3`,
          [normalizedEmail, name ?? normalizedEmail, existing[0].id],
        );
        return {
          id: existing[0].id,
          email: normalizedEmail,
          name: name ?? normalizedEmail,
          isNew: false,
        };
      }
      const id = newId('usr');
      let validReferrer = null;
      if (isValidReferralId(referredBy) && referredBy !== id && (await referrerExists(referredBy))) {
        validReferrer = referredBy;
      }
      await client.query(
        `INSERT INTO fonoran_users (id, provider, provider_sub, email, name, referred_by, referrals_sent, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW())`,
        [id, provider, providerSub, normalizedEmail, name ?? normalizedEmail, validReferrer],
      );
      if (validReferrer) await incrementReferralsSent(validReferrer);
      return { id, email: normalizedEmail, name: name ?? normalizedEmail, isNew: true };
    } finally {
      client.release();
    }
  }

  const doc = await readJsonDoc();
  let user = doc.users.find(u => u.provider === provider && u.provider_sub === providerSub);
  if (user) {
    user.email = normalizedEmail;
    user.name = name ?? normalizedEmail;
    user.last_login = now;
    await writeJsonDoc(doc);
    return { id: user.id, email: user.email, name: user.name, isNew: false };
  }

  const id = newId('usr');
  let validReferrer = null;
  if (isValidReferralId(referredBy) && referredBy !== id) {
    const referrer = doc.users.find((u) => u.id === referredBy);
    if (referrer) validReferrer = referredBy;
  }
  user = {
    id,
    provider,
    provider_sub: providerSub,
    email: normalizedEmail,
    name: name ?? normalizedEmail,
    created_at: now,
    last_login: now,
    referred_by: validReferrer,
    referrals_sent: 0,
  };
  doc.users.push(user);
  if (validReferrer) {
    const referrer = doc.users.find((u) => u.id === validReferrer);
    if (referrer) referrer.referrals_sent = (referrer.referrals_sent ?? 0) + 1;
  }
  await writeJsonDoc(doc);
  return { id: user.id, email: user.email, name: user.name, isNew: true };
}

export async function getLearnProgress(userId) {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT payload_json, updated_at FROM fonoran_learn_progress WHERE user_id = $1',
        [userId],
      );
      if (!rows[0]) return { progress: null, updated_at: null };
      return { progress: rows[0].payload_json, updated_at: rows[0].updated_at };
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  const entry = doc.learn_progress[userId];
  if (!entry) return { progress: null, updated_at: null };
  return { progress: entry.payload, updated_at: entry.updated_at };
}

export async function saveLearnProgress(userId, progress) {
  await ensureCommunitySchema();
  const now = new Date().toISOString();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO fonoran_learn_progress (user_id, payload_json, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE SET payload_json = $2::jsonb, updated_at = NOW()`,
        [userId, JSON.stringify(progress ?? {})],
      );
      return { updated_at: now };
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  doc.learn_progress[userId] = { payload: progress ?? {}, updated_at: now };
  await writeJsonDoc(doc);
  return { updated_at: now };
}

/** Merge progress: higher totalXp wins; per-skill max xp; mastery sums seen/correct. */
export function mergeLearnProgress(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') return remote;
  const out = { ...remote };
  if ((local.totalXp ?? 0) > (out.totalXp ?? 0)) out.totalXp = local.totalXp;
  if ((local.streak ?? 0) > (out.streak ?? 0)) out.streak = local.streak;
  out.skills = out.skills && typeof out.skills === 'object' ? { ...out.skills } : {};
  const localSkills = local.skills && typeof local.skills === 'object' ? local.skills : {};
  for (const [skillId, ls] of Object.entries(localSkills)) {
    const rs = out.skills[skillId] ?? {};
    const merged = { ...rs, ...ls };
    merged.xp = Math.max(ls.xp ?? 0, rs.xp ?? 0);
    merged.sessions = Math.max(ls.sessions ?? 0, rs.sessions ?? 0);
    merged.lessonIndex = Math.max(ls.lessonIndex ?? 0, rs.lessonIndex ?? 0);
    merged.mastery = { ...(rs.mastery ?? {}) };
    for (const [key, ms] of Object.entries(ls.mastery ?? {})) {
      const rm = merged.mastery[key] ?? { seen: 0, correct: 0 };
      merged.mastery[key] = {
        seen: Math.max(ms.seen ?? 0, rm.seen ?? 0),
        correct: Math.max(ms.correct ?? 0, rm.correct ?? 0),
      };
    }
    out.skills[skillId] = merged;
  }
  return out;
}

export async function createProposal(userId, body) {
  await ensureCommunitySchema();
  const id = newId('prop');
  const now = new Date().toISOString();
  const record = {
    id,
    target_type: body.target_type,
    target_ref: body.target_ref,
    kind: body.kind,
    payload: body.payload ?? {},
    rationale: body.rationale?.trim() || null,
    author_user_id: userId,
    status: 'open',
    created_at: now,
    resolved_at: null,
    resolved_by: null,
  };

  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO fonoran_proposals
         (id, target_type, target_ref, kind, payload_json, rationale, author_user_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'open', NOW())`,
        [id, record.target_type, record.target_ref, record.kind, JSON.stringify(record.payload), record.rationale, userId],
      );
    } finally {
      client.release();
    }
  } else {
    const doc = await readJsonDoc();
    doc.proposals.push(record);
    await writeJsonDoc(doc);
  }
  return record;
}

export async function listProposals({ status = 'open', limit = 100 } = {}) {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = status
        ? await client.query(
          'SELECT * FROM fonoran_proposals WHERE status = $2 ORDER BY created_at DESC LIMIT $1',
          [limit, status],
        )
        : await client.query(
          'SELECT * FROM fonoran_proposals ORDER BY created_at DESC LIMIT $1',
          [limit],
        );
      return rows.map(rowToProposal);
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  return doc.proposals
    .filter(p => !status || p.status === status)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, limit);
}

export async function getProposal(id) {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT * FROM fonoran_proposals WHERE id = $1', [id]);
      return rows[0] ? rowToProposal(rows[0]) : null;
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  return doc.proposals.find(p => p.id === id) ?? null;
}

export async function resolveProposal(id, { status, resolvedBy }) {
  await ensureCommunitySchema();
  const now = new Date().toISOString();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `UPDATE fonoran_proposals SET status = $2, resolved_at = NOW(), resolved_by = $3
         WHERE id = $1 RETURNING *`,
        [id, status, resolvedBy],
      );
      return rows[0] ? rowToProposal(rows[0]) : null;
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  const p = doc.proposals.find(x => x.id === id);
  if (!p) return null;
  p.status = status;
  p.resolved_at = now;
  p.resolved_by = resolvedBy;
  await writeJsonDoc(doc);
  return p;
}

function rowToProposal(row) {
  return {
    id: row.id,
    target_type: row.target_type,
    target_ref: row.target_ref,
    kind: row.kind,
    payload: row.payload_json ?? row.payload ?? {},
    rationale: row.rationale ?? null,
    author_user_id: row.author_user_id,
    status: row.status,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    resolved_at: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
    resolved_by: row.resolved_by ?? null,
  };
}

export async function setVote(userId, subjectType, subjectId, vote) {
  await ensureCommunitySchema();
  const id = newId('vote');
  const now = new Date().toISOString();

  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      if (vote === 0 || vote == null) {
        await client.query(
          'DELETE FROM fonoran_votes WHERE user_id = $1 AND subject_type = $2 AND subject_id = $3',
          [userId, subjectType, subjectId],
        );
        return { cleared: true };
      }
      await client.query(
        `INSERT INTO fonoran_votes (id, subject_type, subject_id, user_id, vote, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, subject_type, subject_id) DO UPDATE SET vote = $5, created_at = NOW()`,
        [id, subjectType, subjectId, userId, vote],
      );
      return { vote };
    } finally {
      client.release();
    }
  }

  const doc = await readJsonDoc();
  doc.votes = doc.votes.filter(v =>
    !(v.user_id === userId && v.subject_type === subjectType && v.subject_id === subjectId),
  );
  if (vote !== 0 && vote != null) {
    doc.votes.push({
      id,
      subject_type: subjectType,
      subject_id: subjectId,
      user_id: userId,
      vote,
      created_at: now,
    });
  }
  await writeJsonDoc(doc);
  return vote === 0 || vote == null ? { cleared: true } : { vote };
}

export async function getVoteAggregate(subjectType, subjectId) {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE vote = 1) AS up,
           COUNT(*) FILTER (WHERE vote = -1) AS down
         FROM fonoran_votes WHERE subject_type = $1 AND subject_id = $2`,
        [subjectType, subjectId],
      );
      const up = Number(rows[0]?.up ?? 0);
      const down = Number(rows[0]?.down ?? 0);
      return { up, down, score: up - down };
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  const votes = doc.votes.filter(v => v.subject_type === subjectType && v.subject_id === subjectId);
  const up = votes.filter(v => v.vote === 1).length;
  const down = votes.filter(v => v.vote === -1).length;
  return { up, down, score: up - down };
}

export async function getUserVote(userId, subjectType, subjectId) {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT vote FROM fonoran_votes WHERE user_id = $1 AND subject_type = $2 AND subject_id = $3',
        [userId, subjectType, subjectId],
      );
      return rows[0]?.vote ?? 0;
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  const v = doc.votes.find(x =>
    x.user_id === userId && x.subject_type === subjectType && x.subject_id === subjectId,
  );
  return v?.vote ?? 0;
}

/** Simple in-memory rate limiter for community POSTs. */
const rateBuckets = new Map();

export function checkRateLimit(key, { max = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    const err = new Error('Rate limit exceeded');
    err.status = 429;
    throw err;
  }
}

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toIso(d) {
  return d instanceof Date ? d.toISOString() : String(d);
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function countSince(items, dateField, since) {
  return items.filter((item) => {
    const d = parseDate(item[dateField]);
    return d && d >= since;
  }).length;
}

function buildHourlySeries(items, dateField, hours = 24) {
  const now = new Date();
  const start = new Date(now.getTime() - hours * MS_HOUR);
  const buckets = [];
  for (let i = 0; i < hours; i++) {
    const bucketStart = new Date(start.getTime() + i * MS_HOUR);
    const bucketEnd = new Date(bucketStart.getTime() + MS_HOUR);
    const count = items.filter((item) => {
      const d = parseDate(item[dateField]);
      return d && d >= bucketStart && d < bucketEnd;
    }).length;
    buckets.push({
      start: bucketStart.toISOString(),
      label: bucketStart.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: 'UTC' }),
      count,
    });
  }
  return buckets;
}

function buildDailySeries(items, dateField, days, anchor = new Date()) {
  const endDay = startOfUtcDay(anchor);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const bucketStart = new Date(endDay.getTime() - i * MS_DAY);
    const bucketEnd = new Date(bucketStart.getTime() + MS_DAY);
    const count = items.filter((item) => {
      const d = parseDate(item[dateField]);
      return d && d >= bucketStart && d < bucketEnd;
    }).length;
    buckets.push({
      start: bucketStart.toISOString(),
      label: bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      count,
    });
  }
  return buckets;
}

function buildMonthlySeries(items, dateField) {
  const dated = items
    .map((item) => ({ item, d: parseDate(item[dateField]) }))
    .filter((x) => x.d)
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  if (!dated.length) return [];
  const first = dated[0].d;
  const last = dated[dated.length - 1].d;
  const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
  const buckets = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(Date.UTC(bucketStart.getUTCFullYear(), bucketStart.getUTCMonth() + 1, 1));
    const count = dated.filter((x) => x.d >= bucketStart && x.d < bucketEnd).length;
    buckets.push({
      start: bucketStart.toISOString(),
      label: bucketStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      count,
    });
  }
  return buckets;
}

function buildMetricBlock(items, dateField) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const weekStart = new Date(now.getTime() - 7 * MS_DAY);
  const monthStart = new Date(now.getTime() - 30 * MS_DAY);
  return {
    today: countSince(items, dateField, todayStart),
    week: countSince(items, dateField, weekStart),
    month: countSince(items, dateField, monthStart),
    all_time: items.length,
    series: {
      day: buildHourlySeries(items, dateField),
      week: buildDailySeries(items, dateField, 7),
      month: buildDailySeries(items, dateField, 30),
      all_time: buildMonthlySeries(items, dateField),
    },
  };
}

const LEARN_SKILL_IDS = [
  'script-sounds',
  'script-writing',
  'script-words',
  'fonoran-reading',
  'fonoran-writing',
  'fonoran-hearing',
  'fonoran-grammar',
  'fonoran-speaking',
];

/** @type {Record<string, 'script' | 'language'>} */
const SKILL_TRACK = {
  'script-sounds': 'script',
  'script-writing': 'script',
  'script-words': 'script',
  'fonoran-reading': 'language',
  'fonoran-writing': 'language',
  'fonoran-hearing': 'language',
  'fonoran-grammar': 'language',
  'fonoran-speaking': 'language',
};

function todayUtcDateString() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function parsePracticeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function countPracticeSince(rows, since) {
  return rows.filter((row) => {
    const d = parsePracticeDate(row.last_practice_date);
    return d && d >= since;
  }).length;
}

function buildPracticeSeries(rows, period) {
  const dated = rows
    .map((row) => ({ row, d: parsePracticeDate(row.last_practice_date) }))
    .filter((x) => x.d);
  if (period === 'day') {
    const todayStr = todayUtcDateString();
    const count = rows.filter((row) => row.last_practice_date === todayStr).length;
    return [{
      start: startOfUtcDay(new Date()).toISOString(),
      label: 'Today',
      count,
    }];
  }
  if (period === 'week') {
    return buildDailySeries(rows, 'last_practice_date', 7);
  }
  if (period === 'month') {
    return buildDailySeries(rows, 'last_practice_date', 30);
  }
  return buildMonthlySeries(rows, 'last_practice_date');
}

function masteryPct(mastery) {
  if (!mastery || typeof mastery !== 'object') return 0;
  const entries = Object.values(mastery).filter((v) => v && typeof v === 'object' && (v.seen ?? 0) > 0);
  if (!entries.length) return 0;
  const mastered = entries.filter((v) => (v.correct ?? 0) > 0).length;
  return Math.round((mastered / entries.length) * 100);
}

function skillSessions(skill) {
  return typeof skill?.sessions === 'number' ? skill.sessions : 0;
}

function skillLessonIndex(skill) {
  return typeof skill?.lessonIndex === 'number' && skill.lessonIndex >= 0
    ? Math.floor(skill.lessonIndex)
    : 0;
}

function skillTotalLessons(skill) {
  return typeof skill?.curriculum?.totalLessons === 'number' ? skill.curriculum.totalLessons : 0;
}

function skillCompletionPct(skill) {
  const total = skillTotalLessons(skill);
  if (!total) return 0;
  return Math.round((skillLessonIndex(skill) / total) * 100);
}

function isActiveLearner(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.totalXp === 'number' && payload.totalXp > 0) return true;
  const skills = payload.skills;
  if (!skills || typeof skills !== 'object') return false;
  return LEARN_SKILL_IDS.some((id) => skillSessions(skills[id]) > 0);
}

function trackHasActivity(payload, track) {
  const skills = payload?.skills;
  if (!skills || typeof skills !== 'object') return false;
  return LEARN_SKILL_IDS.some((id) => SKILL_TRACK[id] === track && skillSessions(skills[id]) > 0);
}

function aggregateLearnMetrics(rows) {
  const todayStart = startOfUtcDay(new Date());
  const weekStart = new Date(Date.now() - 7 * MS_DAY);
  const monthStart = new Date(Date.now() - 30 * MS_DAY);
  const todayStr = todayUtcDateString();

  const practiceRows = rows.map((row) => ({
    last_practice_date: row.payload?.lastPracticeDate ?? null,
    updated_at: row.updated_at,
  }));

  const syncRows = rows.map((row) => ({ updated_at: row.updated_at }));

  /** @type {Record<string, { learners: number, sessions: number, lessons_advanced: number, completion_pcts: number[], mastery_pcts: number[] }>} */
  const trackStats = {
    script: { learners: 0, sessions: 0, lessons_advanced: 0, completion_pcts: [], mastery_pcts: [] },
    language: { learners: 0, sessions: 0, lessons_advanced: 0, completion_pcts: [], mastery_pcts: [] },
  };

  /** @type {Record<string, { learners: number, sessions: number, lesson_indexes: number[], completion_pcts: number[], mastery_pcts: number[] }>} */
  const skillStats = {};
  for (const id of LEARN_SKILL_IDS) {
    skillStats[id] = { learners: 0, sessions: 0, lesson_indexes: [], completion_pcts: [], mastery_pcts: [] };
  }

  let activeLearners = 0;
  let totalSessions = 0;
  let reviewModeUsers = 0;
  let dailyGoalHits = 0;
  let streakSum = 0;
  let streakMax = 0;
  let streakActiveToday = 0;
  let scriptLearners = 0;
  let languageLearners = 0;

  for (const row of rows) {
    const payload = row.payload ?? {};
    if (!isActiveLearner(payload)) continue;
    activeLearners += 1;

    const streak = typeof payload.streak === 'number' ? payload.streak : 0;
    streakSum += streak;
    streakMax = Math.max(streakMax, streak);
    if (streak > 0 && payload.lastPracticeDate === todayStr) streakActiveToday += 1;

    const dailyGoal = typeof payload.dailyGoalXp === 'number' ? payload.dailyGoalXp : 50;
    const dailyEarned = typeof payload.dailyXpEarned === 'number' ? payload.dailyXpEarned : 0;
    const dailyDate = typeof payload.dailyXpDate === 'string' ? payload.dailyXpDate : '';
    if (dailyDate === todayStr && dailyEarned >= dailyGoal) dailyGoalHits += 1;

    let inReviewMode = false;
    const skills = payload.skills ?? {};

    if (trackHasActivity(payload, 'script')) scriptLearners += 1;
    if (trackHasActivity(payload, 'language')) languageLearners += 1;

    for (const id of LEARN_SKILL_IDS) {
      const skill = skills[id];
      const sessions = skillSessions(skill);
      totalSessions += sessions;
      const track = SKILL_TRACK[id];
      trackStats[track].sessions += sessions;
      trackStats[track].lessons_advanced += skillLessonIndex(skill);

      if (sessions > 0) {
        skillStats[id].learners += 1;
        skillStats[id].sessions += sessions;
        skillStats[id].lesson_indexes.push(skillLessonIndex(skill));
        const completion = skillCompletionPct(skill);
        skillStats[id].completion_pcts.push(completion);
        trackStats[track].completion_pcts.push(completion);
      }
      const mastery = masteryPct(skill?.mastery);
      if (sessions > 0 || mastery > 0) {
        skillStats[id].mastery_pcts.push(mastery);
        if (sessions > 0) trackStats[track].mastery_pcts.push(mastery);
      }

      const totalLessons = skillTotalLessons(skill);
      if (totalLessons > 0 && skillLessonIndex(skill) >= totalLessons) inReviewMode = true;
    }
    if (inReviewMode) reviewModeUsers += 1;
  }

  trackStats.script.learners = scriptLearners;
  trackStats.language.learners = languageLearners;

  const avg = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);

  function finalizeTrack(track) {
    const s = trackStats[track];
    return {
      learners: s.learners,
      sessions: s.sessions,
      lessons_advanced: s.lessons_advanced,
      avg_completion_pct: avg(s.completion_pcts),
      avg_mastery_pct: avg(s.mastery_pcts),
    };
  }

  return {
    synced_users: rows.length,
    active_learners: activeLearners,
    total_sessions: totalSessions,
    active_today: countPracticeSince(practiceRows, todayStart),
    active_week: countPracticeSince(practiceRows, weekStart),
    active_month: countPracticeSince(practiceRows, monthStart),
    tracks: {
      script: finalizeTrack('script'),
      language: finalizeTrack('language'),
    },
    skills: LEARN_SKILL_IDS.map((id) => ({
      id,
      track: SKILL_TRACK[id],
      learners: skillStats[id].learners,
      sessions: skillStats[id].sessions,
      avg_lesson_index: avg(skillStats[id].lesson_indexes),
      avg_completion_pct: avg(skillStats[id].completion_pcts),
      avg_mastery_pct: avg(skillStats[id].mastery_pcts),
    })),
    streaks: {
      avg: activeLearners ? Math.round((streakSum / activeLearners) * 10) / 10 : 0,
      max: streakMax,
      active_today: streakActiveToday,
    },
    daily_goal_hit_rate: activeLearners ? Math.round((dailyGoalHits / activeLearners) * 100) : 0,
    review_mode_users: reviewModeUsers,
    sync_activity: buildMetricBlock(syncRows, 'updated_at'),
    practice_activity: {
      today: countPracticeSince(practiceRows, todayStart),
      week: countPracticeSince(practiceRows, weekStart),
      month: countPracticeSince(practiceRows, monthStart),
      series: {
        day: buildPracticeSeries(practiceRows, 'day'),
        week: buildPracticeSeries(practiceRows, 'week'),
        month: buildPracticeSeries(practiceRows, 'month'),
        all_time: buildPracticeSeries(practiceRows, 'all_time'),
      },
    },
  };
}

function buildEngagementBlock(users) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const weekStart = new Date(now.getTime() - 7 * MS_DAY);
  const monthStart = new Date(now.getTime() - 30 * MS_DAY);
  const loginRows = users.filter((u) => u.last_login).map((u) => ({ last_login: u.last_login }));

  let returning = 0;
  let referralSignups = 0;
  for (const user of users) {
    if (user.referred_by) referralSignups += 1;
    const created = parseDate(user.created_at);
    const login = parseDate(user.last_login);
    if (created && login && login.getTime() > created.getTime() + MS_DAY) returning += 1;
  }

  return {
    dau: countSince(loginRows, 'last_login', todayStart),
    wau: countSince(loginRows, 'last_login', weekStart),
    mau: countSince(loginRows, 'last_login', monthStart),
    returning_pct: users.length ? Math.round((returning / users.length) * 100) : 0,
    referral_signups: referralSignups,
    logins: buildMetricBlock(loginRows, 'last_login'),
  };
}

async function readAnalyticsRows() {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const [usersRes, votesRes] = await Promise.all([
        client.query(
          'SELECT created_at, last_login, referred_by FROM fonoran_users ORDER BY created_at ASC',
        ),
        client.query('SELECT created_at FROM fonoran_votes WHERE vote = 1 ORDER BY created_at ASC'),
      ]);
      return {
        users: usersRes.rows.map((r) => ({
          created_at: toIso(r.created_at),
          last_login: toIso(r.last_login),
          referred_by: r.referred_by ?? null,
        })),
        upvotes: votesRes.rows.map((r) => ({ created_at: toIso(r.created_at) })),
      };
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  return {
    users: doc.users.map((u) => ({
      created_at: u.created_at,
      last_login: u.last_login ?? u.created_at,
      referred_by: u.referred_by ?? null,
    })),
    upvotes: doc.votes.filter((v) => v.vote === 1).map((v) => ({ created_at: v.created_at })),
  };
}

async function readLearnProgressRows() {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT user_id, payload_json, updated_at FROM fonoran_learn_progress ORDER BY updated_at ASC',
      );
      return rows.map((r) => ({
        user_id: r.user_id,
        payload: r.payload_json ?? {},
        updated_at: toIso(r.updated_at),
      }));
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  return Object.entries(doc.learn_progress ?? {}).map(([userId, entry]) => ({
    user_id: userId,
    payload: entry?.payload ?? {},
    updated_at: entry?.updated_at ?? new Date().toISOString(),
  }));
}

export async function getUserAnalytics() {
  const [{ users, upvotes }, learnRows] = await Promise.all([
    readAnalyticsRows(),
    readLearnProgressRows(),
  ]);
  const signupUsers = users.map((u) => ({ created_at: u.created_at }));
  const learn = aggregateLearnMetrics(learnRows);
  const engagement = buildEngagementBlock(users);

  return {
    generated_at: new Date().toISOString(),
    users: {
      total: users.length,
      ...buildMetricBlock(signupUsers, 'created_at'),
    },
    upvotes: buildMetricBlock(upvotes, 'created_at'),
    learn,
    engagement,
  };
}
