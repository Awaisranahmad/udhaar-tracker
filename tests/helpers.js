'use strict';

/** Shared test helpers: spin up the app on an ephemeral port with a fresh in-memory DB. */
const { createApp } = require('../src/app');
const { closeDb } = require('../src/db');

async function startServer() {
  const app = createApp(':memory:');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => {
          closeDb();
          resolve();
        });
      }),
  };
}

async function req(base, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

/** Create two contacts and return { self, ali, bilal } (full person objects). */
async function seedPeople(base) {
  const list = await req(base, 'GET', '/api/people');
  const self = list.json.people.find((p) => p.is_self);
  const ali = (await req(base, 'POST', '/api/people', { name: 'Ali', phone: '03001112222' })).json.person;
  const bilal = (await req(base, 'POST', '/api/people', { name: 'Bilal', phone: '03003334444' })).json.person;
  return { self, ali, bilal };
}

module.exports = { startServer, req, seedPeople };
