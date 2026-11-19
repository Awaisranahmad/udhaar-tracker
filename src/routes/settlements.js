'use strict';

const express = require('express');
const { validateBody, validateIdParam, v, SETTLEMENT_METHODS, MAX_TEXT_LEN } = require('../middleware/validate');
const { notFound, badRequest } = require('../utils/errors');
const { computeBalances, maxSettleable } = require('../services/balances');
const { settlementOut, parsePagination } = require('./common');
const { isValidDateString } = require('../utils/dates');

function createSettlementsRouter({ people, expenses, settlements }) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    const { limit, offset } = parsePagination(req.query);
    const personId = req.query.person_id ? Number(req.query.person_id) : null;
    if (req.query.person_id && (!Number.isInteger(personId) || personId <= 0)) {
      return next(badRequest('person_id must be a positive integer.'));
    }
    if (req.query.direction && !['in', 'out'].includes(req.query.direction)) {
      return next(badRequest("direction must be 'in' or 'out'."));
    }
    if (req.query.from && !isValidDateString(req.query.from)) return next(badRequest('from must be a valid YYYY-MM-DD date.'));
    if (req.query.to && !isValidDateString(req.query.to)) return next(badRequest('to must be a valid YYYY-MM-DD date.'));
    const { rows, total } = settlements.list({
      personId,
      direction: req.query.direction || null,
      from: req.query.from || null,
      to: req.query.to || null,
      limit,
      offset,
    });
    return res.json({ settlements: rows.map(settlementOut), total, limit, offset });
  });

  router.get('/:id', validateIdParam, (req, res, next) => {
    const s = settlements.getById(req.params.id);
    if (!s) return next(notFound('Settlement not found.'));
    return res.json({ settlement: settlementOut(s) });
  });

  router.post(
    '/',
    validateBody({
      person_id: v.personId,
      amount: v.money,
      direction: v.enum(['in', 'out']),
      method: v.enum(SETTLEMENT_METHODS),
      settlement_date: v.date,
      note: v.optionalString(MAX_TEXT_LEN),
    }),
    (req, res, next) => {
      const body = req.validated;
      const person = people.getById(body.person_id);
      if (!person) return next(badRequest('person_id does not match any person.'));
      if (person.is_self === 1) return next(badRequest('Settlements are recorded against other people, not yourself.'));

      // Business rule: a settlement cannot exceed what is actually outstanding
      // in that direction - this keeps balances from going wrong.
      const self = people.getSelf();
      const { balances } = computeBalances({
        people: people.list(),
        splits: expenses.listSplits(),
        settlements: settlements.listAll(),
        selfId: self.id,
      });
      const row = balances.find((b) => b.person.id === body.person_id);
      const max = maxSettleable(row, body.direction);
      if (body.amount * 100 > max) {
        return next(
          badRequest(
            `Settlement exceeds the outstanding amount (${(max / 100).toFixed(2)} PKR) in this direction.`
          )
        );
      }
      const created = settlements.create({
        personId: body.person_id,
        amountPkr: body.amount,
        direction: body.direction,
        method: body.method,
        settlementDate: body.settlement_date,
        note: body.note,
      });
      return res.status(201).json({ settlement: settlementOut(created) });
    }
  );

  router.delete('/:id', validateIdParam, (req, res, next) => {
    if (!settlements.delete(req.params.id)) return next(notFound('Settlement not found.'));
    return res.status(204).send();
  });

  return router;
}

module.exports = { createSettlementsRouter };
