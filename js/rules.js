export const MODIFIER_ROW_ORDER = ['plain', 'voice', 'friction', 'nasal', 'glide'];

export const FALLBACK_RULES = {
  places: [
    { id: 'lips', symbol: '○', keyNumber: 1, keyLetter: 'p', label: 'Lips', sound: 'p', explanation: 'Lips/front-most articulation' },
    { id: 'front_tongue', symbol: '∩', keyNumber: 2, keyLetter: 't', label: 'Front Tongue', sound: 't', explanation: 'Front tongue/alveolar or dental articulation' },
    { id: 'middle_tongue', symbol: '⌒', keyNumber: 3, keyLetter: 'c', label: 'Middle Tongue', sound: 'c', explanation: 'Middle tongue/palatal or post-alveolar articulation' },
    { id: 'back_tongue', symbol: '∪', keyNumber: 4, keyLetter: 'k', label: 'Back Tongue', sound: 'k', explanation: 'Back tongue/velar articulation' },
    { id: 'throat', symbol: '⊐', keyNumber: 5, keyLetter: 'h', label: 'Throat', sound: '?', explanation: 'Throat/glottal articulation' },
  ],
  modifiers: [
    { id: 'voice', symbol: '⌔', keyNumber: 6, keyLetter: 'b', label: 'Voice', explanation: 'Adds voicing to a place sound' },
    { id: 'friction', symbol: '⌕', keyNumber: 7, keyLetter: 'd', label: 'Friction', explanation: 'Adds friction/fricative quality' },
    { id: 'nasal', symbol: '⌙', keyNumber: 8, keyLetter: 'j', label: 'Nasal', explanation: 'Adds nasal airflow' },
    { id: 'glide', symbol: '⌓', keyNumber: 9, keyLetter: 'g', label: 'Glide / Liquid', explanation: 'Creates glide or liquid sounds' },
  ],
  soundGrid: [
    { modifierId: 'plain', placeId: 'lips', symbols: '○', sound: 'p', ipa: '/p/', status: 'defined', explanation: 'Plain lips stop' },
    { modifierId: 'plain', placeId: 'front_tongue', symbols: '∩', sound: 't', ipa: '/t/', status: 'defined', explanation: 'Plain front tongue stop' },
    { modifierId: 'plain', placeId: 'middle_tongue', symbols: '⌒', sound: 'c', ipa: '/tʃ/ or /c/', status: 'defined', explanation: 'Plain middle tongue stop/affricate placeholder' },
    { modifierId: 'plain', placeId: 'back_tongue', symbols: '∪', sound: 'k', ipa: '/k/', status: 'defined', explanation: 'Plain back tongue stop' },
    { modifierId: 'plain', placeId: 'throat', symbols: '⊐', sound: '?', ipa: '?', status: 'undefined', explanation: 'Open research gap' },
    { modifierId: 'voice', placeId: 'lips', symbols: '⌔○', sound: 'b', ipa: '/b/', status: 'defined', explanation: 'Voiced lips sound' },
    { modifierId: 'voice', placeId: 'front_tongue', symbols: '⌔∩', sound: 'd', ipa: '/d/', status: 'defined', explanation: 'Voiced front tongue sound' },
    { modifierId: 'voice', placeId: 'middle_tongue', symbols: '⌔⌒', sound: 'j', ipa: '/dʒ/', status: 'defined', explanation: 'Voiced middle tongue sound' },
    { modifierId: 'voice', placeId: 'back_tongue', symbols: '⌔∪', sound: 'g', ipa: '/g/', status: 'defined', explanation: 'Voiced back tongue sound' },
    { modifierId: 'voice', placeId: 'throat', symbols: '⌔⊐', sound: '?', ipa: '?', status: 'undefined', explanation: 'Open research gap' },
    { modifierId: 'friction', placeId: 'lips', symbols: '⌕○', sound: 'f', ipa: '/f/', status: 'defined', explanation: 'Friction lips sound' },
    { modifierId: 'friction', placeId: 'front_tongue', symbols: '⌕∩', sound: 's', ipa: '/s/', status: 'defined', explanation: 'Friction front tongue sound' },
    { modifierId: 'friction', placeId: 'middle_tongue', symbols: '⌕⌒', sound: 'sh', ipa: '/ʃ/', status: 'defined', explanation: 'Friction middle tongue sound' },
    { modifierId: 'friction', placeId: 'back_tongue', symbols: '⌕∪', sound: 'x', ipa: '/x/', status: 'defined', explanation: 'Friction back tongue sound' },
    { modifierId: 'friction', placeId: 'throat', symbols: '⌕⊐', sound: 'h', ipa: '/h/', status: 'defined', explanation: 'Friction throat sound' },
    { modifierId: 'nasal', placeId: 'lips', symbols: '⌙○', sound: 'm', ipa: '/m/', status: 'defined', explanation: 'Nasal lips sound' },
    { modifierId: 'nasal', placeId: 'front_tongue', symbols: '⌙∩', sound: 'n', ipa: '/n/', status: 'defined', explanation: 'Nasal front tongue sound' },
    { modifierId: 'nasal', placeId: 'middle_tongue', symbols: '⌙⌒', sound: 'ñ', ipa: '/ɲ/', status: 'defined', explanation: 'Nasal middle tongue sound' },
    { modifierId: 'nasal', placeId: 'back_tongue', symbols: '⌙∪', sound: 'ng', ipa: '/ŋ/', status: 'defined', explanation: 'Nasal back tongue sound' },
    { modifierId: 'nasal', placeId: 'throat', symbols: '⌙⊐', sound: '?', ipa: '?', status: 'undefined', explanation: 'Open research gap' },
    { modifierId: 'glide', placeId: 'lips', symbols: '⌓○', sound: 'w', ipa: '/w/', status: 'defined', explanation: 'Glide lips sound' },
    { modifierId: 'glide', placeId: 'front_tongue', symbols: '⌓∩', sound: 'y', ipa: '/j/', status: 'defined', explanation: 'Glide front tongue sound' },
    { modifierId: 'glide', placeId: 'middle_tongue', symbols: '⌓⌒', sound: 'r', ipa: '/r/', status: 'defined', explanation: 'Glide middle tongue sound' },
    { modifierId: 'glide', placeId: 'back_tongue', symbols: '⌓∪', sound: 'l', ipa: '/l/', status: 'defined', explanation: 'Glide back tongue sound' },
    { modifierId: 'glide', placeId: 'throat', symbols: '⌓⊐', sound: '?', ipa: '?', status: 'undefined', explanation: 'Open research gap' },
  ],
  specialDerivedSounds: [
    { symbols: '∩⌕', sound: 'th', ipa: '/θ/', status: 'defined', explanation: 'Voiceless dental fricative, as in "thin"' },
    { symbols: '∩⌔', sound: 'dh', ipa: '/ð/', status: 'defined', explanation: 'Voiced dental fricative, as in "this"' },
  ],
  experimentalVowels: [
    { symbols: '⊐⊐', sound: 'a', vowel: 'a', ipa: '/a/', notes: 'open throat-centered vowel', status: 'experimental', explanation: 'Experimental vowel', experimental: true },
    { symbols: '⊐∩', sound: 'e', vowel: 'e', ipa: '/e/', notes: 'front vowel', status: 'experimental', explanation: 'Experimental vowel', experimental: true },
    { symbols: '⊐⌒', sound: 'i', vowel: 'i', ipa: '/i/', notes: 'high/front vowel', status: 'experimental', explanation: 'Experimental vowel', experimental: true },
    { symbols: '⊐∪', sound: 'o', vowel: 'o', ipa: '/o/', notes: 'back vowel', status: 'experimental', explanation: 'Experimental vowel', experimental: true },
    { symbols: '⊐○', sound: 'u', vowel: 'u', ipa: '/u/', notes: 'rounded lips vowel', status: 'experimental', explanation: 'Experimental vowel', experimental: true },
  ],
  experimentalVowelCollapsed: [
    { sound: 'a / ā', symbols: '⊐⊐' },
    { sound: 'e / ē', symbols: '⊐∩' },
    { sound: 'i / ī', symbols: '⊐⌒' },
    { sound: 'o / ō', symbols: '⊐∪' },
    { sound: 'u / ū', symbols: '⊐○' },
  ],
  experimentalVowelExamples: [
    { word: 'pa', spelling: '○⊐⊐' },
    { word: 'pe', spelling: '○⊐∩' },
    { word: 'pi', spelling: '○⊐⌒' },
    { word: 'po', spelling: '○⊐∪' },
    { word: 'pu', spelling: '○⊐○' },
    { word: 'pay', spelling: '○⊐⊐' },
    { word: 'pee', spelling: '○⊐∩' },
    { word: 'pie', spelling: '○⊐⌒' },
    { word: 'poe', spelling: '○⊐∪' },
    { word: 'pew', spelling: '○⊐○' },
  ],
  experimentalDerivedSounds: [
    {
      symbols: '○⌔',
      sound: 'v',
      ipa: '/v/',
      status: 'experimental',
      explanation: 'Voiced labial fricative derived from reversed lips-voice ordering',
    },
  ],
  notes: [],
};

function toCamelCase(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function parseTableRows(lines) {
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(toCamelCase);
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = cells[i] ?? '';
      if (h === 'keyNumber') val = parseInt(val, 10) || 0;
      obj[h] = val;
    });
    return obj;
  });
}

function parseSubsectionTable(body, titlePrefix) {
  const subparts = body.split(/^### /m);
  for (const part of subparts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    if (!title.startsWith(titlePrefix)) continue;
    return rowsToObjects(parseTableRows((nl === -1 ? '' : part.slice(nl + 1)).split('\n')));
  }
  return [];
}

function mapVowelRow(r) {
  return {
    symbols: r.symbols,
    sound: r.vowel || r.sound,
    vowel: r.vowel || r.sound,
    ipa: r.ipa || '',
    notes: r.notes || '',
    status: 'experimental',
    explanation: r.notes || 'Experimental vowel',
    experimental: true,
  };
}

function parseTablesFromBody(body) {
  const lines = body.split('\n');
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('|')) {
      i++;
      continue;
    }
    const tableLines = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    const rows = rowsToObjects(parseTableRows(tableLines));
    if (rows.length) tables.push(rows);
  }
  return tables;
}

function parseExperimentalVowelSection(body) {
  if (!body) {
    return { experimentalVowels: [], experimentalVowelCollapsed: [], experimentalVowelExamples: [] };
  }

  const experimentalVowels = [];
  let experimentalVowelCollapsed = [];
  let experimentalVowelExamples = [];
  const subparts = body.split(/^### /m);

  for (const part of subparts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    const subBody = nl === -1 ? '' : part.slice(nl + 1);
    const tables = parseTablesFromBody(subBody);

    if (
      title === 'experimental vowel mapping' ||
      title === 'short vowels' ||
      title.startsWith('candidate mapping')
    ) {
      for (const rows of tables) {
        experimentalVowels.push(...rows.filter((r) => r.symbols && (r.vowel || r.sound)).map(mapVowelRow));
      }
    } else if (title === 'long vowels') {
      for (const rows of tables) {
        if (rows[0]?.sound && rows[0]?.symbols && !rows[0]?.word) {
          experimentalVowelCollapsed.push(
            ...rows.filter((r) => r.symbols && r.sound).map((r) => ({ sound: r.sound, symbols: r.symbols })),
          );
        }
        if (rows[0]?.word) {
          experimentalVowelExamples.push(
            ...rows.filter((r) => r.word).map((r) => ({
              word: r.word,
              spelling: r.spelling || r['experimental spelling'] || '',
            })),
          );
        }
      }
    } else if (title === 'examples') {
      for (const rows of tables) {
        experimentalVowelExamples.push(
          ...rows
            .filter((r) => r.word)
            .map((r) => ({ word: r.word, spelling: r.spelling || r['experimental spelling'] || '' })),
        );
      }
    }
  }

  return { experimentalVowels, experimentalVowelCollapsed, experimentalVowelExamples };
}

function parseExperimentalDerivedSection(body) {
  const rows = parseSubsectionTable(body, 'candidate sounds');
  return rows
    .filter((r) => r.symbols && r.sound)
    .map((r) => ({
      symbols: r.symbols,
      sound: r.sound,
      ipa: r.ipa || '',
      status: r.status || 'experimental',
      explanation: r.explanation || 'Experimental derived sound',
      experimental: true,
    }));
}

export function parseLanguageRulesMarkdown(markdown) {
  const sections = {};
  for (const part of markdown.split(/^## /m)) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    sections[title] = nl === -1 ? '' : part.slice(nl + 1);
  }

  const vowelKey =
    Object.keys(sections).find((k) => k.startsWith('experimental vowel system')) || '';
  const derivedKey =
    Object.keys(sections).find((k) => k.startsWith('experimental derived sounds')) || '';

  const { experimentalVowels, experimentalVowelCollapsed, experimentalVowelExamples } =
    parseExperimentalVowelSection(sections[vowelKey] || '');

  return {
    places: rowsToObjects(parseTableRows((sections['places of articulation'] || '').split('\n'))),
    modifiers: rowsToObjects(parseTableRows((sections['modifiers'] || '').split('\n'))),
    soundGrid: rowsToObjects(parseTableRows((sections['sound grid'] || '').split('\n'))),
    specialDerivedSounds: rowsToObjects(parseTableRows((sections['special derived sounds'] || '').split('\n'))),
    experimentalVowels,
    experimentalVowelCollapsed,
    experimentalVowelExamples,
    experimentalDerivedSounds: parseExperimentalDerivedSection(sections[derivedKey] || ''),
    notes: (sections['notes'] || '')
      .split('\n')
      .map((l) => l.replace(/^[\*\-]\s*/, '').trim())
      .filter(Boolean),
  };
}

export async function loadRules(url = 'language-rules.md') {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { rules: parseLanguageRulesMarkdown(await res.text()), usingFallback: false };
  } catch {
    return { rules: FALLBACK_RULES, usingFallback: true };
  }
}

export function getAllSymbols(r) {
  return [...r.places.map((p) => p.symbol), ...r.modifiers.map((m) => m.symbol)];
}

export function getThroatSymbol(r) {
  return r.places.find((p) => p.id === 'throat')?.symbol ?? '⊐';
}

export function findGridCell(r, modifierId, placeId) {
  return r.soundGrid.find((c) => c.modifierId === modifierId && c.placeId === placeId);
}

export function getDecodableEntries(r) {
  const grid = r.soundGrid || [];
  const derived = (r.specialDerivedSounds || []).filter((c) => c.status === 'defined');
  const expDerived = (r.experimentalDerivedSounds || []).filter((c) => c.status !== 'undefined');
  const vowels = (r.experimentalVowels || []).filter(
    (c) => c.status !== 'undefined' && !/^⌔⊐/.test(c.symbols),
  );
  return [...grid, ...derived, ...expDerived, ...vowels];
}

export function getEncodableEntries(r) {
  const grid = r.soundGrid.filter((c) => c.status === 'defined');
  const derived = (r.specialDerivedSounds || []).filter((c) => c.status === 'defined');
  const expDerived = (r.experimentalDerivedSounds || []).filter((c) => c.status !== 'undefined');
  const vowels = (r.experimentalVowels || []).filter(
    (c) => c.status !== 'undefined' && !/^⌔⊐/.test(c.symbols),
  );
  return [...grid, ...derived, ...expDerived, ...vowels];
}

export function getQuizEntries(r) {
  return getEncodableEntries(r).filter((c) => c.sound && c.sound !== '?');
}

export function buildSoundToSymbolsMap(r) {
  const map = {};
  for (const cell of getEncodableEntries(r)) {
    if (!map[cell.sound]) map[cell.sound] = cell.symbols;
  }
  return map;
}

export function getDefinedSounds(r) {
  return [...new Set(getEncodableEntries(r).map((c) => c.sound))].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b.localeCompare(a);
  });
}

export function buildSymbolPatterns(r) {
  return getDecodableEntries(r)
    .map((cell) => ({ symbols: cell.symbols, cell }))
    .sort((a, b) => b.symbols.length - a.symbols.length);
}

export function buildKeyboardMap(r) {
  const byNumber = {};
  const byLetter = {};
  for (const p of r.places) {
    if (p.keyNumber) byNumber[String(p.keyNumber)] = p.symbol;
    if (p.keyLetter) byLetter[p.keyLetter.toLowerCase()] = p.symbol;
  }
  for (const m of r.modifiers) {
    if (m.keyNumber) byNumber[String(m.keyNumber)] = m.symbol;
    if (m.keyLetter) byLetter[m.keyLetter.toLowerCase()] = m.symbol;
  }
  return { byNumber, byLetter };
}

export function findCellBySymbols(r, symbols) {
  return getEncodableEntries(r).find((c) => c.symbols === symbols) || null;
}

export function reverseLookup(sound, r) {
  const trimmed = sound.trim();
  if (!trimmed) return null;
  const matches = getEncodableEntries(r).filter((c) => c.sound === trimmed);
  return matches.length ? matches : null;
}
