'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, req, seedPeople } = require('./helpers');

let srv;
let ids;

test.before(async () => {
  srv = await startServer();
  ids = await seedPeople(srv.base);
});

test.after(async () => {
  await srv.stop();
});

test('health endpoint is up', async () => {
  const r = await req(srv.base, 'GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

test('people: create, list, search, get, update', async () => {
  const created = await req(srv.base, 'POST', '/api/people', { name: 'Usman', phone: '03005556666' });
  assert.equal(created.status, 201);
  assert.equal(created.json.person.name, 'Usman');

  const list = await req(srv.base, 'GET', '/api/people');
  assert.equal(list.status, 200);
  assert.ok(list.json.people.some((p) => p.name === 'Usman'));
  assert.ok(list.json.people.some((p) => p.is_self === true));

  const search = await req(srv.base, 'GET', '/api/people?q=usm');
  assert.equal(search.json.people.length, 1);
  assert.equal(search.json.people[0].name, 'Usman');

  const one = await req(srv.base, 'GET', `/api/people/${created.json.person.id}`);
  assert.equal(one.status, 200);

  const updated = await req(srv.base, 'PUT', `/api/people/${created.json.person.id}`, { name: 'Usman Ali' });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.person.name, 'Usman Ali');

  const missing = await req(srv.base, 'GET', '/api/people/99999');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.message, 'Person not found.');
  assert.equal('stack' in missing.json.error, false);
});

test('people: validation rejects bad input', async () => {
  const noName = await req(srv.base, 'POST', '/api/people', { name: '   ' });
  assert.equal(noName.status, 400);
  const badEmail = await req(srv.base, 'POST', '/api/people', { name: 'X', email: 'not-an-email' });
  assert.equal(badEmail.status, 400);
  const badPhone = await req(srv.base, 'POST', '/api/people', { name: 'X', phone: 'abc' });
  assert.equal(badPhone.status, 400);
  const tooLong = await req(srv.base, 'POST', '/api/people', { name: 'x'.repeat(101) });
  assert.equal(tooLong.status, 400);
  const badId = await req(srv.base, 'GET', '/api/people/abc');
  assert.equal(badId.status, 400);
});

test('people: hostile input is stored safely and the table survives', async () => {
  const evil = "x'; DROP TABLE people; --";
  const created = await req(srv.base, 'POST', '/api/people', { name: evil });
  assert.equal(created.status, 201);
  assert.equal(created.json.person.name, evil);
  const list = await req(srv.base, 'GET', '/api/people');
  assert.equal(list.status, 200);
  assert.ok(list.json.people.length > 0); // table still exists
});

test('expenses: equal split creates udhaar for each person', async () => {
  const r = await req(srv.base, 'POST', '/api/expenses', {
    title: 'Mess dinner',
    category: 'food',
    amount: 1000,
    payer_id: ids.self.id,
    expense_date: '2026-11-10',
    splits: [{ person_id: ids.ali.id }, { person_id: ids.bilal.id }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.expense.amount_paisa, 100000);
  assert.equal(r.json.expense.splits.length, 2);
  assert.equal(r.json.expense.splits[0].amount_paisa, 50000);
  assert.equal(r.json.expense.splits[1].amount_paisa, 50000);

  const balances = await req(srv.base, 'GET', '/api/balances');
  const ali = balances.json.balances.find((b) => b.person.id === ids.ali.id);
  const bilal = balances.json.balances.find((b) => b.person.id === ids.bilal.id);
  assert.equal(ali.net_paisa, 50000);
  assert.equal(bilal.net_paisa, 50000);
  assert.equal(balances.json.totals.total_owed_to_me_paisa, 100000);
});

test('expenses: explicit splits must sum to the total', async () => {
  const bad = await req(srv.base, 'POST', '/api/expenses', {
    title: 'Bad split',
    category: 'food',
    amount: 1000,
    payer_id: ids.self.id,
    expense_date: '2026-11-10',
    splits: [
      { person_id: ids.ali.id, amount: 400 },
      { person_id: ids.bilal.id, amount: 400 },
    ],
  });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error.message, /add up/);

  const ok = await req(srv.base, 'POST', '/api/expenses', {
    title: 'Good split',
    category: 'transport',
    amount: 1000,
    payer_id: ids.self.id,
    expense_date: '2026-11-11',
    splits: [
      { person_id: ids.ali.id, amount: 700 },
      { person_id: ids.bilal.id, amount: 300 },
    ],
  });
  assert.equal(ok.status, 201);
});

test('expenses: validation rejects bad category, amount, date and unknown people', async () => {
  const base = {
    title: 'T', category: 'food', amount: 100, payer_id: ids.self.id, expense_date: '2026-11-10', splits: [{ person_id: ids.ali.id }],
  };
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, category: 'nope' })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, amount: -5 })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, amount: 10.005 })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, expense_date: '2026-02-30' })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, payer_id: 99999 })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, splits: [{ person_id: 99999 }] })).status, 400);
  assert.equal((await req(srv.base, 'POST', '/api/expenses', { ...base, splits: [] })).status, 400);
});

test('expenses: amounts like Rs 19.99 are accepted (float-rounding regression)', async () => {
  // 19.99 * 100 is 1998.9999999999998 in binary floating point; the API
  // must not reject this everyday amount with a 400.
  // Uses a fresh person so later tests' balance totals are unaffected.
  const person = await req(srv.base, 'POST', '/api/people', { name: 'Chai Tester' });
  assert.equal(person.status, 201);
  const r = await req(srv.base, 'POST', '/api/expenses', {
    title: 'Chai 19.99',
    category: 'food',
    amount: 19.99,
    payer_id: ids.self.id,
    expense_date: '2026-10-20', // October: keeps November totals pinned by other tests intact
    splits: [{ person_id: person.json.person.id }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.expense.amount_paisa, 1999);
  assert.equal(r.json.expense.splits[0].amount_paisa, 1999);
});

test('expenses: search and filters work', async () => {
  const byText = await req(srv.base, 'GET', '/api/expenses?q=Mess%20dinner');
  assert.ok(byText.json.expenses.length >= 1);
  assert.ok(byText.json.expenses.every((e) => e.title.includes('Mess dinner')));
  const byCat = await req(srv.base, 'GET', '/api/expenses?category=transport');
  assert.ok(byCat.json.expenses.every((e) => e.category === 'transport'));
  const byPerson = await req(srv.base, 'GET', `/api/expenses?person_id=${ids.ali.id}`);
  assert.ok(byPerson.json.expenses.length >= 1);
  const byDate = await req(srv.base, 'GET', '/api/expenses?from=2026-11-11&to=2026-11-11');
  assert.ok(byDate.json.expenses.every((e) => e.expense_date === '2026-11-11'));
  const badCat = await req(srv.base, 'GET', '/api/expenses?category=nope');
  assert.equal(badCat.status, 400);
});

test('settlements: partial settlement reduces the balance; over-settlement is rejected', async () => {
  // Ali owes 50000 (dinner) + 70000 (good split) = 120000 at this point.
  const over = await req(srv.base, 'POST', '/api/settlements', {
    person_id: ids.ali.id, amount: 999999, direction: 'in', method: 'cash', settlement_date: '2026-11-19',
  });
  assert.equal(over.status, 400);
  assert.match(over.json.error.message, /exceeds the outstanding/);

  const ok = await req(srv.base, 'POST', '/api/settlements', {
    person_id: ids.ali.id, amount: 200, direction: 'in', method: 'jazzcash', settlement_date: '2026-11-19',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.settlement.amount_paisa, 20000);

  const one = await req(srv.base, 'GET', `/api/balances/${ids.ali.id}`);
  assert.equal(one.json.balance.net_paisa, 100000); // 120000 - 20000
});

test('settlements: validation rejects bad direction and method', async () => {
  const bad = await req(srv.base, 'POST', '/api/settlements', {
    person_id: ids.ali.id, amount: 10, direction: 'sideways', method: 'cash', settlement_date: '2026-11-19',
  });
  assert.equal(bad.status, 400);
  const badMethod = await req(srv.base, 'POST', '/api/settlements', {
    person_id: ids.ali.id, amount: 10, direction: 'in', method: 'gold', settlement_date: '2026-11-19',
  });
  assert.equal(badMethod.status, 400);
});

test('budgets: upsert and overspend warning on the dashboard', async () => {
  const created = await req(srv.base, 'POST', '/api/budgets', { category: 'food', month: '2026-11', limit: 500 });
  assert.equal(created.status, 201);
  // Food spend in Nov 2026 is already 1000 (Mess dinner) -> over budget.
  const dash = await req(srv.base, 'GET', '/api/dashboard?month=2026-11');
  assert.equal(dash.status, 200);
  const food = dash.json.budgets.find((b) => b.category === 'food');
  assert.ok(food);
  assert.equal(food.over, true);
  assert.equal(food.spent_paisa, 100000);
  assert.equal(food.limit_paisa, 50000);
  assert.equal(dash.json.totals.monthly_spend_paisa, 200000); // 1000 + 1000
  assert.ok(dash.json.top_debtors.length >= 1);
  assert.equal(dash.json.top_debtors[0].name, 'Ali');
});

test('budgets: invalid month rejected', async () => {
  const r = await req(srv.base, 'POST', '/api/budgets', { category: 'food', month: '2026-13', limit: 100 });
  assert.equal(r.status, 400);
});

test('recurring: create and generate due expenses', async () => {
  const created = await req(srv.base, 'POST', '/api/recurring', {
    title: 'Mess bill',
    category: 'food',
    amount: 3000,
    payer_id: ids.self.id,
    frequency: 'monthly',
    day_of_month: 1,
    split_person_ids: [ids.ali.id, ids.bilal.id],
    next_due_date: '2026-11-01',
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.recurring.frequency, 'monthly');

  const gen = await req(srv.base, 'POST', '/api/recurring/generate-due', {});
  assert.equal(gen.status, 200);
  assert.equal(gen.json.generated, 1);
  assert.equal(gen.json.expenses[0].title, 'Mess bill');

  const again = await req(srv.base, 'POST', '/api/recurring/generate-due', {});
  assert.equal(again.json.generated, 0); // next due moved to Dec, nothing due

  const badFreq = await req(srv.base, 'POST', '/api/recurring', {
    title: 'X', category: 'food', amount: 100, payer_id: ids.self.id,
    frequency: 'monthly', next_due_date: '2026-11-01',
  });
  assert.equal(badFreq.status, 400); // monthly needs day_of_month
});

test('invoices: itemised text plus WhatsApp link', async () => {
  // Ali owes: 500 (dinner) + 700 (good split) + 1500 (generated mess bill)
  // minus the 200 settlement = 2500 outstanding.
  const r = await req(srv.base, 'GET', `/api/invoices/${ids.ali.id}`);
  assert.equal(r.status, 200);
  assert.match(r.json.invoice.text, /Ali/);
  assert.match(r.json.invoice.text, /Rs 2,500\.00/);
  assert.ok(r.json.invoice.whatsapp_url.startsWith('https://wa.me/03001112222?text='));
  assert.equal(r.json.invoice.outstanding_owed_to_me_paisa, 250000);
});

test('udhaar due dates: overdue split shows up', async () => {
  await req(srv.base, 'POST', '/api/expenses', {
    title: 'Old lend',
    category: 'other',
    amount: 500,
    payer_id: ids.self.id,
    expense_date: '2026-10-01',
    due_date: '2026-10-05',
    splits: [{ person_id: ids.bilal.id }],
  });
  const r = await req(srv.base, 'GET', '/api/udhaar/due?days=7');
  assert.equal(r.status, 200);
  const found = r.json.due.find((d) => d.title === 'Old lend');
  assert.ok(found);
  assert.equal(found.overdue, true);
  assert.equal(found.remaining_paisa, 50000);

  const badDays = await req(srv.base, 'GET', '/api/udhaar/due?days=9999');
  assert.equal(badDays.status, 400);
});

test('export: CSV downloads with headers and escaped fields', async () => {
  const exp = await req(srv.base, 'GET', '/api/export/expenses.csv');
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-type'), /text\/csv/);
  assert.match(exp.headers.get('content-disposition'), /expenses\.csv/);
  assert.match(exp.text, /^id,title,category,amount_pkr,payer,expense_date,notes\r\n/);
  assert.match(exp.text, /Mess dinner/);

  const bal = await req(srv.base, 'GET', '/api/export/balances.csv');
  assert.equal(bal.status, 200);
  assert.match(bal.text, /^person,owed_to_me_pkr,i_owe_pkr,net_pkr\r\n/);
  assert.match(bal.text, /Ali,2500\.00,0\.00,2500\.00/);

  const stl = await req(srv.base, 'GET', '/api/export/settlements.csv');
  assert.equal(stl.status, 200);
  assert.match(stl.text, /jazzcash/);
});

test('errors: unknown routes and bad JSON give safe errors without stacks', async () => {
  const r = await req(srv.base, 'GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.message, 'Not found.');
  assert.equal(JSON.stringify(r.json).includes('stack'), false);

  const res = await fetch(`${srv.base}/api/people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.message, 'Invalid JSON in request body.');
});

test('security headers are present', async () => {
  const r = await req(srv.base, 'GET', '/api/health');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.ok(r.headers.get('content-security-policy'));
  assert.equal(r.headers.get('x-powered-by'), null);
});
