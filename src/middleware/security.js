'use strict';

/**
 * Security headers + a small in-memory rate limiter.
 * No auth is built in: this is a single-user local app. Run it on localhost
 * or behind a reverse proxy with authentication if you expose it.
 */
const config = require('../config');

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

/** Fixed-window rate limit per IP. Returns 429 when exceeded. */
function rateLimiter() {
  const hits = new Map(); // ip -> { count, windowStart }
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    let entry = hits.get(ip);
    if (!entry || now - entry.windowStart >= config.rateLimitWindowMs) {
      entry = { count: 0, windowStart: now };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > config.rateLimitMax) {
      return res.status(429).json({ error: { message: 'Too many requests. Please try again later.' } });
    }
    return next();
  };
}

module.exports = { securityHeaders, rateLimiter };
