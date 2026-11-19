'use strict';

/* Main frontend logic for Udhaar Tracker. All rendering uses ui.el()
   (textContent), never innerHTML with user data. */

const CATEGORIES = ['food', 'transport', 'rent', 'utilities', 'groceries', 'entertainment', 'health', 'education', 'shopping', 'other'];

const state = { people: [], month: new Date().toISOString().slice(0, 7) };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fillCategorySelect(select, includeAll = false) {
  ui.clear(select);
  if (includeAll) select.appendChild(ui.el('option', 'All categories', { value: '' }));
  for (const c of CATEGORIES) select.appendChild(ui.el('option', c, { value: c }));
}

function fillPeopleSelect(select, includeSelf = true) {
  ui.clear(select);
  const list = includeSelf ? state.people : state.people.filter((p) => !p.is_self);
  for (const p of list) select.appendChild(ui.el('option', p.name, { value: String(p.id) }));
}

async function refreshPeople() {
  const data = await api.get('/api/people');
  state.people = data.people;
}

function personName(id) {
  const p = state.people.find((x) => x.id === id);
  return p ? p.name : `#${id}`;
}

/* ---------- Tabs ---------- */
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
  if (btn.dataset.tab === 'dashboard') loadDashboard();
  if (btn.dataset.tab === 'balances') loadBalances();
});

/* ---------- Dashboard ---------- */
async function loadDashboard() {
  try {
    const d = await api.get(`/api/dashboard?month=${state.month}`);
    document.getElementById('dash-month').textContent = `(${d.month})`;
    const cards = document.getElementById('dash-cards');
    ui.clear(cards);
    const cardData = [
      ['Monthly spend', d.totals.monthly_spend_paisa, ''],
      ['Owed to me', d.totals.total_owed_to_me_paisa, 'good'],
      ['I owe', d.totals.total_i_owe_paisa, 'over'],
      ['Overdue udhaar', d.overdue_paisa, d.overdue_count ? 'warn' : ''],
    ];
    for (const [label, paisa, cls] of cardData) {
      const card = ui.el('div', null, { className: `card ${cls}` });
      card.appendChild(ui.el('div', label, { className: 'label' }));
      card.appendChild(ui.el('div', ui.formatPkr(paisa), { className: 'value' }));
      cards.appendChild(card);
    }

    const cats = document.getElementById('dash-categories');
    ui.clear(cats);
    if (d.category_breakdown.length === 0) cats.appendChild(ui.el('p', 'No spending this month yet.', { className: 'muted' }));
    for (const c of d.category_breakdown) {
      const row = ui.el('div');
      row.appendChild(ui.el('strong', `${c.category}: `));
      row.appendChild(document.createTextNode(`${ui.formatPkr(c.total_paisa)} (${c.count} expenses)`));
      cats.appendChild(row);
    }

    const debtors = document.getElementById('dash-debtors');
    ui.clear(debtors);
    if (d.top_debtors.length === 0) debtors.appendChild(ui.el('p', 'Nobody owes you right now.', { className: 'muted' }));
    for (const t of d.top_debtors) {
      debtors.appendChild(ui.el('div', `${t.name} owes ${ui.formatPkr(t.net_paisa)}`));
    }

    const budgets = document.getElementById('dash-budgets');
    ui.clear(budgets);
    const warnings = d.budgets.filter((b) => b.warning);
    if (warnings.length === 0) budgets.appendChild(ui.el('p', 'All budgets on track.', { className: 'muted' }));
    for (const b of warnings) {
      const row = ui.el('div', `${b.category}: spent ${ui.formatPkr(b.spent_paisa)} of ${ui.formatPkr(b.limit_paisa)} (${b.percent_used}%)`, { className: b.over ? 'over' : '' });
      budgets.appendChild(row);
    }

    const aging = document.getElementById('dash-aging');
    ui.clear(aging);
    for (const [bucket, paisa] of Object.entries(d.aging.owed_to_me)) {
      aging.appendChild(ui.el('div', `Owed to me, ${bucket} days old: ${ui.formatPkr(paisa)}`));
    }

    const due = document.getElementById('dash-due');
    ui.clear(due);
    if (d.upcoming_due.length === 0 && d.overdue_count === 0) due.appendChild(ui.el('p', 'Nothing due soon.', { className: 'muted' }));
    for (const item of d.upcoming_due) {
      due.appendChild(ui.el('div', `${personName(item.person_id)} - ${item.title} - due ${item.due_date} - ${ui.formatPkr(item.remaining_paisa)}`));
    }
  } catch (err) {
    ui.toast(err.message, true);
  }
}

/* ---------- People ---------- */
async function loadPeople() {
  const q = document.getElementById('people-search').value.trim();
  const data = await api.get(`/api/people${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const list = document.getElementById('people-list');
  ui.clear(list);
  for (const p of data.people) {
    const li = ui.el('li');
    const left = ui.el('div');
    left.appendChild(ui.el('strong', p.name + (p.is_self ? ' (Me)' : '')));
    if (p.phone) left.appendChild(ui.el('div', p.phone, { className: 'meta' }));
    if (p.email) left.appendChild(ui.el('div', p.email, { className: 'meta' }));
    li.appendChild(left);
    const actions = ui.el('div');
    if (!p.is_self) {
      const invoiceBtn = ui.el('button', 'Invoice', { className: 'secondary', type: 'button' });
      invoiceBtn.addEventListener('click', () => showInvoice(p.id));
      actions.appendChild(invoiceBtn);
      const delBtn = ui.el('button', 'Delete', { className: 'secondary', type: 'button' });
      delBtn.addEventListener('click', async () => {
        try {
          await api.del(`/api/people/${p.id}`);
          ui.toast('Person deleted.');
          await afterPeopleChange();
        } catch (err) {
          ui.toast(err.message, true);
        }
      });
      actions.appendChild(delBtn);
    }
    li.appendChild(actions);
    list.appendChild(li);
  }
}

async function afterPeopleChange() {
  await refreshPeople();
  fillPeopleSelect(document.getElementById('expense-payer'));
  fillPeopleSelect(document.getElementById('settlement-person'), false);
  fillPeopleSelect(document.getElementById('recurring-payer'));
  renderSplitCheckboxes();
  await loadPeople();
}

document.getElementById('people-search').addEventListener('input', () => loadPeople().catch((e) => ui.toast(e.message, true)));

document.getElementById('person-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    name: form.name.value.trim(),
    phone: form.phone.value.trim() || undefined,
    email: form.email.value.trim() || undefined,
    notes: form.notes.value.trim() || undefined,
  };
  try {
    await api.post('/api/people', body);
    form.reset();
    ui.toast('Person added.');
    await afterPeopleChange();
  } catch (err) {
    ui.toast(err.message, true);
  }
});

/* ---------- Expenses ---------- */
function renderSplitCheckboxes() {
  const box = document.getElementById('split-people');
  ui.clear(box);
  for (const p of state.people.filter((x) => !x.is_self)) {
    const label = ui.el('label');
    const cb = ui.el('input', null, { type: 'checkbox', value: String(p.id) });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${p.name}`));
    box.appendChild(label);
  }
}

async function loadExpenses() {
  const q = document.getElementById('exp-search').value.trim();
  const cat = document.getElementById('exp-category-filter').value;
  const from = document.getElementById('exp-from').value;
  const to = document.getElementById('exp-to').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cat) params.set('category', cat);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const data = await api.get(`/api/expenses?${params.toString()}`);
  const list = document.getElementById('expenses-list');
  ui.clear(list);
  if (data.expenses.length === 0) list.appendChild(ui.el('li', 'No expenses found.'));
  for (const ex of data.expenses) {
    const li = ui.el('li');
    const left = ui.el('div');
    left.appendChild(ui.el('strong', `${ex.title} - ${ui.formatPkr(ex.amount_paisa)}`));
    left.appendChild(ui.el('div', `${ex.category} | paid by ${ex.payer_name || personName(ex.payer_id)} | ${ex.expense_date}`, { className: 'meta' }));
    li.appendChild(left);
    const del = ui.el('button', 'Delete', { className: 'secondary', type: 'button' });
    del.addEventListener('click', async () => {
      try {
        await api.del(`/api/expenses/${ex.id}`);
        ui.toast('Expense deleted.');
        await loadExpenses();
        await loadDashboard();
      } catch (err) {
        ui.toast(err.message, true);
      }
    });
    li.appendChild(del);
    list.appendChild(li);
  }
}

document.getElementById('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const checked = [...document.querySelectorAll('#split-people input:checked')].map((cb) => ({ person_id: Number(cb.value) }));
  const body = {
    title: form.title.value.trim(),
    category: form.category.value,
    amount: Number(form.amount.value),
    payer_id: Number(form.payer_id.value),
    expense_date: form.expense_date.value,
    notes: form.notes.value.trim() || undefined,
    splits: checked,
    due_date: form.due_date.value || undefined,
  };
  try {
    await api.post('/api/expenses', body);
    form.reset();
    document.getElementById('expense-date').value = today();
    ui.toast('Expense added.');
    await loadExpenses();
    await loadDashboard();
  } catch (err) {
    ui.toast(err.message, true);
  }
});

for (const id of ['exp-search', 'exp-category-filter', 'exp-from', 'exp-to']) {
  document.getElementById(id).addEventListener('input', () => loadExpenses().catch((e) => ui.toast(e.message, true)));
}
document.getElementById('exp-export').addEventListener('click', () => {
  window.open('/api/export/expenses.csv', '_blank');
});

/* ---------- Balances & settlements ---------- */
async function loadBalances() {
  try {
    const data = await api.get('/api/balances');
    const totals = document.getElementById('balance-totals');
    ui.clear(totals);
    const cards = [
      ['Total owed to me', data.totals.total_owed_to_me_paisa],
      ['Total I owe', data.totals.total_i_owe_paisa],
      ['Net', data.totals.net_total_paisa],
    ];
    for (const [label, paisa] of cards) {
      const card = ui.el('div', null, { className: 'card' });
      card.appendChild(ui.el('div', label, { className: 'label' }));
      card.appendChild(ui.el('div', ui.formatPkr(paisa), { className: 'value' }));
      totals.appendChild(card);
    }
    const list = document.getElementById('balances-list');
    ui.clear(list);
    for (const b of data.balances) {
      if (b.net_paisa === 0 && b.owed_to_me_paisa === 0 && b.i_owe_paisa === 0) continue;
      const li = ui.el('li');
      const left = ui.el('div');
      const text = b.net_paisa > 0
        ? `${b.person.name} owes me ${ui.formatPkr(b.net_paisa)}`
        : b.net_paisa < 0
          ? `I owe ${b.person.name} ${ui.formatPkr(-b.net_paisa)}`
          : `${b.person.name} - settled`;
      left.appendChild(ui.el('strong', text));
      left.appendChild(ui.el('div', `Owed to me: ${ui.formatPkr(b.outstanding_owed_to_me_paisa)} | I owe: ${ui.formatPkr(b.outstanding_i_owe_paisa)}`, { className: 'meta' }));
      li.appendChild(left);
      const btn = ui.el('button', 'Invoice', { className: 'secondary', type: 'button' });
      btn.addEventListener('click', () => showInvoice(b.person.id));
      li.appendChild(btn);
      list.appendChild(li);
    }
    const st = await api.get('/api/settlements?limit=20');
    const slist = document.getElementById('settlements-list');
    ui.clear(slist);
    for (const s of st.settlements) {
      const li = ui.el('li');
      li.appendChild(ui.el('div', `${s.direction === 'in' ? 'Received from' : 'Paid to'} ${s.person_name}: ${ui.formatPkr(s.amount_paisa)} (${s.method}, ${s.settlement_date})`));
      slist.appendChild(li);
    }
  } catch (err) {
    ui.toast(err.message, true);
  }
}

document.getElementById('settlement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    person_id: Number(form.person_id.value),
    amount: Number(form.amount.value),
    direction: form.direction.value,
    method: form.method.value,
    settlement_date: form.settlement_date.value,
  };
  try {
    await api.post('/api/settlements', body);
    form.reset();
    document.getElementById('settlement-date').value = today();
    ui.toast('Settlement recorded.');
    await loadBalances();
  } catch (err) {
    ui.toast(err.message, true);
  }
});
document.getElementById('balances-export').addEventListener('click', () => window.open('/api/export/balances.csv', '_blank'));

/* ---------- Invoices ---------- */
async function showInvoice(personId) {
  try {
    const data = await api.get(`/api/invoices/${personId}`);
    const inv = data.invoice;
    document.getElementById('invoice-title').textContent = `Invoice - ${inv.person.name}`;
    document.getElementById('invoice-text').textContent = inv.text;
    const link = document.getElementById('invoice-whatsapp');
    if (inv.whatsapp_url) {
      link.href = inv.whatsapp_url;
      link.style.display = '';
    } else {
      link.style.display = 'none';
    }
    document.getElementById('invoice-dialog').showModal();
  } catch (err) {
    ui.toast(err.message, true);
  }
}
document.getElementById('invoice-close').addEventListener('click', () => document.getElementById('invoice-dialog').close());

/* ---------- Budgets ---------- */
async function loadBudgets() {
  const data = await api.get(`/api/budgets?month=${state.month}`);
  const list = document.getElementById('budgets-list');
  ui.clear(list);
  if (data.budgets.length === 0) list.appendChild(ui.el('li', `No budgets for ${state.month} yet.`));
  for (const b of data.budgets) {
    const li = ui.el('li');
    const text = `${b.category}: limit ${ui.formatPkr(b.limit_paisa)} | spent ${ui.formatPkr(b.spent_paisa || 0)} (${b.percent_used || 0}%)`;
    li.appendChild(ui.el('div', text, { className: b.over ? 'over' : '' }));
    const del = ui.el('button', 'Delete', { className: 'secondary', type: 'button' });
    del.addEventListener('click', async () => {
      try {
        await api.del(`/api/budgets/${b.id}`);
        ui.toast('Budget deleted.');
        await loadBudgets();
      } catch (err) {
        ui.toast(err.message, true);
      }
    });
    li.appendChild(del);
    list.appendChild(li);
  }
}

document.getElementById('budget-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await api.post('/api/budgets', { category: form.category.value, month: form.month.value, limit: Number(form.limit.value) });
    form.reset();
    document.getElementById('budget-month').value = state.month;
    ui.toast('Budget saved.');
    await loadBudgets();
    await loadDashboard();
  } catch (err) {
    ui.toast(err.message, true);
  }
});

/* ---------- Recurring ---------- */
async function loadRecurring() {
  const data = await api.get('/api/recurring');
  const list = document.getElementById('recurring-list');
  ui.clear(list);
  if (data.recurring.length === 0) list.appendChild(ui.el('li', 'No recurring expenses yet.'));
  for (const r of data.recurring) {
    const li = ui.el('li');
    li.appendChild(ui.el('div', `${r.title} - ${ui.formatPkr(r.amount_paisa)} (${r.frequency}, next due ${r.next_due_date})${r.active ? '' : ' [paused]'}`));
    const actions = ui.el('div');
    const toggle = ui.el('button', r.active ? 'Pause' : 'Resume', { className: 'secondary', type: 'button' });
    toggle.addEventListener('click', async () => {
      try {
        await api.put(`/api/recurring/${r.id}`, { active: !r.active });
        await loadRecurring();
      } catch (err) { ui.toast(err.message, true); }
    });
    actions.appendChild(toggle);
    const del = ui.el('button', 'Delete', { className: 'secondary', type: 'button' });
    del.addEventListener('click', async () => {
      try {
        await api.del(`/api/recurring/${r.id}`);
        await loadRecurring();
      } catch (err) { ui.toast(err.message, true); }
    });
    actions.appendChild(del);
    li.appendChild(actions);
    list.appendChild(li);
  }
}

document.getElementById('recurring-frequency').addEventListener('change', (e) => {
  const weekly = e.target.value === 'weekly';
  document.getElementById('recurring-dom').disabled = weekly;
  document.getElementById('recurring-dow').disabled = !weekly;
});

document.getElementById('recurring-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    title: form.title.value.trim(),
    category: form.category.value,
    amount: Number(form.amount.value),
    payer_id: Number(form.payer_id.value),
    frequency: form.frequency.value,
    next_due_date: form.next_due_date.value,
  };
  if (body.frequency === 'monthly') body.day_of_month = Number(form.day_of_month.value);
  else body.day_of_week = Number(form.day_of_week.value);
  try {
    await api.post('/api/recurring', body);
    form.reset();
    ui.toast('Recurring expense added.');
    await loadRecurring();
  } catch (err) {
    ui.toast(err.message, true);
  }
});

document.getElementById('generate-due').addEventListener('click', async () => {
  try {
    const data = await api.post('/api/recurring/generate-due', {});
    ui.toast(`${data.generated} due expense(s) generated.`);
    await loadRecurring();
    await loadExpenses();
    await loadDashboard();
  } catch (err) {
    ui.toast(err.message, true);
  }
});

/* ---------- Init ---------- */
(async function init() {
  fillCategorySelect(document.getElementById('expense-category'));
  fillCategorySelect(document.getElementById('exp-category-filter'), true);
  fillCategorySelect(document.getElementById('budget-category'));
  fillCategorySelect(document.getElementById('recurring-category'));
  document.getElementById('expense-date').value = today();
  document.getElementById('settlement-date').value = today();
  document.getElementById('budget-month').value = state.month;
  try {
    await refreshPeople();
    fillPeopleSelect(document.getElementById('expense-payer'));
    fillPeopleSelect(document.getElementById('settlement-person'), false);
    fillPeopleSelect(document.getElementById('recurring-payer'));
    renderSplitCheckboxes();
    await loadDashboard();
    await loadPeople();
    await loadExpenses();
    await loadBudgets();
    await loadRecurring();
  } catch (err) {
    ui.toast(err.message, true);
  }
})();
