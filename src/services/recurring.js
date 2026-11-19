'use strict';

/**
 * Recurring-expense generation: creates real expenses for templates whose
 * next_due_date has arrived, then advances each template to its next date.
 * Weekly templates advance 7 days; monthly templates advance one month
 * (clamped to the last day of the month).
 */
const { addDays, addMonths } = require('../utils/dates');

function nextDueDate(template, fromDate) {
  if (template.frequency === 'weekly') return addDays(fromDate, 7);
  return addMonths(fromDate, 1);
}

/**
 * Generate due expenses. Returns the created expenses.
 * `deps`: { recurringModel, expensesModel, today }
 */
function generateDue({ recurringModel, expensesModel, today }) {
  const due = recurringModel.listDue(today);
  const created = [];
  for (const template of due) {
    const splits = (template.split_person_ids || []).map((personId) => ({ person_id: personId }));
    const expense = expensesModel.create({
      title: template.title,
      category: template.category,
      amountPkr: template.amount_paisa / 100,
      payerId: template.payer_id,
      expenseDate: template.next_due_date,
      notes: 'Auto-generated from recurring expense.',
      splits: splits.length > 0 ? splits : [{ person_id: template.payer_id }],
      recurringId: template.id,
    });
    recurringModel.update(template.id, {
      next_due_date: nextDueDate(template, template.next_due_date),
    });
    created.push(expense);
  }
  return created;
}

module.exports = { generateDue, nextDueDate };
