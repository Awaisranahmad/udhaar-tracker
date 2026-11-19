'use strict';

/** People (contacts) data access. All queries are parameterised. */

function createPeopleModel(db) {
  const insertStmt = db.prepare(
    'INSERT INTO people (name, phone, email, notes, is_self, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE people SET name = ?, phone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ? AND is_self = 0'
  );

  return {
    getSelf() {
      return db.prepare('SELECT * FROM people WHERE is_self = 1 LIMIT 1').get();
    },

    getById(id) {
      return db.prepare('SELECT * FROM people WHERE id = ?').get(id) || null;
    },

    /** List people, optionally filtered by a case-insensitive name/phone search. */
    list(search) {
      if (search) {
        const like = `%${search}%`;
        return db
          .prepare(
            'SELECT * FROM people WHERE name LIKE ? COLLATE NOCASE OR phone LIKE ? ORDER BY name ASC'
          )
          .all(like, like);
      }
      return db.prepare('SELECT * FROM people ORDER BY name ASC').all();
    },

    create({ name, phone, email, notes }) {
      const now = new Date().toISOString();
      const info = insertStmt.run(name.trim(), phone || null, email || null, notes || null, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },

    update(id, { name, phone, email, notes }) {
      const now = new Date().toISOString();
      const info = updateStmt.run(name.trim(), phone || null, email || null, notes || null, now, id);
      if (info.changes === 0) return null;
      return this.getById(id);
    },

    /** Delete a person only when nothing references them (no expenses/splits/settlements). */
    delete(id) {
      const refs = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM expenses WHERE payer_id = ?) +
             (SELECT COUNT(*) FROM splits WHERE person_id = ?) +
             (SELECT COUNT(*) FROM settlements WHERE person_id = ?) AS n`
        )
        .get(id, id, id).n;
      if (refs > 0) return { deleted: false, reason: 'Person has expenses, splits or settlements and cannot be deleted.' };
      const info = db.prepare('DELETE FROM people WHERE id = ? AND is_self = 0').run(id);
      return { deleted: info.changes > 0, reason: null };
    },
  };
}

module.exports = { createPeopleModel };
