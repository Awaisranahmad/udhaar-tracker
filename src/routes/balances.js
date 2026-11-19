'use strict';

const express = require('express');
const { isIdParam } = require('../middleware/validate');
const { notFound, badRequest } = require('../utils/errors');
const { computeBalances } = require('../services/balances');
const { personOut } = require('./common');

function balanceOut(row) {
  return {
    person: personOut(row.person),
    owed_to_me_paisa: row.owedToMe,
    owed_to_me: row.owedToMe / 100,
    i_owe_paisa: row.iOwe,
    i_owe: row.iOwe / 100,
    received_paisa: row.received,
    paid_paisa: row.paid,
    outstanding_owed_to_me_paisa: row.outstandingOwedToMe,
    outstanding_i_owe_paisa: row.outstandingIOwe,
    net_paisa: row.net,
    net: row.net / 100,
  };
}

function createBalancesRouter({ people, expenses, settlements }) {
  const router = express.Router();

  function loadAll() {
    const self = people.getSelf();
    return computeBalances({
      people: people.list(),
      splits: expenses.listSplits(),
      settlements: settlements.listAll(),
      selfId: self.id,
    });
  }

  router.get('/', (_req, res) => {
    const { balances, totals } = loadAll();
    res.json({
      balances: balances.map(balanceOut),
      totals: {
        total_owed_to_me_paisa: totals.totalOwedToMe,
        total_owed_to_me: totals.totalOwedToMe / 100,
        total_i_owe_paisa: totals.totalIOwe,
        total_i_owe: totals.totalIOwe / 100,
        net_total_paisa: totals.netTotal,
        net_total: totals.netTotal / 100,
      },
    });
  });

  router.get('/:personId', (req, res, next) => {
    if (!isIdParam(req.params.personId)) return next(badRequest('Invalid person id: must be a positive integer.'));
    req.params.personId = Number(req.params.personId);
    const person = people.getById(req.params.personId);
    if (!person) return next(notFound('Person not found.'));
    const { balances } = loadAll();
    const row = balances.find((b) => b.person.id === req.params.personId);
    if (!row) return next(notFound('Person not found.'));
    return res.json({ balance: balanceOut(row) });
  });

  return router;
}

module.exports = { createBalancesRouter, balanceOut };
