'use strict';

const express = require('express');
const { validateBody, validateIdParam, v, MAX_TEXT_LEN } = require('../middleware/validate');
const { notFound, badRequest } = require('../utils/errors');
const { isValidDateString } = require('../utils/dates');
const { toPaisa } = require('../utils/money');
const { generateDue } = require('../services/recurring');
const { recurringOut } = require('./common');

function createRecurringRouter({ people, expenses, recurring }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const active = req.query.active === undefined ? undefined : req.query.active === 'true';
    res.json({ recurring: recurring.list({ active }).map(recurringOut) });
  });

  router.get('/:id', validateIdParam, (req, res, next) => {
    const r = recurring.getById(req.params.id);
    if (!r) return next(notFound('Recurring expense not found.'));
    return res.json({ recurring: recurringOut(r) });
  });

  const createSchema = {
    title: v.requiredString(200),
    category: v.category,
    amount: v.money,
    payer_id: v.personId,
    frequency: v.enum(['weekly', 'monthly']),
    day_of_month: (value, body) => {
      if (body.frequency === 'monthly') {
        return Number.isInteger(value) && value >= 1 && value <= 31
          ? null
          : 'day_of_month (1-31) is required for monthly frequency.';
      }
      return value === undefined || value === null ? null : 'day_of_month is only for monthly frequency.';
    },
    day_of_week: (value, body) => {
      if (body.frequency === 'weekly') {
        return Number.isInteger(value) && value >= 0 && value <= 6
          ? null
          : 'day_of_week (0=Sunday .. 6=Saturday) is required for weekly frequency.';
      }
      return value === undefined || value === null ? null : 'day_of_week is only for weekly frequency.';
    },
    split_person_ids: (value) =>
      value === undefined || value === null ? null : v.idArray(value),
    next_due_date: v.date,
  };

  router.post('/', validateBody(createSchema), (req, res, next) => {
    const b = req.validated;
    if (!people.getById(b.payer_id)) return next(badRequest('payer_id does not match any person.'));
    for (const pid of b.split_person_ids || []) {
      if (!people.getById(pid)) return next(badRequest(`split_person_ids contains unknown person ${pid}.`));
    }
    const created = recurring.create({
      title: b.title,
      category: b.category,
      amountPkr: b.amount,
      payerId: b.payer_id,
      frequency: b.frequency,
      dayOfMonth: b.day_of_month,
      dayOfWeek: b.day_of_week,
      splitPersonIds: b.split_person_ids || [],
      nextDueDate: b.next_due_date,
    });
    return res.status(201).json({ recurring: recurringOut(created) });
  });

  router.put(
    '/:id',
    validateIdParam,
    validateBody({
      title: (value) => (value === undefined ? null : v.requiredString(200)(value)),
      active: (value) => (value === undefined || typeof value === 'boolean' ? null : 'active must be a boolean.'),
      next_due_date: (value) => (value === undefined ? null : isValidDateString(value) ? null : 'Must be a valid YYYY-MM-DD date.'),
      amount: (value) => (value === undefined ? null : v.money(value)),
      notes: v.optionalString(MAX_TEXT_LEN),
    }),
    (req, res, next) => {
      const existing = recurring.getById(req.params.id);
      if (!existing) return next(notFound('Recurring expense not found.'));
      const b = req.validated;
      const fields = {};
      if (b.title !== undefined) fields.title = b.title.trim();
      if (b.active !== undefined) fields.active = b.active ? 1 : 0;
      if (b.next_due_date !== undefined) fields.next_due_date = b.next_due_date;
      if (b.amount !== undefined) fields.amount_paisa = toPaisa(b.amount);
      const updated = recurring.update(req.params.id, fields);
      return res.json({ recurring: recurringOut(updated) });
    }
  );

  router.delete('/:id', validateIdParam, (req, res, next) => {
    if (!recurring.delete(req.params.id)) return next(notFound('Recurring expense not found.'));
    return res.status(204).send();
  });

  // Generate expenses for every template whose due date has arrived.
  router.post('/generate-due', (req, res) => {
    const { todayIso } = require('../utils/dates');
    const created = generateDue({ recurringModel: recurring, expensesModel: expenses, today: todayIso() });
    return res.json({ generated: created.length, expenses: created.map((e) => ({ id: e.id, title: e.title })) });
  });

  return router;
}

module.exports = { createRecurringRouter };
