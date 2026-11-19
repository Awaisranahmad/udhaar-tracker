'use strict';

/** Application error with an HTTP status. Messages are safe to show clients. */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

function badRequest(message, details) {
  return new AppError(400, message, details);
}

function notFound(message) {
  return new AppError(404, message || 'Not found.');
}

function conflict(message) {
  return new AppError(409, message);
}

module.exports = { AppError, badRequest, notFound, conflict };
