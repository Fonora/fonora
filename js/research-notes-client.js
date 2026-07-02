/**
 * Client-side helpers for the published research notes index (from API).
 */

import { resolveNotePhase } from './research-notes.js';

/** @type {object[]} */
let publishedNotes = [];

/** @param {object[]} notes */
export function setPublishedNotes(notes) {
  publishedNotes = Array.isArray(notes) ? [...notes] : [];
  publishedNotes.sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
    return String(a.code).localeCompare(String(b.code));
  });
}

export function getPublishedNotes() {
  return publishedNotes;
}

/** @param {string} slug */
export function getResearchNote(slug) {
  return publishedNotes.find((n) => n.slug === slug) ?? null;
}

/** @param {string} slug */
export function getNoteNeighbors(slug) {
  const idx = publishedNotes.findIndex((n) => n.slug === slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? publishedNotes[idx - 1] : null,
    next: idx < publishedNotes.length - 1 ? publishedNotes[idx + 1] : null,
  };
}

export function getOpenNotes() {
  return publishedNotes.filter((n) => n.status === 'Open');
}

/** @param {import('./research-notes.js').RESEARCH_PHASES} phases */
export function notesByPhase(phases) {
  return phases.map((phase) => ({
    phase,
    notes: publishedNotes.filter((n) => resolveNotePhase(n) === phase.id),
  }));
}

function readBootstrapPayload() {
  const el = document.getElementById('research-notes-bootstrap');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export async function loadPublishedNotesFromApi() {
  const bootstrap = readBootstrapPayload();
  if (bootstrap?.notes) {
    setPublishedNotes(bootstrap.notes);
    return publishedNotes;
  }
  const res = await fetch('/api/research/notes', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Could not load research notes (HTTP ${res.status})`);
  const data = await res.json();
  setPublishedNotes(data.notes || []);
  return publishedNotes;
}

export async function loadPublishedNoteBody(slug) {
  const cleanSlug = String(slug || '').trim();
  const bootstrap = readBootstrapPayload();
  if (bootstrap?.note && bootstrap.note.metadata?.slug === cleanSlug) {
    return bootstrap.note;
  }
  const res = await fetch(`/api/research/notes/${encodeURIComponent(cleanSlug)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`Could not load note (HTTP ${res.status})`);
  return res.json();
}
