'use strict';

/** Monthly budgets per category. */
const { toPaisa } = require('../utils/money');

function createBudgetsModel(db) {
  return {
    getById(id) {
      return db.prepare('SELECT * FROM budgets WHERE id = ?').get(id) || null;
    },

    list(month) {
      if (month) return db.prepare('SELECT * FROM budgets WHERE month = ? ORDER BY category ASC').all(month);
      return db.prepare('SELECT * FROM budgets ORDER BY month DESC, category ASC').all();
    },

    get(category, month) {
      return db.prepare('SELECT * FROM budgets WHERE category = ? AND month = ?').get(category, month) || null;
    },

    /** Upsert: one budget per (category, month). */
    upsert({ category, month, limitPkr }) {
      const now = new Date().toISOString();
      const limitPaisa = toPaisa(limitPkr);
      const existing = this.get(category, month);
      if (existing) {
        db.prepare('UPDATE budgets SET limit_paisa = ? WHERE id = ?').run(limitPaisa, existing.id);
        return this.getById(existing.id);
      }
      const info = db
        .prepare('INSERT INTO budgets (category, month, limit_paisa, created_at) VALUES (?, ?, ?, ?)')
        .run(category, month, limitPaisa, now);
      return this.getById(Number(info.lastInsertRowid));
    },

    delete(id) {
      return db.prepare('DELETE FROM budgets WHERE id = ?').run(id).changes > 0;
    },
  };
}

module.exports = { createBudgetsModel };
