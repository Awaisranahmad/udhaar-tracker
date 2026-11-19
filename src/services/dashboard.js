'use strict';

/**
 * Dashboard summaries: monthly spend, category breakdown, top debtors,
 * aging of old udhaar, budget warnings, overdue/upcoming due splits.
 */
const { computeBalances, applyPaymentsFifo, agingBuckets } = require('./balances');
const { daysBetween } = require('../utils/dates');

function buildDashboard({ month, today, people, selfId, splits, settlements, categorySpend, monthlyTotal, budgets }) {
  const { balances, totals } = computeBalances({ people, splits, settlements, selfId });

  // Top debtors: people who owe me the most (net > 0), top 5.
  const topDebtors = balances.filter((b) => b.net > 0).slice(0, 5);

  // Aging: apply each person's 'in' settlements FIFO to what they owe me,
  // and 'out' settlements FIFO to what I owe them.
  const receivedByPerson = new Map();
  const paidByPerson = new Map();
  for (const st of settlements) {
    const map = st.direction === 'in' ? receivedByPerson : paidByPerson;
    map.set(st.person_id, (map.get(st.person_id) || 0) + st.amount_paisa);
  }
  const owedToMeSplits = splits.filter((s) => s.payer_id === selfId && s.person_id !== selfId);
  const iOweSplits = splits.filter((s) => s.person_id === selfId && s.payer_id !== selfId);
  const openOwedToMe = [];
  const openIOwe = [];
  const byDebtor = new Map();
  for (const s of owedToMeSplits) {
    if (!byDebtor.has(s.person_id)) byDebtor.set(s.person_id, []);
    byDebtor.get(s.person_id).push(s);
  }
  for (const [personId, list] of byDebtor) {
    openOwedToMe.push(...applyPaymentsFifo(list, receivedByPerson.get(personId) || 0));
  }
  const byPayer = new Map();
  for (const s of iOweSplits) {
    if (!byPayer.has(s.payer_id)) byPayer.set(s.payer_id, []);
    byPayer.get(s.payer_id).push(s);
  }
  for (const [payerId, list] of byPayer) {
    openIOwe.push(...applyPaymentsFifo(list, paidByPerson.get(payerId) || 0));
  }

  const agingOwedToMe = agingBuckets(openOwedToMe, today);
  const agingIOwe = agingBuckets(openIOwe, today);

  // Budget warnings for this month.
  const spentByCategory = new Map(categorySpend.map((c) => [c.category, c.total_paisa]));
  const budgetWarnings = budgets.map((b) => {
    const spent = spentByCategory.get(b.category) || 0;
    const pct = b.limit_paisa > 0 ? Math.round((spent / b.limit_paisa) * 100) : 0;
    return {
      category: b.category,
      month: b.month,
      limit_paisa: b.limit_paisa,
      spent_paisa: spent,
      remaining_paisa: b.limit_paisa - spent,
      percent_used: pct,
      over: spent > b.limit_paisa,
      warning: spent > b.limit_paisa * 0.8,
    };
  });

  // Overdue + upcoming splits (only what people owe me - my receivables).
  const overdue = openOwedToMe.filter((s) => s.due_date && daysBetween(s.due_date, today) > 0);
  const upcoming = openOwedToMe
    .filter((s) => s.due_date && daysBetween(today, s.due_date) >= 0 && daysBetween(today, s.due_date) <= 7)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));

  return {
    month,
    today,
    totals: {
      monthly_spend_paisa: monthlyTotal,
      total_owed_to_me_paisa: totals.totalOwedToMe,
      total_owed_to_me: totals.totalOwedToMe / 100,
      total_i_owe_paisa: totals.totalIOwe,
      total_i_owe: totals.totalIOwe / 100,
      net_total_paisa: totals.netTotal,
      net_total: totals.netTotal / 100,
    },
    category_breakdown: categorySpend,
    top_debtors: topDebtors.map((b) => ({
      person_id: b.person.id,
      name: b.person.name,
      net_paisa: b.net,
      owed_to_me_paisa: b.outstandingOwedToMe,
      i_owe_paisa: b.outstandingIOwe,
    })),
    aging: { owed_to_me: agingOwedToMe, i_owe: agingIOwe },
    budgets: budgetWarnings,
    overdue_count: overdue.length,
    overdue_paisa: overdue.reduce((sum, s) => sum + s.remaining_paisa, 0),
    upcoming_due: upcoming.map((s) => ({
      split_id: s.id,
      person_id: s.person_id,
      title: s.title,
      due_date: s.due_date,
      remaining_paisa: s.remaining_paisa,
    })),
  };
}

module.exports = { buildDashboard };
