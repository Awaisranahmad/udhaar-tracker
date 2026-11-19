'use strict';

/** Settlements data access. */
const { toPaisa } = require('../utils/money');

function createSettlementsModel(db) {
  return {
    getById(id) {
      return db.prepare('SELECT * FROM settlements WHERE id = ?').get(id) || null;
    },

    list({ personId, direction, from, to, limit = 100, offset = 0 } = {}) {
      const conditions = [];
      const params = [];
      if (personId) {
        conditions.push('st.person_id = ?');
        params.push(personId);
      }
      if (direction) {
        conditions.push('st.direction = ?');
        params.push(direction);
      }
      if (from) {
        conditions.push('st.settlement_date >= ?');
        params.push(from);
      }
      if (to) {
        conditions.push('st.settlement_date <= ?');
        params.push(to);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(
          `SELECT st.*, p.name AS person_name FROM settlements st
           JOIN people p ON p.id = st.person_id ${where}
           ORDER BY st.settlement_date DESC, st.id DESC LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM settlements st ${where}`).get(...params).n;
      return { rows, total };
    },

    create({ personId, amountPkr, direction, method, settlementDate, note }) {
      const now = new Date().toISOString();
      const info = db
        .prepare(
          'INSERT INTO settlements (person_id, amount_paisa, direction, method, settlement_date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(personId, toPaisa(amountPkr), direction, method, settlementDate, note || null, now);
      return this.getById(Number(info.lastInsertRowid));
    },

    delete(id) {
      return db.prepare('DELETE FROM settlements WHERE id = ?').run(id).changes > 0;
    },

    listAll() {
      return db.prepare('SELECT * FROM settlements ORDER BY settlement_date ASC, id ASC').all();
    },

    /** Total settled per person per direction: { person_id, direction, total_paisa } */
    totalsByPerson() {
      return db
        .prepare(
          'SELECT person_id, direction, SUM(amount_paisa) AS total_paisa FROM settlements GROUP BY person_id, direction'
        )
        .all();
    },
  };
}

module.exports = { createSettlementsModel };
