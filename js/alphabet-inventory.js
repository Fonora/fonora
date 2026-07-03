import { escapeHtml } from './utils.js';
import { buildPhonemeInventory } from './rules.js';

function renderInventoryRows(rows) {
  return rows
    .map(
      (row) => `
      <tr>
        <td class="alphabet-inventory-key">${escapeHtml(row.key)}</td>
        <td class="symbol-text alphabet-inventory-symbol">${escapeHtml(row.symbols)}</td>
        <td>${escapeHtml(row.ipa)}</td>
        <td class="alphabet-inventory-notes">${escapeHtml(row.notes)}</td>
      </tr>`,
    )
    .join('');
}

/**
 * Populate the read-only Alphabet inventory tables from the active rules.
 * @param {object} rules
 */
export function renderAlphabetInventory(rules) {
  const consonantsBody = document.getElementById('alphabet-inventory-consonants');
  const derivedBody = document.getElementById('alphabet-inventory-derived');
  const vowelsBody = document.getElementById('alphabet-inventory-vowels');
  if (!consonantsBody && !derivedBody && !vowelsBody) return;

  const { consonants, derived, vowels } = buildPhonemeInventory(rules);
  if (consonantsBody) consonantsBody.innerHTML = renderInventoryRows(consonants);
  if (derivedBody) derivedBody.innerHTML = renderInventoryRows(derived);
  if (vowelsBody) vowelsBody.innerHTML = renderInventoryRows(vowels);
}
