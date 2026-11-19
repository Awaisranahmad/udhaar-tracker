'use strict';

/**
 * Money helpers. All money in the system is integer paisa (1 PKR = 100 paisa)
 * so arithmetic is exact. The API accepts PKR as a decimal number with at
 * most 2 decimal places and converts it here.
 */

const MAX_PKR = 10000000; // Rs 1 crore - sanity cap per single amount.

function isValidMoneyInput(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value <= 0 || value > MAX_PKR) return false;
  // At most 2 decimal places (paisa precision).
  return Math.round(value * 100) === value * 100;
}

function toPaisa(pkr) {
  return Math.round(pkr * 100);
}

function toPkr(paisa) {
  return paisa / 100;
}

function formatPkr(paisa) {
  const value = typeof paisa === 'number' ? paisa : 0;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const rupees = Math.floor(abs / 100);
  const ps = abs % 100;
  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}Rs ${grouped}.${String(ps).padStart(2, '0')}`;
}

module.exports = { isValidMoneyInput, toPaisa, toPkr, formatPkr, MAX_PKR };
