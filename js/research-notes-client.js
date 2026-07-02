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

export async function loadPublishedNotesFromApi() {
  const res = await fetch('/api/research/notes', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Could not load research notes (HTTP ${res.status})`);
  const data = await res.json();
  setPublishedNotes(data.notes || []);
  return publishedNotes;
}

export async function loadPublishedNoteBody(slug) {
  const res = await fetch(`/api/research/notes/${encodeURIComponent(slug)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`Could not load note (HTTP ${res.status})`);
  return res.json();
}
