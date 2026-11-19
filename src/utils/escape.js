'use strict';

/**
 * Output-encoding helpers. The frontend renders user data with textContent
 * (see public/js/ui.js) and never injects it via innerHTML; these helpers
 * cover the few places a string must be escaped (CSV export, invoice text).
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape one CSV field per RFC 4180 (quote when it contains , " or newline). */
function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Keep only digits from a phone number (for wa.me links). */
function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

module.exports = { escapeHtml, escapeCsv, digitsOnly };
