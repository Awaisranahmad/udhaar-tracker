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
  // At most 2 decimal places (paisa precision). Binary floating point makes
  // an exact check fail for valid amounts: 19.99 * 100 is 1998.9999999999998,
  // not 1999. Compare against the nearest whole paisa with a tiny epsilon
  // so real 2-decimal amounts pass while 3-decimal ones (e.g. 10.005,
  // which is ~0.5 paisa off) still fail.
  const paisa = value * 100;
  if (Math.abs(paisa - Math.round(paisa)) > 1e-6) return false;
  // Must convert to at least 1 paisa (guards sub-paisa values like 0.0000001).
  return Math.round(paisa) >= 1;
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
