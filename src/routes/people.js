'use strict';

const express = require('express');
const { validateBody, validateIdParam, v, MAX_NAME_LEN, MAX_TEXT_LEN } = require('../middleware/validate');
const { notFound, conflict } = require('../utils/errors');
const { personOut, parseSearch } = require('./common');

function createPeopleRouter({ people }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const q = parseSearch(req.query.q);
    res.json({ people: people.list(q || null).map(personOut) });
  });

  router.get('/:id', validateIdParam, (req, res, next) => {
    const person = people.getById(req.params.id);
    if (!person) return next(notFound('Person not found.'));
    return res.json({ person: personOut(person) });
  });

  router.post(
    '/',
    validateBody({
      name: v.requiredString(MAX_NAME_LEN),
      phone: v.optionalPhone,
      email: v.optionalEmail,
      notes: v.optionalString(MAX_TEXT_LEN),
    }),
    (req, res) => {
      const person = people.create(req.validated);
      res.status(201).json({ person: personOut(person) });
    }
  );

  router.put(
    '/:id',
    validateIdParam,
    validateBody({
      name: v.requiredString(MAX_NAME_LEN),
      phone: v.optionalPhone,
      email: v.optionalEmail,
      notes: v.optionalString(MAX_TEXT_LEN),
    }),
    (req, res, next) => {
      const person = people.update(req.params.id, req.validated);
      if (!person) return next(notFound('Person not found (or it is the owner record).'));
      return res.json({ person: personOut(person) });
    }
  );

  router.delete('/:id', validateIdParam, (req, res, next) => {
    const person = people.getById(req.params.id);
    if (!person) return next(notFound('Person not found.'));
    if (person.is_self === 1) return next(notFound('The owner record cannot be deleted.'));
    const result = people.delete(req.params.id);
    if (!result.deleted) return next(conflict(result.reason));
    return res.status(204).send();
  });

  return router;
}

module.exports = { createPeopleRouter };
