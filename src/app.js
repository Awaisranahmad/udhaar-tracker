'use strict';

/**
 * Express app factory. Takes a dbPath so tests can use an isolated
 * in-memory database. No server is started here - see src/index.js.
 */
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { getDb } = require('./db');
const { createPeopleModel } = require('./models/people');
const { createExpensesModel } = require('./models/expenses');
const { createSettlementsModel } = require('./models/settlements');
const { createBudgetsModel } = require('./models/budgets');
const { createRecurringModel } = require('./models/recurring');
const { securityHeaders, rateLimiter } = require('./middleware/security');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { createPeopleRouter } = require('./routes/people');
const { createExpensesRouter } = require('./routes/expenses');
const { createSettlementsRouter } = require('./routes/settlements');
const { createBalancesRouter } = require('./routes/balances');
const { createBudgetsRouter } = require('./routes/budgets');
const { createRecurringRouter } = require('./routes/recurring');
const { createDashboardRouter } = require('./routes/dashboard');
const { createInvoicesRouter } = require('./routes/invoices');
const { createExportRouter } = require('./routes/export');
const { createUdhaarRouter } = require('./routes/udhaar');

function createApp(dbPath) {
  const db = getDb(dbPath || config.dbPath);
  const ctx = {
    db,
    people: createPeopleModel(db),
    expenses: createExpensesModel(db),
    settlements: createSettlementsModel(db),
    budgets: createBudgetsModel(db),
    recurring: createRecurringModel(db),
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(rateLimiter());
  app.use(express.json({ limit: config.jsonLimit }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'udhaar-tracker', version: '1.0.0' }));

  app.use('/api/people', createPeopleRouter(ctx));
  app.use('/api/expenses', createExpensesRouter(ctx));
  app.use('/api/settlements', createSettlementsRouter(ctx));
  app.use('/api/balances', createBalancesRouter(ctx));
  app.use('/api/budgets', createBudgetsRouter(ctx));
  app.use('/api/recurring', createRecurringRouter(ctx));
  app.use('/api/dashboard', createDashboardRouter(ctx));
  app.use('/api/invoices', createInvoicesRouter(ctx));
  app.use('/api/export', createExportRouter(ctx));
  app.use('/api/udhaar', createUdhaarRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
