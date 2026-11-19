'use strict';

/**
 * Expenses + splits (udhaar entries) data access.
 *
 * An expense is paid by one payer. Each split says one person owes the payer
 * a share of it. Splits against the payer themselves are ignored (you cannot
 * owe yourself). When splits carry no explicit amounts, the expense is split
 * equally and any paisa remainder goes to the first split so totals match
 * exactly.
 */
const { toPaisa } = require('../utils/money');
const { badRequest } = require('../utils/errors');

function createExpensesModel(db) {
  const insertExpense = db.prepare(
    'INSERT INTO expenses (title, category, amount_paisa, payer_id, expense_date, notes, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertSplit = db.prepare(
    'INSERT INTO splits (expense_id, person_id, amount_paisa, due_date, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  /** Split `totalPaisa` equally across n people; remainder paisa to the first. */
  function equalSplitAmounts(totalPaisa, n) {
    const base = Math.floor(totalPaisa / n);
    const remainder = totalPaisa - base * n;
    return Array.from({ length: n }, (_, i) => base + (i === 0 ? remainder : 0));
  }

  return {
    equalSplitAmounts,

    getById(id) {
      const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
      if (!expense) return null;
      expense.splits = db.prepare('SELECT * FROM splits WHERE expense_id = ? ORDER BY id ASC').all(id);
      return expense;
    },

    /**
     * List expenses with filters. All filters are optional and bound as
     * parameters. `search` matches title/notes, `personId` matches payer or
     * any split participant.
     */
    list({ search, category, from, to, personId, limit = 100, offset = 0 } = {}) {
      const conditions = [];
      const params = [];
      if (search) {
        conditions.push('(e.title LIKE ? COLLATE NOCASE OR e.notes LIKE ? COLLATE NOCASE)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (category) {
        conditions.push('e.category = ?');
        params.push(category);
      }
      if (from) {
        conditions.push('e.expense_date >= ?');
        params.push(from);
      }
      if (to) {
        conditions.push('e.expense_date <= ?');
        params.push(to);
      }
      if (personId) {
        conditions.push('(e.payer_id = ? OR EXISTS (SELECT 1 FROM splits s WHERE s.expense_id = e.id AND s.person_id = ?))');
        params.push(personId, personId);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(
          `SELECT e.*, p.name AS payer_name FROM expenses e
           JOIN people p ON p.id = e.payer_id ${where}
           ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM expenses e ${where}`).get(...params).n;
      return { rows, total };
    },

    /**
     * Create an expense with its splits in one transaction.
     * `splits`: [{ person_id, amount? (PKR) , due_date? }] - amounts optional
     * (equal split). `dueDate` applies to splits that do not set their own.
     */
    create({ title, category, amountPkr, payerId, expenseDate, notes, splits, dueDate, recurringId }) {
      const totalPaisa = toPaisa(amountPkr);
      const now = new Date().toISOString();
      const withAmounts = splits.map((s) => ({
        person_id: s.person_id,
        amount_paisa: s.amount !== undefined && s.amount !== null ? toPaisa(s.amount) : null,
        due_date: s.due_date || dueDate || null,
      }));
      const explicit = withAmounts.reduce((sum, s) => sum + (s.amount_paisa || 0), 0);
      const unspecified = withAmounts.filter((s) => s.amount_paisa === null);
      if (explicit > totalPaisa) {
        throw badRequest('Split amounts exceed the expense total.');
      }
      if (unspecified.length > 0) {
        const rest = totalPaisa - explicit;
        const shares = equalSplitAmounts(rest, unspecified.length);
        unspecified.forEach((s, i) => {
          s.amount_paisa = shares[i];
        });
      } else if (explicit !== totalPaisa) {
        throw badRequest('Split amounts must add up to the expense total.');
      }

      // node:sqlite has no .transaction() helper, so manage the transaction
      // explicitly: BEGIN / COMMIT, with ROLLBACK on any failure.
      let expenseId;
      db.exec('BEGIN');
      try {
        const info = insertExpense.run(
          title.trim(), category, totalPaisa, payerId, expenseDate, notes || null, recurringId || null, now
        );
        expenseId = Number(info.lastInsertRowid);
        for (const s of withAmounts) {
          if (s.person_id === payerId) continue; // payer's own share is not udhaar
          insertSplit.run(expenseId, s.person_id, s.amount_paisa, s.due_date, now);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return this.getById(expenseId);
    },

    delete(id) {
      const info = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
      return info.changes > 0;
    },

    /** All splits with expense + payer context (used by balances/dashboard). */
    listSplits() {
      return db
        .prepare(
          `SELECT s.*, e.title, e.category, e.expense_date, e.payer_id
           FROM splits s JOIN expenses e ON e.id = s.expense_id
           ORDER BY e.expense_date ASC, s.id ASC`
        )
        .all();
    },

    /** Outstanding splits for one person (optionally only where they owe the payer). */
    listSplitsForPerson(personId) {
      return db
        .prepare(
          `SELECT s.*, e.title, e.category, e.expense_date, e.payer_id
           FROM splits s JOIN expenses e ON e.id = s.expense_id
           WHERE s.person_id = ? ORDER BY e.expense_date ASC, s.id ASC`
        )
        .all(personId);
    },

    /** Splits whose due date has passed or falls within `days` (overdue + upcoming). */
    listDueSplits({ today, withinDays }) {
      const horizon = new Date(`${today}T00:00:00Z`);
      horizon.setUTCDate(horizon.getUTCDate() + withinDays);
      const horizonStr = horizon.toISOString().slice(0, 10);
      return db
        .prepare(
          `SELECT s.*, e.title, e.category, e.expense_date, e.payer_id, p.name AS person_name
           FROM splits s
           JOIN expenses e ON e.id = s.expense_id
           JOIN people p ON p.id = s.person_id
           WHERE s.due_date IS NOT NULL AND s.due_date <= ?
           ORDER BY s.due_date ASC`
        )
        .all(horizonStr);
    },

    /** Monthly spend per category: [{ category, total_paisa, count }] */
    monthlyCategorySpend(month) {
      return db
        .prepare(
          `SELECT category, SUM(amount_paisa) AS total_paisa, COUNT(*) AS count
           FROM expenses WHERE substr(expense_date, 1, 7) = ?
           GROUP BY category ORDER BY total_paisa DESC`
        )
        .all(month);
    },

    monthlyTotal(month) {
      const row = db
        .prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS total FROM expenses WHERE substr(expense_date, 1, 7) = ?')
        .get(month);
      return row.total;
    },
  };
}

module.exports = { createExpensesModel };
