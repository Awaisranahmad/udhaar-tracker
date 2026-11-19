# Udhaar Tracker API

Base URL: `http://127.0.0.1:3000` (default). All responses are JSON unless
noted. Errors always look like:

```json
{ "error": { "message": "Validation failed.", "details": [{ "field": "amount", "message": "..." }] } }
```

Money is sent as PKR decimal numbers (`amount: 250.5`) and stored as integer
paisa. Responses include both `amount_paisa` and `amount` (PKR).

## Health

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | `{"status":"ok", ...}` |

## People

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/people?q=` | List people (optional name/phone search) |
| GET | `/api/people/:id` | One person |
| POST | `/api/people` | Create: `{name*, phone?, email?, notes?}` |
| PUT | `/api/people/:id` | Update (same fields) |
| DELETE | `/api/people/:id` | Delete (blocked if referenced by expenses/splits/settlements) |

The owner record (`is_self: true`, named "Me") is seeded automatically and
cannot be edited or deleted through the API.

## Expenses & splits

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/expenses?q=&category=&from=&to=&person_id=&limit=&offset=` | Search/filter |
| GET | `/api/expenses/:id` | One expense with splits |
| POST | `/api/expenses` | Create (see below) |
| DELETE | `/api/expenses/:id` | Delete (splits cascade) |

Create body:

```json
{
  "title": "Mess dinner",
  "category": "food",
  "amount": 1000,
  "payer_id": 1,
  "expense_date": "2026-11-10",
  "notes": "optional",
  "due_date": "2026-11-20",
  "splits": [{ "person_id": 2 }, { "person_id": 3, "amount": 300 }]
}
```

- `category` must be one of: `food, transport, rent, utilities, groceries,
  entertainment, health, education, shopping, other`.
- Splits without `amount` share the remainder equally (paisa remainder goes
  to the first split). Splits with amounts must sum exactly to `amount`.
- A split against the payer themselves is ignored (you cannot owe yourself).
- `due_date` (optional) sets the due date for splits that don't set their own.

## Settlements

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/settlements?person_id=&direction=&from=&to=` | List |
| GET | `/api/settlements/:id` | One settlement |
| POST | `/api/settlements` | Create |
| DELETE | `/api/settlements/:id` | Delete |

Create body: `{person_id*, amount*, direction*: "in"|"out",
method*: "cash"|"bank"|"jazzcash"|"easypaisa"|"other", settlement_date*,
note?}`. `direction: "in"` = they paid me; `"out"` = I paid them. A
settlement larger than the outstanding amount in that direction is rejected
(400).

## Balances

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/balances` | Every person's balance + totals |
| GET | `/api/balances/:personId` | One person's balance |

Balance fields: `owed_to_me_paisa`, `i_owe_paisa`, `received_paisa`,
`paid_paisa`, `outstanding_owed_to_me_paisa`, `outstanding_i_owe_paisa`,
`net_paisa` (positive = they owe me).

## Budgets

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/budgets?month=YYYY-MM` | List (with spent/% when month given) |
| POST | `/api/budgets` | Upsert `{category*, month*, limit*}` |
| DELETE | `/api/budgets/:id` | Delete |

## Recurring expenses

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/recurring?active=` | List templates |
| GET | `/api/recurring/:id` | One template |
| POST | `/api/recurring` | Create: `{title*, category*, amount*, payer_id*, frequency*: "weekly"\|"monthly", day_of_week? (0-6, weekly), day_of_month? (1-31, monthly), split_person_ids?, next_due_date*}` |
| PUT | `/api/recurring/:id` | Update `{title?, active?, next_due_date?, amount?}` |
| DELETE | `/api/recurring/:id` | Delete |
| POST | `/api/recurring/generate-due` | Create expenses for all due templates and advance them |

## Dashboard

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/dashboard?month=YYYY-MM` | Monthly spend, category breakdown, top debtors, aging buckets, budget warnings, overdue/upcoming |

## Invoices

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/invoices/:personId` | Itemised invoice text + `whatsapp_url` (wa.me link, null when the person has no phone) |

## Udhaar due dates

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/udhaar/due?days=7` | Overdue + due-within-N-days splits (what others owe me) |

## CSV export

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/export/expenses.csv` | All expenses |
| GET | `/api/export/settlements.csv` | All settlements |
| GET | `/api/export/balances.csv` | Balances + totals row |

## Validation & errors

- `400` — invalid input (per-field details included).
- `404` — unknown route or id.
- `409` — conflict (e.g. deleting a person with history).
- `429` — rate limit (600 requests / 15 min per IP).
- `500` — generic "Internal server error." (details are logged server-side
  only, never sent to clients).
