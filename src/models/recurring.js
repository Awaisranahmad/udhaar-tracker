'use strict';

/** Recurring expenses data access. */
const { toPaisa } = require('../utils/money');

function createRecurringModel(db) {
  return {
    getById(id) {
      const row = db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id) || null;
      if (row) row.split_person_ids = JSON.parse(row.split_person_ids || '[]');
      return row;
    },

    list({ active } = {}) {
      const rows =
        active === undefined
          ? db.prepare('SELECT * FROM recurring_expenses ORDER BY next_due_date ASC').all()
          : db.prepare('SELECT * FROM recurring_expenses WHERE active = ? ORDER BY next_due_date ASC').all(active ? 1 : 0);
      for (const r of rows) r.split_person_ids = JSON.parse(r.split_person_ids || '[]');
      return rows;
    },

    /** Active templates whose next due date has arrived (<= today). */
    listDue(today) {
      const rows = db
        .prepare('SELECT * FROM recurring_expenses WHERE active = 1 AND next_due_date <= ? ORDER BY next_due_date ASC')
        .all(today);
      for (const r of rows) r.split_person_ids = JSON.parse(r.split_person_ids || '[]');
      return rows;
    },

    create({ title, category, amountPkr, payerId, frequency, dayOfMonth, dayOfWeek, splitPersonIds, nextDueDate }) {
      const now = new Date().toISOString();
      const info = db
        .prepare(
          `INSERT INTO recurring_expenses
           (title, category, amount_paisa, payer_id, frequency, day_of_month, day_of_week, split_person_ids, next_due_date, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .run(
          title.trim(), category, toPaisa(amountPkr), payerId, frequency,
          dayOfMonth || null, dayOfWeek || null,
          JSON.stringify(splitPersonIds || []), nextDueDate, now
        );
      return this.getById(Number(info.lastInsertRowid));
    },

    update(id, fields) {
      const allowed = ['title', 'category', 'amount_paisa', 'payer_id', 'frequency', 'day_of_month', 'day_of_week', 'split_person_ids', 'next_due_date', 'active'];
      const sets = [];
      const params = [];
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          sets.push(`${key} = ?`);
          params.push(fields[key]);
        }
      }
      if (sets.length === 0) return this.getById(id);
      params.push(id);
      db.prepare(`UPDATE recurring_expenses SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return this.getById(id);
    },

    delete(id) {
      return db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id).changes > 0;
    },
  };
}

module.exports = { createRecurringModel };
