'use strict';

/**
 * Balance + settlement math. Pure functions (no DB) so they are unit-testable.
 *
 * Definitions (all in paisa, relative to the ledger owner "Me"):
 * - owedToMe(P)   = splits where P owes Me (debtor P, payer = self)
 * - iOwe(P)       = splits where I owe P (debtor = self, payer P)
 * - received(P)   = settlements 'in'  from P (they paid me)
 * - paid(P)       = settlements 'out' to P (I paid them)
 * - net(P)        = (owedToMe - received) - (iOwe - paid)
 *   net > 0: P owes me.  net < 0: I owe P.
 */

function computeBalances({ people, splits, settlements, selfId }) {
  const byPerson = new Map();
  for (const p of people) {
    if (p.id === selfId) continue;
    byPerson.set(p.id, {
      person: p,
      owedToMe: 0,
      iOwe: 0,
      received: 0,
      paid: 0,
      outstandingOwedToMe: 0,
      outstandingIOwe: 0,
      net: 0,
    });
  }
  for (const s of splits) {
    if (s.person_id === selfId && s.payer_id !== selfId) {
      // I owe the payer.
      const row = byPerson.get(s.payer_id);
      if (row) row.iOwe += s.amount_paisa;
    } else if (s.payer_id === selfId && s.person_id !== selfId) {
      const row = byPerson.get(s.person_id);
      if (row) row.owedToMe += s.amount_paisa;
    }
    // Splits between two other people are not part of my khata.
  }
  for (const st of settlements) {
    const row = byPerson.get(st.person_id);
    if (!row) continue;
    if (st.direction === 'in') row.received += st.amount_paisa;
    else if (st.direction === 'out') row.paid += st.amount_paisa;
  }
  const balances = [];
  let totalOwedToMe = 0;
  let totalIOwe = 0;
  for (const row of byPerson.values()) {
    row.outstandingOwedToMe = row.owedToMe - row.received;
    row.outstandingIOwe = row.iOwe - row.paid;
    row.net = row.outstandingOwedToMe - row.outstandingIOwe;
    totalOwedToMe += row.outstandingOwedToMe;
    totalIOwe += row.outstandingIOwe;
    balances.push(row);
  }
  balances.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return { balances, totals: { totalOwedToMe, totalIOwe, netTotal: totalOwedToMe - totalIOwe } };
}

/**
 * How much can still be settled in `direction` for a person, from a
 * precomputed balance row. Used to reject over-settlements.
 */
function maxSettleable(balanceRow, direction) {
  if (!balanceRow) return 0;
  return direction === 'in'
    ? Math.max(0, balanceRow.outstandingOwedToMe)
    : Math.max(0, balanceRow.outstandingIOwe);
}

/**
 * Apply payments FIFO (oldest first) to a list of dated splits and return
 * each split with its remaining amount. Used for aging of old udhaar.
 */
function applyPaymentsFifo(splits, totalPaidPaisa) {
  let remaining = Math.max(0, totalPaidPaisa);
  return splits
    .slice()
    .sort((a, b) => (a.expense_date < b.expense_date ? -1 : a.expense_date > b.expense_date ? 1 : a.id - b.id))
    .map((s) => {
      const paid = Math.min(remaining, s.amount_paisa);
      remaining -= paid;
      return { ...s, paid_paisa: paid, remaining_paisa: s.amount_paisa - paid };
    })
    .filter((s) => s.remaining_paisa > 0);
}

/** Age buckets (days since the expense) for remaining udhaar amounts. */
function agingBuckets(openSplits, today) {
  const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const { daysBetween } = require('../utils/dates');
  for (const s of openSplits) {
    const age = daysBetween(s.expense_date, today);
    if (age <= 30) buckets['0-30'] += s.remaining_paisa;
    else if (age <= 60) buckets['31-60'] += s.remaining_paisa;
    else if (age <= 90) buckets['61-90'] += s.remaining_paisa;
    else buckets['90+'] += s.remaining_paisa;
  }
  return buckets;
}

module.exports = { computeBalances, maxSettleable, applyPaymentsFifo, agingBuckets };
