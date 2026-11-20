'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isValidMoneyInput, toPaisa, toPkr, formatPkr } = require('../src/utils/money');
const { isValidDateString, addDays, addMonths, daysBetween } = require('../src/utils/dates');
const { escapeHtml, escapeCsv, digitsOnly } = require('../src/utils/escape');
const { computeBalances, maxSettleable, applyPaymentsFifo, agingBuckets } = require('../src/services/balances');
const { buildInvoiceText, whatsappUrl } = require('../src/services/invoices');
const { nextDueDate } = require('../src/services/recurring');
const { v } = require('../src/middleware/validate');

test('money: validates PKR input and converts to exact paisa', () => {
  assert.equal(isValidMoneyInput(250.5), true);
  assert.equal(isValidMoneyInput(0), false);
  assert.equal(isValidMoneyInput(-10), false);
  assert.equal(isValidMoneyInput(10.005), false); // more than 2 decimals
  assert.equal(isValidMoneyInput('100'), false); // must be a number, not a string
  assert.equal(isValidMoneyInput(Number.NaN), false);
  assert.equal(isValidMoneyInput(10000001), false); // over the cap
  assert.equal(toPaisa(250.5), 25050);
  assert.equal(toPkr(25050), 250.5);
  assert.equal(formatPkr(25050), 'Rs 250.50');
  assert.equal(formatPkr(-150000), '-Rs 1,500.00');
  assert.equal(formatPkr(0), 'Rs 0.00');
});

test('money: valid 2-decimal amounts are not rejected by float rounding', () => {
  // Regression: 19.99 * 100 is 1998.9999999999998 in binary floating point,
  // so the old exact-integer check rejected these everyday amounts.
  assert.equal(isValidMoneyInput(19.99), true);
  assert.equal(isValidMoneyInput(0.29), true);
  assert.equal(isValidMoneyInput(0.07), true);
  assert.equal(isValidMoneyInput(499.95), true);
  assert.equal(toPaisa(19.99), 1999);
  assert.equal(toPaisa(0.29), 29);
  // Still rejected: 3 decimals, and values too small to be even 1 paisa.
  assert.equal(isValidMoneyInput(1.005), false);
  assert.equal(isValidMoneyInput(0.001), false);
  assert.equal(isValidMoneyInput(0.0000001), false);
});

test('dates: rejects impossible calendar dates', () => {
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('2026-13-01'), false);
  assert.equal(isValidDateString('2026-11-19'), true);
  assert.equal(isValidDateString('19-11-2026'), false);
  assert.equal(isValidDateString(20261119), false);
  assert.equal(addDays('2026-11-19', 7), '2026-11-26');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28'); // clamped, not Mar 3
  assert.equal(daysBetween('2026-11-01', '2026-11-19'), 18);
  assert.equal(daysBetween('2026-11-19', '2026-11-01'), -18);
});

test('escape: HTML and CSV escaping neutralise hostile input', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a & b "c"'), 'a &amp; b &quot;c&quot;');
  assert.equal(escapeCsv('plain'), 'plain');
  assert.equal(escapeCsv('has,comma'), '"has,comma"');
  assert.equal(escapeCsv('has "quote"'), '"has ""quote"""');
  assert.equal(escapeCsv('line\nbreak'), '"line\nbreak"');
  assert.equal(digitsOnly('+92 301-715 5932'), '923017155932');
  assert.equal(digitsOnly('0301abc'), '0301');
});

test('balances: who-owes-whom math with settlements', () => {
  const people = [
    { id: 1, name: 'Me' },
    { id: 2, name: 'Ali' },
    { id: 3, name: 'Bilal' },
  ];
  // Ali owes me 100000, Bilal owes me 50000; I owe Bilal 20000.
  const splits = [
    { person_id: 2, payer_id: 1, amount_paisa: 100000 },
    { person_id: 3, payer_id: 1, amount_paisa: 50000 },
    { person_id: 1, payer_id: 3, amount_paisa: 20000 },
  ];
  const settlements = [{ person_id: 2, direction: 'in', amount_paisa: 40000 }];
  const { balances, totals } = computeBalances({ people, splits, settlements, selfId: 1 });
  const ali = balances.find((b) => b.person.id === 2);
  const bilal = balances.find((b) => b.person.id === 3);
  assert.equal(ali.net, 60000); // 100000 - 40000
  assert.equal(bilal.net, 30000); // 50000 - 20000
  assert.equal(totals.totalOwedToMe, 110000); // 150000 - 40000
  assert.equal(totals.totalIOwe, 20000);
  assert.equal(totals.netTotal, 90000);
  // Splits between two other people are not my khata.
  const { totals: t2 } = computeBalances({
    people,
    splits: [{ person_id: 3, payer_id: 2, amount_paisa: 99999 }],
    settlements: [],
    selfId: 1,
  });
  assert.equal(t2.totalOwedToMe, 0);
  assert.equal(t2.totalIOwe, 0);
});

test('balances: settlement cannot exceed what is outstanding', () => {
  const row = { outstandingOwedToMe: 60000, outstandingIOwe: 0 };
  assert.equal(maxSettleable(row, 'in'), 60000);
  assert.equal(maxSettleable(row, 'out'), 0);
  assert.equal(maxSettleable(null, 'in'), 0);
});

test('balances: FIFO payments and aging buckets', () => {
  const splits = [
    { id: 1, expense_date: '2026-09-01', amount_paisa: 10000 },
    { id: 2, expense_date: '2026-10-01', amount_paisa: 20000 },
    { id: 3, expense_date: '2026-11-01', amount_paisa: 30000 },
  ];
  const open = applyPaymentsFifo(splits, 15000);
  assert.equal(open.length, 2); // oldest fully paid, second partially
  assert.equal(open[0].id, 2);
  assert.equal(open[0].remaining_paisa, 15000);
  assert.equal(open[1].remaining_paisa, 30000);
  const buckets = agingBuckets(open, '2026-11-19');
  assert.equal(buckets['0-30'], 30000);
  assert.equal(buckets['31-60'], 15000);
  assert.equal(buckets['61-90'], 0);
  assert.equal(buckets['90+'], 0);
  const old = agingBuckets([{ expense_date: '2026-01-01', remaining_paisa: 5000 }], '2026-11-19');
  assert.equal(old['90+'], 5000);
});

test('invoices: itemised text and WhatsApp link', () => {
  const text = buildInvoiceText({
    person: { name: 'Ali' },
    splits: [{ title: 'Mess dinner', expense_date: '2026-11-10', due_date: '2026-11-20', amount_paisa: 25050 }],
    balance: { outstandingOwedToMe: 25050, outstandingIOwe: 0, net: 25050 },
    today: '2026-11-19',
  });
  assert.match(text, /Ali/);
  assert.match(text, /Rs 250\.50/);
  assert.match(text, /due 2026-11-20/);
  assert.match(text, /owes me/);
  const url = whatsappUrl('0301 7155932', 'hello world & friends');
  assert.equal(url, 'https://wa.me/03017155932?text=hello%20world%20%26%20friends');
  assert.equal(whatsappUrl('', 'x'), null);
  assert.equal(whatsappUrl(null, 'x'), null);
});

test('recurring: next due date advances correctly', () => {
  assert.equal(nextDueDate({ frequency: 'weekly' }, '2026-11-19'), '2026-11-26');
  assert.equal(nextDueDate({ frequency: 'monthly' }, '2026-01-31'), '2026-02-28');
  assert.equal(nextDueDate({ frequency: 'monthly' }, '2026-11-15'), '2026-12-15');
});

test('validation: money, splits and enum validators reject bad input', () => {
  assert.ok(v.money('100')); // string is not a valid money input
  assert.ok(v.money(-5));
  assert.ok(v.money(10.005));
  assert.equal(v.money(100), null);
  assert.ok(v.category('bribes'));
  assert.equal(v.category('food'), null);
  assert.ok(v.splits([]));
  assert.ok(v.splits([{ person_id: 2 }, { person_id: 2 }])); // duplicate
  assert.ok(v.splits([{ person_id: 'x' }]));
  assert.equal(v.splits([{ person_id: 2 }, { person_id: 3, amount: 50 }]), null);
  assert.ok(v.date('2026-02-30'));
  assert.equal(v.date('2026-11-19'), null);
  assert.ok(v.month('2026-13'));
  assert.equal(v.month('2026-11'), null);
});
