'use strict';

/**
 * Database schema (migrations run in order on startup).
 *
 * Money is stored as INTEGER paisa (PKR x 100) - never floats - so
 * Rs 250.50 is stored as 25050 and all arithmetic is exact.
 *
 * people.is_self = 1 marks the ledger owner's own record ("Me").
 * A split means: person_id owes the expense's payer amount_paisa.
 * A settlement direction 'in'  = the person paid ME (reduces what they owe).
 * A settlement direction 'out' = I paid the person (reduces what I owe them).
 */
const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    notes TEXT,
    is_self INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    payer_id INTEGER NOT NULL REFERENCES people(id),
    expense_date TEXT NOT NULL,
    notes TEXT,
    recurring_id INTEGER REFERENCES recurring_expenses(id),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id),
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    due_date TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES people(id),
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    method TEXT NOT NULL DEFAULT 'cash',
    settlement_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    month TEXT NOT NULL,
    limit_paisa INTEGER NOT NULL CHECK (limit_paisa > 0),
    created_at TEXT NOT NULL,
    UNIQUE (category, month)
  );
  CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    payer_id INTEGER NOT NULL REFERENCES people(id),
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
    day_of_month INTEGER,
    day_of_week INTEGER,
    split_person_ids TEXT NOT NULL DEFAULT '[]',
    next_due_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
  CREATE INDEX IF NOT EXISTS idx_splits_person ON splits(person_id);
  CREATE INDEX IF NOT EXISTS idx_splits_due ON splits(due_date);
  CREATE INDEX IF NOT EXISTS idx_settlements_person ON settlements(person_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
  `,
];

function runMigrations(db) {
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
  // Seed the ledger owner's own record exactly once.
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM people WHERE is_self = 1 LIMIT 1').get();
  if (!existing) {
    db.prepare(
      'INSERT INTO people (name, phone, email, notes, is_self, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    ).run('Me', null, null, 'Ledger owner', now, now);
  }
}

module.exports = { runMigrations, MIGRATIONS };
