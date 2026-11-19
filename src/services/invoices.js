'use strict';

/**
 * Itemised invoice generation + WhatsApp share link.
 * The invoice text is plain text (no HTML), so there is nothing to escape;
 * the wa.me URL is built with encodeURIComponent.
 */
const { formatPkr } = require('../utils/money');
const { digitsOnly } = require('../utils/escape');

function buildInvoiceText({ person, splits, balance, today }) {
  const lines = [];
  lines.push(`Udhaar Hisab - ${person.name}`);
  lines.push(`Date: ${today}`);
  lines.push('------------------------------');
  if (splits.length === 0) {
    lines.push('No outstanding udhaar.');
  } else {
    for (const s of splits) {
      const label = s.title || s.category;
      const due = s.due_date ? ` (due ${s.due_date})` : '';
      lines.push(`- ${label} | ${s.expense_date}${due}: ${formatPkr(s.amount_paisa)}`);
    }
  }
  lines.push('------------------------------');
  lines.push(`Total owed to me: ${formatPkr(balance.outstandingOwedToMe)}`);
  lines.push(`Total I owe: ${formatPkr(balance.outstandingIOwe)}`);
  const net = balance.net;
  if (net > 0) lines.push(`Balance: ${person.name} owes me ${formatPkr(net)}`);
  else if (net < 0) lines.push(`Balance: I owe ${person.name} ${formatPkr(-net)}`);
  else lines.push('Balance: Settled. Nothing outstanding.');
  lines.push('');
  lines.push('Shared from Udhaar Tracker.');
  return lines.join('\n');
}

function whatsappUrl(phone, text) {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

module.exports = { buildInvoiceText, whatsappUrl };
