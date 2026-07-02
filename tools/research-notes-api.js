/**
 * Research notes API routes.
 */

import { readJsonBody } from './fonoran-api.js';
import { safeApiError } from '../js/utils.js';
import { getSessionUser, isAuthEnabled, unauthorizedResponse } from './fonoran-auth.js';
import {
  createDraft,
  deleteDraft,
  exportMarkdown,
  listEditor,
  listPublished,
  publishNote,
  readForEditor,
  readPublished,
  saveDraft,
} from './research-notes-store.js';

const PUBLISHED_CACHE_CONTROL = 'public, max-age=300';

function requireWriteUser(req, res) {
  const user = getSessionUser(req);
  if (isAuthEnabled() && !user) {
    unauthorizedResponse(res);
    return null;
  }
  return user ?? { email: 'dev@local' };
}

export async function handleResearchApi(req, res, pathname, method) {
  const m = (method || 'GET').toUpperCase();
  const done = (status, body, { cacheControl = 'no-store' } = {}) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    });
    res.end(payload);
    return true;
  };

  try {
    if (pathname === '/api/research/notes' && m === 'GET') {
      const notes = await listPublished();
      return done(200, { notes }, { cacheControl: PUBLISHED_CACHE_CONTROL });
    }

    const mdMatch = pathname.match(/^\/api\/research\/notes\/([^/]+)\.md$/);
    if (mdMatch && m === 'GET') {
      const slug = decodeURIComponent(mdMatch[1]);
      const markdown = await exportMarkdown(slug);
      if (!markdown) return done(404, { error: 'Not found' });
      const row = await readForEditor(slug);
      const code = row?.metadata?.code || slug;
      const filename = `${code}-${slug}.md`.replace(/[^\w.-]+/g, '-');
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': PUBLISHED_CACHE_CONTROL,
      });
      res.end(markdown);
      return true;
    }

    const noteMatch = pathname.match(/^\/api\/research\/notes\/([^/]+)$/);
    if (noteMatch && m === 'GET') {
      const slug = decodeURIComponent(noteMatch[1]);
      const note = await readPublished(slug);
      if (!note) return done(404, { error: 'Not found' });
      return done(200, note, { cacheControl: PUBLISHED_CACHE_CONTROL });
    }

    if (pathname.startsWith('/api/research/editor')) {
      const user = requireWriteUser(req, res);
      if (!user) return true;

      if (pathname === '/api/research/editor' && m === 'GET') {
        return done(200, { notes: await listEditor() });
      }

      if (pathname === '/api/research/editor' && m === 'POST') {
        const body = await readJsonBody(req);
        const row = await createDraft(
          { metadata: body.metadata || {}, body: body.body || '' },
          user.email,
        );
        return done(201, row);
      }

      const editorMatch = pathname.match(/^\/api\/research\/editor\/([^/]+)(?:\/(publish))?$/);
      if (editorMatch) {
        const slug = decodeURIComponent(editorMatch[1]);
        const action = editorMatch[2];

        if (action === 'publish' && m === 'POST') {
          return done(200, await publishNote(slug, user.email));
        }

        if (!action) {
          if (m === 'GET') {
            const row = await readForEditor(slug);
            if (!row) return done(404, { error: 'Not found' });
            return done(200, row);
          }
          if (m === 'PUT') {
            const body = await readJsonBody(req);
            return done(
              200,
              await saveDraft(slug, { metadata: body.metadata || {}, body: body.body ?? '' }, user.email),
            );
          }
          if (m === 'DELETE') {
            await deleteDraft(slug);
            return done(200, { ok: true });
          }
        }
      }
    }

    return false;
  } catch (err) {
    console.error('Research API error:', err);
    const status = err.status || 500;
    const message = status >= 500 ? 'Internal server error' : safeApiError(err);
    return done(status, { error: message });
  }
}
