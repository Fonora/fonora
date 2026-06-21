const GLOSSARY_KEY = 'fonora-glossary-v1';
const SAMPLE_IDS = new Set(['example-1', 'example-2']);

export function loadGlossary() {
  try {
    const raw = localStorage.getItem(GLOSSARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGlossary(entries) {
  localStorage.setItem(GLOSSARY_KEY, JSON.stringify(entries));
}

export function migrateSampleGlossary() {
  const entries = loadGlossary();
  const filtered = entries.filter(
    (e) =>
      !SAMPLE_IDS.has(e.id) &&
      !(e.notes && e.notes.includes('Example entry')),
  );
  if (filtered.length !== entries.length) {
    saveGlossary(filtered);
  }
}

export function addGlossaryEntry({ english, languageSpelling, pronunciation, notes }) {
  if (!english || !languageSpelling) return false;
  const entries = loadGlossary();
  entries.push({
    id: String(Date.now()),
    english,
    languageSpelling,
    pronunciation: pronunciation || '',
    notes: notes || '',
  });
  saveGlossary(entries);
  return true;
}

export function findDictionaryEntry(english) {
  return loadGlossary().find((e) => e.english.toLowerCase() === english.toLowerCase());
}

export function findDictionaryBySpelling(spelling) {
  return loadGlossary().find((e) => e.languageSpelling === spelling);
}
