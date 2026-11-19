'use strict';

const express = require('express');
const { validateBody, validateIdParam, v } = require('../middleware/validate');
const { notFound, badRequest } = require('../utils/errors');
const { isValidMonthString } = require('../utils/dates');
const { budgetOut } = require('./common');

function createBudgetsRouter({ budgets, expenses }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    if (req.query.month && !isValidMonthString(req.query.month)) {
      return next(badRequest('month must be a valid YYYY-MM value.'));
    }
    const rows = budgets.list(req.query.month || null);
    const month = req.query.month || null;
    res.json({
      budgets: rows.map((b) => {
        const out = budgetOut(b);
        if (month) {
          const spent = expenses
            .monthlyCategorySpend(month)
            .find((c) => c.category === b.category);
          out.spent_paisa = spent ? spent.total_paisa : 0;
          out.spent = out.spent_paisa / 100;
          out.remaining_paisa = b.limit_paisa - out.spent_paisa;
          out.percent_used = b.limit_paisa > 0 ? Math.round((out.spent_paisa / b.limit_paisa) * 100) : 0;
          out.over = out.spent_paisa > b.limit_paisa;
        }
        return out;
      }),
    });
  });

  router.post(
    '/',
    validateBody({
      category: v.category,
      month: v.month,
      limit: v.money,
    }),
    (req, res) => {
      const b = budgets.upsert({ category: req.validated.category, month: req.validated.month, limitPkr: req.validated.limit });
      res.status(201).json({ budget: budgetOut(b) });
    }
  );

  router.delete('/:id', validateIdParam, (req, res, next) => {
    if (!budgets.delete(req.params.id)) return next(notFound('Budget not found.'));
    return res.status(204).send();
  });

  return router;
}

module.exports = { createBudgetsRouter };
