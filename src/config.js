'use strict';

/**
 * Central configuration. All values come from the environment with safe
 * defaults. No secrets are stored here or anywhere in the codebase.
 */
const path = require('node:path');

const config = {
  port: Number.parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  // SQLite file. Defaults to ./data/udhaar.db next to the project root.
  // Set DB_PATH=:memory: for tests / ephemeral runs.
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'udhaar.db'),
  nodeEnv: process.env.NODE_ENV || 'development',
  // JSON body size cap - small payloads only, rejects oversized bodies.
  jsonLimit: '100kb',
  // Simple in-memory rate limit: max requests per window per IP.
  rateLimitWindowMs: 15 * 60 * 1000,
  rateLimitMax: 600,
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('Invalid PORT: must be an integer between 1 and 65535.');
}

module.exports = config;
