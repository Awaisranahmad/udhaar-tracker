'use strict';

const express = require('express');
const { badRequest } = require('../utils/errors');
const { todayIso, daysBetween } = require('../utils/dates');
const { computeBalances, applyPaymentsFifo } = require('../services/balances');

/**
 * Due-date tracking for udhaar: overdue splits and splits due within the
 * next N days (default 7). Only splits people owe ME are listed here -
 * my own payables are visible in balances/dashboard.
 */
function createUdhaarRouter({ people, expenses, settlements }) {
  const router = express.Router();

  router.get('/due', (req, res, next) => {
    let days = 7;
    if (req.query.days !== undefined) {
      days = Number(req.query.days);
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        return next(badRequest('days must be an integer between 0 and 365.'));
      }
    }
    const today = todayIso();
    const self = people.getSelf();
    const { balances } = computeBalances({
      people: people.list(),
      splits: expenses.listSplits(),
      settlements: settlements.listAll(),
      selfId: self.id,
    });
    const receivedByPerson = new Map(balances.map((b) => [b.person.id, b.received]));

    // Open (unsettled) splits per person, FIFO against their settlements.
    const owedSplits = expenses.listSplits().filter((s) => s.payer_id === self.id && s.person_id !== self.id);
    const byPerson = new Map();
    for (const s of owedSplits) {
      if (!byPerson.has(s.person_id)) byPerson.set(s.person_id, []);
      byPerson.get(s.person_id).push(s);
    }
    const items = [];
    for (const [personId, list] of byPerson) {
      const openSplits = applyPaymentsFifo(list, receivedByPerson.get(personId) || 0);
      for (const s of openSplits) {
        if (!s.due_date) continue;
        const daysUntil = daysBetween(today, s.due_date);
        if (daysUntil < 0 || daysUntil <= days) {
          items.push({
            split_id: s.id,
            person_id: s.person_id,
            title: s.title,
            category: s.category,
            expense_date: s.expense_date,
            due_date: s.due_date,
            remaining_paisa: s.remaining_paisa,
            remaining: s.remaining_paisa / 100,
            overdue: daysUntil < 0,
            days_until_due: daysUntil,
          });
        }
      }
    }
    items.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    return res.json({ today, days, due: items });
  });

  return router;
}

module.exports = { createUdhaarRouter };
