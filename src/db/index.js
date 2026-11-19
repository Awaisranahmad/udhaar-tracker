'use strict';

/**
 * SQLite setup using Node's built-in node:sqlite (no native add-on needed).
 * All queries in this project use prepared statements with bound parameters -
 * never string-concatenated SQL.
 *
 * Connections are cached per file path; every ':memory:' request gets a fresh
 * database so tests stay isolated.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('./migrations');

const connections = new Map();
let memoryCounter = 0;

function getDb(dbPath) {
  const key = dbPath === ':memory:' ? `:memory:${memoryCounter++}` : dbPath;
  if (connections.has(key)) return connections.get(key);
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  // Enforce foreign keys and use WAL for durability.
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  runMigrations(db);
  connections.set(key, db);
  return db;
}

function closeDb() {
  for (const db of connections.values()) {
    try {
      db.close();
    } catch {
      // Ignore already-closed connections during shutdown.
    }
  }
  connections.clear();
}

module.exports = { getDb, closeDb };
