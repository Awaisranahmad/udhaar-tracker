'use strict';

/**
 * Input validation. Every endpoint validates ALL inputs before touching the
 * database: types, ranges and lengths. A validation failure returns 400 with
 * a list of per-field messages - never a stack trace.
 */
const { isValidMoneyInput } = require('../utils/money');
const { isValidDateString, isValidMonthString } = require('../utils/dates');
const { badRequest } = require('../utils/errors');

const CATEGORIES = [
  'food',
  'transport',
  'rent',
  'utilities',
  'groceries',
  'entertainment',
  'health',
  'education',
  'shopping',
  'other',
];

const SETTLEMENT_METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'other'];

const MAX_NAME_LEN = 100;
const MAX_TEXT_LEN = 500;
const MAX_PHONE_LEN = 20;
const MAX_EMAIL_LEN = 120;

function isNonEmptyString(value, maxLen) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLen;
}

function isOptionalString(value, maxLen) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLen);
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function isIdParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && String(n) === String(value).trim();
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isValidPhone(value) {
  return typeof value === 'string' && /^[+\d][\d\s-]{6,19}$/.test(value);
}

/**
 * Validate req.body against a schema of { field: validator(value) -> error string | null }.
 * Unknown extra fields are ignored (never trusted). On failure throws 400.
 * Returns a cleaned object containing only the schema fields that were present.
 */
function validateBody(schema) {
  return (req, _res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return next(badRequest('Request body must be a JSON object.'));
    }
    const errors = [];
    const clean = {};
    for (const [field, validator] of Object.entries(schema)) {
      const err = validator(body[field], body);
      if (err) errors.push({ field, message: err });
      else if (body[field] !== undefined) clean[field] = body[field];
    }
    if (errors.length > 0) return next(badRequest('Validation failed.', errors));
    req.validated = clean;
    return next();
  };
}

/** Validate a numeric :id route param. */
function validateIdParam(req, _res, next) {
  if (!isIdParam(req.params.id)) return next(badRequest('Invalid id: must be a positive integer.'));
  req.params.id = Number(req.params.id);
  return next();
}

// ---- Field validators (each returns an error string, or null when valid) ----
const v = {
  requiredString: (maxLen) => (value) =>
    isNonEmptyString(value, maxLen) ? null : `Must be a non-empty string up to ${maxLen} characters.`,
  optionalString: (maxLen) => (value) =>
    isOptionalString(value, maxLen) ? null : `Must be a string up to ${maxLen} characters.`,
  optionalPhone: (value) =>
    value === undefined || value === null || value === ''
      ? null
      : isValidPhone(value)
        ? null
        : 'Must be a valid phone number.',
  optionalEmail: (value) =>
    value === undefined || value === null || value === ''
      ? null
      : isValidEmail(value) && value.length <= MAX_EMAIL_LEN
        ? null
        : 'Must be a valid email address.',
  money: (value) => (isValidMoneyInput(value) ? null : 'Must be a positive amount in PKR (max 2 decimals, max Rs 10,000,000).'),
  optionalMoney: (value) =>
    value === undefined || value === null ? null : isValidMoneyInput(value) ? null : 'Must be a positive amount in PKR (max 2 decimals).',
  date: (value) => (isValidDateString(value) ? null : 'Must be a valid date in YYYY-MM-DD format.'),
  optionalDate: (value) =>
    value === undefined || value === null || value === ''
      ? null
      : isValidDateString(value)
        ? null
        : 'Must be a valid date in YYYY-MM-DD format.',
  month: (value) => (isValidMonthString(value) ? null : 'Must be a valid month in YYYY-MM format.'),
  category: (value) =>
    CATEGORIES.includes(value) ? null : `Must be one of: ${CATEGORIES.join(', ')}.`,
  enum: (allowed) => (value) =>
    allowed.includes(value) ? null : `Must be one of: ${allowed.join(', ')}.`,
  personId: (value) => (isPositiveInt(value) ? null : 'Must be a positive integer person id.'),
  idArray: (value) =>
    Array.isArray(value) && value.length <= 50 && value.every(isPositiveInt)
      ? null
      : 'Must be an array of positive integer ids (max 50).',
  /** Splits: [{ person_id, amount }] or [{ person_id }] for equal split. */
  splits: (value) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
      return 'Splits must be a non-empty array (max 50 entries).';
    }
    const seen = new Set();
    for (const s of value) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return 'Each split must be an object.';
      if (!isPositiveInt(s.person_id)) return 'Each split needs a positive integer person_id.';
      if (seen.has(s.person_id)) return 'Duplicate person_id in splits.';
      seen.add(s.person_id);
      if (s.amount !== undefined && s.amount !== null && !isValidMoneyInput(s.amount)) {
        return 'Each split amount must be a positive PKR amount (max 2 decimals).';
      }
    }
    return null;
  },
};

module.exports = {
  validateBody,
  validateIdParam,
  v,
  CATEGORIES,
  SETTLEMENT_METHODS,
  MAX_NAME_LEN,
  MAX_TEXT_LEN,
  MAX_PHONE_LEN,
  MAX_EMAIL_LEN,
  isIdParam,
  isPositiveInt,
  isNonEmptyString,
};
