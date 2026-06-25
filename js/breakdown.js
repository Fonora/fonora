import { escapeHtml } from './utils.js';
import { decodeSymbols } from './decode.js';
import { findCellBySymbols } from './rules.js';
import { findVowelForCell, isVowelPhonemeKey } from './vowel-display.js';
import { translateIpaPhrase } from './ipa-pipeline.js';
import { normalizeIpaForComparison } from './pronunciation-validation.js';

const PLACE_IDS = ['lips', 'front_tongue', 'middle_tongue', 'back_tongue', 'throat'];
const MANNER_IDS = ['voice', 'friction', 'nasal', 'glide'];
const LEGEND_IDS = ['vowel', ...PLACE_IDS, ...MANNER_IDS];

function labelForPlace(rules, placeId) {
  return rules.places?.find((p) => p.id === placeId)?.label || placeId;
}

function labelForModifier(rules, modifierId) {
  if (modifierId === 'plain') return 'Plain';
  return rules.modifiers?.find((m) => m.id === modifierId)?.label || modifierId;
}

function labelForRecipeToken(rules, token) {
  if (PLACE_IDS.includes(token)) return labelForPlace(rules, token);
  if (MANNER_IDS.includes(token) || token === 'vowel') return labelForModifier(rules, token);
  return token;
}

function buildSymbolCategoryMap(rules) {
  const map = {};
  for (const place of rules.places || []) {
    if (place.symbol) map[place.symbol] = place.id;
  }
  for (const mod of rules.modifiers || []) {
    if (!mod.symbol) continue;
    map[mod.symbol] = mod.id === 'vowel' ? 'vowel' : mod.id;
  }
  return map;
}

/** Split a Fonora chunk into primary place/modifier glyphs for teaching display. */
export function splitIntoPrimaryGlyphs(symbols, rules) {
  const categoryMap = buildSymbolCategoryMap(rules);
  const primaries = [
    ...(rules.modifiers || []).map((m) => m.symbol),
    ...(rules.places || []).map((p) => p.symbol),
  ].filter(Boolean);
  const patterns = [...new Set(primaries)].sort((a, b) => b.length - a.length);

  const glyphs = [];
  let i = 0;
  while (i < symbols.length) {
    let matched = false;
    for (const sym of patterns) {
      if (symbols.slice(i, i + sym.length) !== sym) continue;
      glyphs.push({ symbol: sym, category: categoryMap[sym] || 'unknown' });
      i += sym.length;
      matched = true;
      break;
    }
    if (matched) continue;
    glyphs.push({ symbol: symbols[i], category: 'unknown' });
    i += 1;
  }
  return glyphs;
}

/** Short learner-facing articulation line (e.g. "voiced lips"). */
export function formatArticulationLabel(chunk) {
  if (chunk.recipe) {
    const parts = chunk.recipe.split(' + ').map((part) => {
      if (part === 'Voice') return 'voiced';
      if (part === 'Plain') return null;
      return part.toLowerCase();
    }).filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return String(chunk.explanation || '')
    .toLowerCase()
    .replace(/\s+sound$/, '')
    .trim();
}

function renderSymbolGlyphs(symbols, rules) {
  const glyphs = splitIntoPrimaryGlyphs(symbols, rules);
  if (glyphs.length <= 1) {
    return `<span class="breakdown-chunk-sym-inner symbol-text">${escapeHtml(symbols)}</span>`;
  }
  return `<span class="breakdown-chunk-sym-inner symbol-text breakdown-chunk-sym--composite">${glyphs
    .map(
      (glyph) =>
        `<span class="breakdown-glyph breakdown-glyph--${escapeHtml(glyph.category)}">${escapeHtml(glyph.symbol)}</span>`,
    )
    .join('<span class="breakdown-glyph-gap" aria-hidden="true"></span>')}</span>`;
}

function parseIpaVariants(ipaField) {
  return String(ipaField || '')
    .replace(/^\/+|\/+$/g, '')
    .split(/[,，]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function resolveChunkIpa(cell, group, sourceNorm) {
  const ipaField = cell?.ipa || group?.ipa || '';
  const variants = parseIpaVariants(ipaField);
  if (!variants.length) return group?.sound || '?';
  const match = variants.find((v) => sourceNorm.includes(normalizeIpaForComparison(v)));
  return match || variants[0];
}

/**
 * Color category for a pronunciation chunk, driven by language-rules.md structure.
 */
export function resolveChunkCategory(rules, cell, group) {
  if (!cell && group?.sound && isVowelPhonemeKey(rules, group.sound)) return 'vowel';

  const vowel = findVowelForCell(rules, cell);
  if (vowel) return 'vowel';

  if (cell?.modifierId && cell?.placeId) {
    return cell.placeId;
  }

  if (cell?.composition) {
    for (const placeId of PLACE_IDS) {
      if (cell.composition.includes(placeId)) return placeId;
    }
    for (const mannerId of MANNER_IDS) {
      if (cell.composition.includes(mannerId)) return mannerId;
    }
  }

  if (group?.sound && isVowelPhonemeKey(rules, group.sound)) return 'vowel';
  return 'unknown';
}

/** Human-readable articulation recipe from rule cell metadata. */
export function formatArticulationRecipe(rules, cell) {
  if (!cell) return '';

  const vowel = findVowelForCell(rules, cell);
  if (vowel?.recipeTokens?.length) {
    return vowel.recipeTokens.map((token) => labelForRecipeToken(rules, token)).join(' + ');
  }

  if (cell.modifierId && cell.placeId) {
    const place = labelForPlace(rules, cell.placeId);
    if (cell.modifierId === 'plain') return place;
    return `${labelForModifier(rules, cell.modifierId)} + ${place}`;
  }

  if (cell.composition) {
    return cell.composition
      .split('_')
      .filter((part) => part !== 'reverse')
      .map((part) => labelForRecipeToken(rules, part))
      .join(' + ');
  }

  return cell.explanation || '';
}

function enrichGroup(group, rules, sourceNorm) {
  const cell = findCellBySymbols(rules, group.symbols);
  const meta = cell || group;
  const category = resolveChunkCategory(rules, cell, group);
  const recipe = formatArticulationRecipe(rules, cell || meta);
  const explanation = meta.explanation || group.explanation || '';

  return {
    sound: group.sound,
    symbols: group.symbols,
    ipa: resolveChunkIpa(cell || meta, group, sourceNorm),
    category,
    label: group.sound,
    recipe,
    explanation: explanation || recipe,
    articulationLabel: formatArticulationLabel({ recipe, explanation: explanation || recipe }),
  };
}

function buildEncodingPath(chunks) {
  return chunks
    .map((chunk) => {
      const ipa = chunk.ipa && chunk.ipa !== chunk.label ? ` (${chunk.ipa})` : '';
      return `${chunk.symbols} → ${chunk.label}${ipa}`;
    })
    .join(' · ');
}

/** Build pronunciation chunks for one IPA pipeline word result. */
export function buildWordBreakdown(wordResult, rules) {
  const decoded = decodeSymbols(wordResult.symbols || '', rules);
  const sourceNorm = normalizeIpaForComparison(wordResult.ipa || '');
  const chunks = decoded.groups.map((group) => enrichGroup(group, rules, sourceNorm));

  return {
    original: wordResult.original || wordResult.input || '',
    ipa: wordResult.ipa || '',
    phonemeKeys: wordResult.normalizedPhonemes || '',
    decoded: wordResult.decoded || wordResult.normalizedPhonemes || '',
    phonemeString: wordResult.phonemeString || '',
    symbols: wordResult.symbols || '',
    chunks,
    encodingPath: buildEncodingPath(chunks),
    warnings: [...(wordResult.warnings || []), ...(decoded.warnings || [])],
  };
}

/** Run the IPA pipeline and segment into teaching chunks. */
export async function analyzeBreakdown(text, rules, lang, pipelineOptions = {}) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const result = await translateIpaPhrase(trimmed, rules, lang, pipelineOptions);
  if (!result) return null;

  return {
    original: result.original,
    lang: result.lang,
    voice: result.voice,
    ipa: result.ipa,
    symbols: result.symbols,
    phonemeKeys: result.normalizedPhonemes,
    decoded: result.decoded,
    words: (result.words || []).map((word) => buildWordBreakdown(word, rules)),
    warnings: result.warnings || [],
  };
}

function renderChunkTip(chunk) {
  return `
    <span class="breakdown-chunk-tip" role="tooltip">
      <span class="breakdown-chunk-tip-row"><strong>Phoneme key</strong> ${escapeHtml(chunk.label)}</span>
      <span class="breakdown-chunk-tip-row"><strong>IPA</strong> <code>${escapeHtml(chunk.ipa)}</code></span>
      <span class="breakdown-chunk-tip-row"><strong>Fonora</strong> <span class="symbol-text">${escapeHtml(chunk.symbols)}</span></span>
      ${chunk.recipe ? `<span class="breakdown-chunk-tip-row"><strong>Recipe</strong> ${escapeHtml(chunk.recipe)}</span>` : ''}
      ${chunk.explanation ? `<span class="breakdown-chunk-tip-row breakdown-chunk-tip-row--explain">${escapeHtml(chunk.explanation)}</span>` : ''}
    </span>`;
}

function renderChunkCard(chunk, wordIndex, chunkIndex, rules) {
  const category = chunk.category || 'unknown';
  const articulation = chunk.articulationLabel || formatArticulationLabel(chunk);
  return `
    <div
      class="breakdown-chunk-card breakdown-chunk-card--${escapeHtml(category)} breakdown-chunk--interactive"
      tabindex="0"
      role="group"
      data-word-index="${wordIndex}"
      data-chunk-index="${chunkIndex}"
      aria-label="${escapeHtml(chunk.label)} → ${escapeHtml(chunk.symbols)}${articulation ? `, ${escapeHtml(articulation)}` : ''}"
    >
      <span class="breakdown-chunk-key">${escapeHtml(chunk.label)}</span>
      ${renderSymbolGlyphs(chunk.symbols, rules)}
      ${articulation ? `<span class="breakdown-chunk-artic">${escapeHtml(articulation)}</span>` : ''}
      ${renderChunkTip(chunk)}
    </div>`;
}

function renderAlignedChunkColumns(chunks, wordIndex, rules) {
  if (!chunks.length) return '<em class="breakdown-empty">-</em>';

  return `
    <div class="breakdown-columns">
      ${chunks.map((chunk, chunkIndex) => `<div class="breakdown-column">${renderChunkCard(chunk, wordIndex, chunkIndex, rules)}</div>`).join('')}
    </div>`;
}

function renderPhonemeKeyColumns(chunks) {
  if (!chunks.length) return '';
  return `
    <div class="breakdown-columns breakdown-columns--keys">
      ${chunks.map((chunk) => `<div class="breakdown-column"><span class="breakdown-phoneme-key">${escapeHtml(chunk.label)}</span></div>`).join('')}
    </div>`;
}

function renderCombinedInteractive(word, wordIndex, rules) {
  if (!word.chunks?.length) {
    return `<div class="breakdown-combined symbol-text">${escapeHtml(word.symbols || '-')}</div>`;
  }
  return `
    <div class="breakdown-combined breakdown-combined--interactive symbol-text" role="group" aria-label="Combined Fonora for ${escapeHtml(word.original || 'word')}">
      ${word.chunks
        .map(
          (chunk, chunkIndex) => `
        <span
          class="breakdown-combined-chunk breakdown-chunk--interactive"
          data-word-index="${wordIndex}"
          data-chunk-index="${chunkIndex}"
          tabindex="0"
          role="button"
          aria-label="${escapeHtml(chunk.label)}: ${escapeHtml(chunk.symbols)}"
        >${renderSymbolGlyphs(chunk.symbols, rules)}</span>`,
        )
        .join('')}
    </div>`;
}

function renderWordBreakdown(word, wordIndex, rules) {
  const sourceWord = word.original || '';
  const chunkCount = word.chunks?.length || 0;
  return `
    <article
      class="breakdown-word"
      data-breakdown-word
      data-word-index="${wordIndex}"
      data-chunk-count="${chunkCount}"
    >
      <header class="breakdown-word-header">
        <h3 class="breakdown-word-source">${escapeHtml(sourceWord)}</h3>
      </header>

      <div class="breakdown-learn-flow">
        <div class="breakdown-step">
          <span class="breakdown-step-label">Pronunciation</span>
          ${renderPhonemeKeyColumns(word.chunks)}
        </div>

        <div class="breakdown-step">
          <span class="breakdown-step-label">Sound → symbol</span>
          ${renderAlignedChunkColumns(word.chunks, wordIndex, rules)}
        </div>

        <div class="breakdown-step breakdown-step--combined">
          <span class="breakdown-step-label">Combined Fonora</span>
          ${renderCombinedInteractive(word, wordIndex, rules)}
        </div>
      </div>
    </article>`;
}

function renderTechRow(label, value, { mono = false } = {}) {
  if (!value) return '';
  const valueClass = mono ? 'breakdown-tech-value breakdown-tech-value--mono' : 'breakdown-tech-value';
  return `
    <div class="breakdown-tech-row">
      <span class="breakdown-tech-label">${escapeHtml(label)}</span>
      <span class="${valueClass}">${value}</span>
    </div>`;
}

function renderTechnicalDetails(analysis) {
  const wordSections = (analysis.words || [])
    .map((word) => {
      const title = escapeHtml(word.original || '-');
      let html = `<div class="breakdown-tech-word"><strong>${title}</strong>`;
      html += renderTechRow('Original IPA', word.ipa ? `<code>${escapeHtml(word.ipa)}</code>` : '');
      html += renderTechRow(
        'Normalized phoneme keys',
        word.phonemeKeys ? `<code>${escapeHtml(word.phonemeKeys)}</code>` : '',
      );
      html += renderTechRow('Recovered decode', word.decoded ? `<code>${escapeHtml(word.decoded)}</code>` : '');
      html += renderTechRow('Encoding path', word.encodingPath ? escapeHtml(word.encodingPath) : '');
      if (word.warnings?.length) {
        html += renderTechRow(
          'Warnings',
          word.warnings.map((w) => escapeHtml(w)).join('<br>'),
        );
      }
      html += '</div>';
      return html;
    })
    .join('');

  let html = '<details class="breakdown-tech">';
  html += '<summary class="breakdown-tech-summary">Show Technical Details</summary>';
  html += '<div class="breakdown-tech-body">';

  if (analysis.words?.length > 1) {
    html += renderTechRow('Original text', escapeHtml(analysis.original));
    html += renderTechRow('Combined IPA', analysis.ipa ? `<code>${escapeHtml(analysis.ipa)}</code>` : '');
    html += renderTechRow(
      'Combined phoneme keys',
      analysis.phonemeKeys ? `<code>${escapeHtml(analysis.phonemeKeys)}</code>` : '',
    );
    html += renderTechRow('eSpeak voice', analysis.voice ? `<code>${escapeHtml(analysis.voice)}</code>` : '');
    html += renderTechRow('Language', analysis.lang ? escapeHtml(analysis.lang) : '');
  }

  html += wordSections;

  if (analysis.warnings?.length) {
    html += renderTechRow(
      'Pipeline warnings',
      analysis.warnings.map((w) => escapeHtml(w)).join('<br>'),
    );
  }

  html += '</div></details>';
  return html;
}

export function renderBreakdownHtml(analysis, rules) {
  if (!analysis) {
    return '<p class="breakdown-placeholder">Enter text and click Analyze to see how spoken sounds become Fonora symbols.</p>';
  }

  let html = '<div class="breakdown-results">';

  if (analysis.words?.length > 1) {
    html += `
      <header class="breakdown-phrase-header">
        <span class="breakdown-step-label">Original text</span>
        <p class="breakdown-phrase-text">${escapeHtml(analysis.original)}</p>
      </header>`;
  }

  html += analysis.words.map((word, wordIndex) => renderWordBreakdown(word, wordIndex, rules)).join('');
  html += renderTechnicalDetails(analysis);

  if (analysis.warnings?.length) {
    html += `<div class="breakdown-warnings" role="status">${analysis.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>`;
  }

  html += '</div>';
  return html;
}

function symbolForLegendId(rules, id) {
  if (id === 'vowel') {
    return rules.modifiers?.find((m) => m.id === 'vowel')?.symbol || '⚬';
  }
  if (PLACE_IDS.includes(id)) {
    return rules.places?.find((p) => p.id === id)?.symbol || '?';
  }
  return rules.modifiers?.find((m) => m.id === id)?.symbol || '?';
}

function labelForLegendId(rules, id) {
  if (id === 'vowel') {
    return rules.modifiers?.find((m) => m.id === 'vowel')?.label || 'Vowel';
  }
  if (PLACE_IDS.includes(id)) {
    return labelForPlace(rules, id);
  }
  return labelForModifier(rules, id);
}

/** Symbol-based legend entries from language-rules.md primaries. */
export function buildBreakdownLegend(rules) {
  return LEGEND_IDS.map((id) => ({
    id,
    symbol: symbolForLegendId(rules, id),
    label: labelForLegendId(rules, id),
  }));
}

export function renderBreakdownLegendHtml(rules) {
  const items = buildBreakdownLegend(rules);
  return items
    .map(
      (item) =>
        `<span class="breakdown-legend-item breakdown-legend-item--${escapeHtml(item.id)}"><span class="breakdown-legend-symbol symbol-text" aria-hidden="true">${escapeHtml(item.symbol)}</span><span class="breakdown-legend-label">${escapeHtml(item.label)}</span></span>`,
    )
    .join('');
}
