'use strict';

/**
 * Minimal fetch wrapper for the Udhaar Tracker API.
 * Throws an Error with the server's safe message on non-2xx responses.
 */
const api = (() => {
  async function request(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data && data.error && data.error.message) || `Request failed (${res.status}).`;
      const err = new Error(message);
      err.details = data && data.error && data.error.details;
      throw err;
    }
    return data;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
    del: (path) => request(path, { method: 'DELETE' }),
  };
})();
