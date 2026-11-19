'use strict';

/**
 * Central error handling. Clients only ever receive a safe JSON error:
 * { error: { message, details? } }. Stack traces and internals are logged
 * server-side only, never sent to the client.
 */
const { AppError } = require('../utils/errors');

function notFoundHandler(_req, res) {
  res.status(404).json({ error: { message: 'Not found.' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Invalid JSON in request body.' } });
  }
  // Unknown error: log it, send a generic message.
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error.' } });
}

module.exports = { notFoundHandler, errorHandler };
