'use strict';

const express = require('express');
const { validateBody, validateIdParam, v, MAX_TEXT_LEN } = require('../middleware/validate');
const { notFound, badRequest } = require('../utils/errors');
const { expenseOut, parsePagination, parseSearch } = require('./common');

function createExpensesRouter({ people, expenses }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    const { limit, offset } = parsePagination(req.query);
    const personId = req.query.person_id ? Number(req.query.person_id) : null;
    if (req.query.person_id && (!Number.isInteger(personId) || personId <= 0)) {
      return next(badRequest('person_id must be a positive integer.'));
    }
    if (req.query.category && !require('../middleware/validate').CATEGORIES.includes(req.query.category)) {
      return next(badRequest('Invalid category.'));
    }
    if (req.query.from && !require('../utils/dates').isValidDateString(req.query.from)) {
      return next(badRequest('from must be a valid YYYY-MM-DD date.'));
    }
    if (req.query.to && !require('../utils/dates').isValidDateString(req.query.to)) {
      return next(badRequest('to must be a valid YYYY-MM-DD date.'));
    }
    const { rows, total } = expenses.list({
      search: parseSearch(req.query.q) || null,
      category: req.query.category || null,
      from: req.query.from || null,
      to: req.query.to || null,
      personId,
      limit,
      offset,
    });
    return res.json({ expenses: rows.map(expenseOut), total, limit, offset });
  });

  router.get('/:id', validateIdParam, (req, res, next) => {
    const expense = expenses.getById(req.params.id);
    if (!expense) return next(notFound('Expense not found.'));
    return res.json({ expense: expenseOut(expense) });
  });

  router.post(
    '/',
    validateBody({
      title: v.requiredString(200),
      category: v.category,
      amount: v.money,
      payer_id: v.personId,
      expense_date: v.date,
      notes: v.optionalString(MAX_TEXT_LEN),
      splits: v.splits,
      due_date: v.optionalDate,
    }),
    (req, res, next) => {
      const body = req.validated;
      const payer = people.getById(body.payer_id);
      if (!payer) return next(badRequest('payer_id does not match any person.'));
      for (const s of body.splits) {
        if (!people.getById(s.person_id)) {
          return next(badRequest(`Split person_id ${s.person_id} does not match any person.`));
        }
        if (s.due_date && !require('../utils/dates').isValidDateString(s.due_date)) {
          return next(badRequest('Each split due_date must be a valid YYYY-MM-DD date.'));
        }
      }
      try {
        const expense = expenses.create({
          title: body.title,
          category: body.category,
          amountPkr: body.amount,
          payerId: body.payer_id,
          expenseDate: body.expense_date,
          notes: body.notes,
          splits: body.splits,
          dueDate: body.due_date,
        });
        return res.status(201).json({ expense: expenseOut(expense) });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.delete('/:id', validateIdParam, (req, res, next) => {
    if (!expenses.delete(req.params.id)) return next(notFound('Expense not found.'));
    return res.status(204).send();
  });

  return router;
}

module.exports = { createExpensesRouter };
