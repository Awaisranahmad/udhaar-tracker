'use strict';

const express = require('express');
const { isIdParam } = require('../middleware/validate');
const { notFound, badRequest } = require('../utils/errors');
const { computeBalances, applyPaymentsFifo } = require('../services/balances');
const { buildInvoiceText, whatsappUrl } = require('../services/invoices');
const { todayIso } = require('../utils/dates');
const { personOut } = require('./common');

function createInvoicesRouter({ people, expenses, settlements }) {
  const router = express.Router();

  router.get('/:personId', (req, res, next) => {
    if (!isIdParam(req.params.personId)) return next(badRequest('Invalid person id: must be a positive integer.'));
    req.params.personId = Number(req.params.personId);
    const person = people.getById(req.params.personId);
    if (!person) return next(notFound('Person not found.'));
    if (person.is_self === 1) return next(notFound('Invoices are for other people, not yourself.'));

    const self = people.getSelf();
    const { balances } = computeBalances({
      people: people.list(),
      splits: expenses.listSplits(),
      settlements: settlements.listAll(),
      selfId: self.id,
    });
    const balance = balances.find((b) => b.person.id === person.id);

    // Outstanding splits this person owes me, oldest first, with 'in'
    // settlements applied FIFO so the invoice only lists what is still due.
    const owedSplits = expenses
      .listSplitsForPerson(person.id)
      .filter((s) => s.payer_id === self.id);
    const openSplits = applyPaymentsFifo(owedSplits, balance ? balance.received : 0);

    const text = buildInvoiceText({
      person,
      splits: openSplits.map((s) => ({ ...s, amount_paisa: s.remaining_paisa })),
      balance: balance || { outstandingOwedToMe: 0, outstandingIOwe: 0, net: 0 },
      today: todayIso(),
    });

    return res.json({
      invoice: {
        person: personOut(person),
        items: openSplits.map((s) => ({
          split_id: s.id,
          title: s.title,
          category: s.category,
          expense_date: s.expense_date,
          due_date: s.due_date,
          amount_paisa: s.remaining_paisa,
          amount: s.remaining_paisa / 100,
        })),
        outstanding_owed_to_me_paisa: balance ? balance.outstandingOwedToMe : 0,
        outstanding_i_owe_paisa: balance ? balance.outstandingIOwe : 0,
        net_paisa: balance ? balance.net : 0,
        text,
        whatsapp_url: whatsappUrl(person.phone, text),
      },
    });
  });

  return router;
}

module.exports = { createInvoicesRouter };
