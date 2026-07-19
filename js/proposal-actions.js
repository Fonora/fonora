/**
 * Shared compound-proposal accept / reject / skip actions.
 */

/**
 * @param {object} opts
 * @param {(path: string, init?: object) => Promise<object>} opts.api
 * @param {string} opts.proposalId
 * @param {'accepted'|'rejected'|'skipped'} opts.action
 * @param {number} [opts.chosenCompositionIndex]
 */
export async function patchCompoundProposal({
  api,
  proposalId,
  action,
  chosenCompositionIndex = 0,
}) {
  const body = { action };
  if (action === 'accepted') {
    body.chosen_composition_index = chosenCompositionIndex;
  }
  return api(`/api/fonoran/compound-proposals/${encodeURIComponent(proposalId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * @param {HTMLElement} container
 */
export function getSelectedCompositionIndex(container) {
  const selected = container?.querySelector('input[name="gw-composition"]:checked');
  if (!selected) return 0;
  const idx = Number(selected.value);
  return Number.isFinite(idx) ? idx : 0;
}
