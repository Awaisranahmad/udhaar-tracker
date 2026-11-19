'use strict';

const express = require('express');
const { escapeCsv } = require('../utils/escape');
const { computeBalances } = require('../services/balances');

function sendCsv(res, filename, header, rows) {
  const lines = [header.map(escapeCsv).join(',')];
  for (const row of rows) lines.push(row.map(escapeCsv).join(','));
  const csv = lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function createExportRouter({ people, expenses, settlements }) {
  const router = express.Router();

  router.get('/expenses.csv', (_req, res) => {
    const { rows } = expenses.list({ limit: 10000, offset: 0 });
    sendCsv(
      res,
      'expenses.csv',
      ['id', 'title', 'category', 'amount_pkr', 'payer', 'expense_date', 'notes'],
      rows.map((e) => [e.id, e.title, e.category, (e.amount_paisa / 100).toFixed(2), e.payer_name, e.expense_date, e.notes || ''])
    );
  });

  router.get('/settlements.csv', (_req, res) => {
    const { rows } = settlements.list({ limit: 10000, offset: 0 });
    sendCsv(
      res,
      'settlements.csv',
      ['id', 'person', 'amount_pkr', 'direction', 'method', 'settlement_date', 'note'],
      rows.map((s) => [s.id, s.person_name, (s.amount_paisa / 100).toFixed(2), s.direction, s.method, s.settlement_date, s.note || ''])
    );
  });

  router.get('/balances.csv', (_req, res) => {
    const self = people.getSelf();
    const { balances, totals } = computeBalances({
      people: people.list(),
      splits: expenses.listSplits(),
      settlements: settlements.listAll(),
      selfId: self.id,
    });
    const rows = balances.map((b) => [
      b.person.name,
      (b.outstandingOwedToMe / 100).toFixed(2),
      (b.outstandingIOwe / 100).toFixed(2),
      (b.net / 100).toFixed(2),
    ]);
    rows.push(['TOTAL', (totals.totalOwedToMe / 100).toFixed(2), (totals.totalIOwe / 100).toFixed(2), (totals.netTotal / 100).toFixed(2)]);
    sendCsv(res, 'balances.csv', ['person', 'owed_to_me_pkr', 'i_owe_pkr', 'net_pkr'], rows);
  });

  return router;
}

module.exports = { createExportRouter };
