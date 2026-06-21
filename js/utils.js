export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.selectionStart = pos;
  textarea.selectionEnd = pos;
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function deleteSymbolBeforeCursor(textarea) {
  const pos = textarea.selectionStart;
  if (pos === 0 || textarea.selectionStart !== textarea.selectionEnd) return;
  const chars = [...textarea.value.slice(0, pos)];
  if (chars.length === 0) return;
  chars.pop();
  textarea.value = chars.join('') + textarea.value.slice(pos);
  const newPos = chars.join('').length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
