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

async function readAnalyticsRows() {
  await ensureCommunitySchema();
  if (resolveStorageMode() === 'postgres') {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      const [usersRes, votesRes] = await Promise.all([
        client.query('SELECT created_at FROM fonoran_users ORDER BY created_at ASC'),
        client.query('SELECT created_at FROM fonoran_votes WHERE vote = 1 ORDER BY created_at ASC'),
      ]);
      return {
        users: usersRes.rows.map((r) => ({ created_at: toIso(r.created_at) })),
        upvotes: votesRes.rows.map((r) => ({ created_at: toIso(r.created_at) })),
      };
    } finally {
      client.release();
    }
  }
  const doc = await readJsonDoc();
  return {
    users: doc.users.map((u) => ({ created_at: u.created_at })),
    upvotes: doc.votes.filter((v) => v.vote === 1).map((v) => ({ created_at: v.created_at })),
  };
}

export async function getUserAnalytics() {
  const { users, upvotes } = await readAnalyticsRows();
  return {
    generated_at: new Date().toISOString(),
    users: {
      total: users.length,
      ...buildMetricBlock(users, 'created_at'),
    },
    upvotes: buildMetricBlock(upvotes, 'created_at'),
  };
}
