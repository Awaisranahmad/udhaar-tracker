'use strict';

const express = require('express');
const { badRequest } = require('../utils/errors');
const { isValidMonthString, currentMonth, todayIso } = require('../utils/dates');
const { buildDashboard } = require('../services/dashboard');

function createDashboardRouter({ people, expenses, settlements, budgets }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    const month = req.query.month || currentMonth();
    if (!isValidMonthString(month)) return next(badRequest('month must be a valid YYYY-MM value.'));
    const self = people.getSelf();
    const summary = buildDashboard({
      month,
      today: todayIso(),
      people: people.list(),
      selfId: self.id,
      splits: expenses.listSplits(),
      settlements: settlements.listAll(),
      categorySpend: expenses.monthlyCategorySpend(month),
      monthlyTotal: expenses.monthlyTotal(month),
      budgets: budgets.list(month),
    });
    return res.json(summary);
  });

  return router;
}

module.exports = { createDashboardRouter };
