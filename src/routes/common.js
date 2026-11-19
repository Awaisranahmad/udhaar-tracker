'use strict';

/** Shared route helpers: serialisers (paisa + PKR) and safe pagination. */

function withMoney(row, paisaFields = ['amount_paisa']) {
  if (!row) return row;
  const out = { ...row };
  for (const f of paisaFields) {
    if (typeof out[f] === 'number') {
      const pkrField = f.replace(/_paisa$/, '');
      out[pkrField === f ? `${f}_pkr` : pkrField] = out[f] / 100;
    }
  }
  return out;
}

function personOut(p) {
  if (!p) return p;
  return { id: p.id, name: p.name, phone: p.phone, email: p.email, notes: p.notes, is_self: p.is_self === 1, created_at: p.created_at, updated_at: p.updated_at };
}

function expenseOut(e) {
  if (!e) return e;
  const out = withMoney(e);
  if (Array.isArray(e.splits)) out.splits = e.splits.map((s) => withMoney(s));
  return out;
}

function settlementOut(s) {
  return withMoney(s);
}

function budgetOut(b) {
  if (!b) return b;
  const out = withMoney(b, ['limit_paisa']);
  out.limit = out.limit_paisa / 100;
  return out;
}

function recurringOut(r) {
  if (!r) return r;
  const out = withMoney(r);
  out.active = r.active === 1;
  return out;
}

/** Parse ?limit/&offset safely: limit 1..100 (default 50), offset >= 0. */
function parsePagination(query) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;
  let offset = Number.parseInt(query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

/** Cap a free-text query param to a safe length (used for LIKE searches). */
function parseSearch(query, maxLen = 100) {
  const q = typeof query === 'string' ? query.trim() : '';
  return q.slice(0, maxLen);
}

module.exports = { withMoney, personOut, expenseOut, settlementOut, budgetOut, recurringOut, parsePagination, parseSearch };
