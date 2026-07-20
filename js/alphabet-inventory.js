import { escapeHtml } from './utils.js';
import { buildPhonemeInventory } from './rules.js';

const ORDER_STORAGE_KEY = 'fonora.alphabet-inventory-order';

/** @returns {'articulatory' | 'alphabetical'} */
export function getAlphabetInventoryOrder() {
  const stored = localStorage.getItem(ORDER_STORAGE_KEY);
  return stored === 'alphabetical' ? 'alphabetical' : 'articulatory';
}

function renderInventoryRows(rows) {
  return rows
    .map(
      (row) => `
      <tr class="${row.reserved ? 'alphabet-inventory-row--reserved' : ''}">
        <td class="alphabet-inventory-key${row.key === 'N/A' ? ' alphabet-inventory-key--na' : ''}">${escapeHtml(row.key)}</td>
        <td class="symbol-text alphabet-inventory-symbol">${escapeHtml(row.symbols)}</td>
        <td class="ipa-text${row.ipa === 'N/A' ? ' alphabet-inventory-ipa--na' : ''}">${escapeHtml(row.ipa)}</td>
        <td class="alphabet-inventory-notes">${escapeHtml(row.notes)}</td>
      </tr>`,
    )
    .join('');
}

/**
 * Populate the read-only Alphabet inventory tables from the active rules.
 * @param {object} rules
 * @param {{ order?: 'articulatory' | 'alphabetical' }} [options]
 */
export function renderAlphabetInventory(rules, options = {}) {
  const consonantsBody = document.getElementById('alphabet-inventory-consonants');
  const derivedBody = document.getElementById('alphabet-inventory-derived');
  const vowelsBody = document.getElementById('alphabet-inventory-vowels');
  const reservedBody = document.getElementById('alphabet-inventory-reserved');
  const reservedSection = document.getElementById('alphabet-inventory-reserved-section');
  if (!consonantsBody && !derivedBody && !vowelsBody) return;

  const order = options.order || getAlphabetInventoryOrder();
  const { consonants, derived, vowels, reserved } = buildPhonemeInventory(rules, { order });
  if (consonantsBody) consonantsBody.innerHTML = renderInventoryRows(consonants);
  if (derivedBody) derivedBody.innerHTML = renderInventoryRows(derived);
  if (vowelsBody) vowelsBody.innerHTML = renderInventoryRows(vowels);

  if (reservedSection && reservedBody) {
    if (reserved.length) {
      reservedSection.hidden = false;
      reservedBody.innerHTML = renderInventoryRows(reserved);
    } else {
      reservedSection.hidden = true;
      reservedBody.innerHTML = '';
    }
  }
}

/** Wire the Alphabet sort toggle and persist the user's choice. */
export function setupAlphabetInventoryOrderToggle(rules) {
  const group = document.getElementById('alphabet-inventory-order');
  if (!group) return;

  const order = getAlphabetInventoryOrder();
  const selected = group.querySelector(`input[value="${order}"]`);
  if (selected) selected.checked = true;

  group.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'alphabet-inventory-order') return;
    localStorage.setItem(ORDER_STORAGE_KEY, input.value);
    renderAlphabetInventory(rules, { order: input.value });
  });
}
