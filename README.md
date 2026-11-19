# Udhaar Tracker

A khata-style expense + udhaar (informal credit) ledger for Pakistani hostel
students, in Pakistani rupees (PKR).

- **Expenses by category** — food, mess, transport, rent, utilities and more.
- **Who owes whom** — split any expense between people; every split is an
  udhaar entry against the payer.
- **Settlements** — record cash / bank / JazzCash / Easypaisa payments and
  watch balances settle. Over-settlements are rejected.
- **Per-person balances** — who owes me, who I owe, and the net for each
  person, plus overall totals.
- **Itemised invoices** — per-person invoice text with a one-tap WhatsApp
  share link (`wa.me` with the invoice prefilled).
- **Monthly budgets per category** — with overspend warnings on the
  dashboard (warns at 80% used, flags when over).
- **Recurring expenses** — weekly/monthly templates (e.g. mess bill) that
  generate real expenses when due.
- **Dashboard summaries** — monthly spend, category breakdown, top debtors,
  aging of old udhaar (0–30 / 31–60 / 61–90 / 90+ days), overdue & upcoming
  dues.
- **Search & filter** — for transactions and people; **CSV export** for
  expenses, settlements and balances.
- **Due-date tracking** — due dates on udhaar entries, overdue list included.

## Quick start

Requires **Node.js 22+** (uses the built-in `node:sqlite`, no native
add-ons). No other services needed.

```bash
npm install
npm start          # http://127.0.0.1:3000
```

Development (auto-restart on change):

```bash
npm run dev
```

Tests (unit + API, using Node's built-in test runner):

```bash
npm test
```

Environment variables (all optional):

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `DB_PATH` | `./data/udhaar.db` | SQLite file (`:memory:` for ephemeral runs) |
| `NODE_ENV` | `development` | `production` silences nothing extra; errors stay safe either way |

## Folder map

```
udhaar-tracker/
├── src/
│   ├── index.js            # entry point: starts the HTTP server
│   ├── app.js              # Express app factory (used by server + tests)
│   ├── config.js           # env-based config, no secrets
│   ├── db/
│   │   ├── index.js        # node:sqlite setup (WAL, foreign keys on)
│   │   └── migrations.js   # schema + "Me" owner seed
│   ├── models/             # data access (parameterised queries only)
│   │   ├── people.js       # contacts
│   │   ├── expenses.js     # expenses + splits (udhaar entries)
│   │   ├── settlements.js  # payments
│   │   ├── budgets.js      # monthly budgets per category
│   │   └── recurring.js    # recurring expense templates
│   ├── services/           # pure business logic (unit-tested, no DB)
│   │   ├── balances.js     # who-owes-whom math, FIFO aging
│   │   ├── invoices.js     # invoice text + wa.me link
│   │   ├── dashboard.js    # dashboard summaries
│   │   └── recurring.js    # due-template generation
│   ├── routes/             # REST API (validation on every endpoint)
│   │   ├── people.js  expenses.js  settlements.js  balances.js
│   │   ├── budgets.js  recurring.js  dashboard.js  invoices.js
│   │   ├── export.js  udhaar.js  common.js
│   ├── middleware/
│   │   ├── validate.js     # input validators (types, ranges, lengths)
│   │   ├── errors.js       # safe error responses, no stack traces
│   │   └── security.js     # security headers + rate limiting
│   └── utils/
│       ├── money.js        # integer-paisa money (never floats)
│       ├── dates.js        # strict ISO date handling
│       ├── escape.js       # HTML / CSV escaping, phone digits
│       └── errors.js       # AppError type
├── public/                 # frontend (no framework, no build step)
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── api.js          # fetch wrapper
│       ├── ui.js           # DOM helpers (textContent only - no innerHTML)
│       └── app.js          # tabs, forms, lists, invoice dialog
├── tests/
│   ├── helpers.js          # ephemeral test server (fresh in-memory DB)
│   ├── unit.test.js        # balance/settlement math, validation, invoices
│   └── api.test.js         # end-to-end HTTP tests for all main endpoints
├── docs/
│   └── API.md              # full endpoint reference
├── .github/workflows/ci.yml  # GitHub Actions: npm ci + npm test on Node 24
├── .gitignore  LICENSE (MIT)  package.json  README.md
```

## API at a glance

| Area | Endpoints |
| ---- | --------- |
| People | `GET/POST /api/people`, `GET/PUT/DELETE /api/people/:id` |
| Expenses | `GET /api/expenses` (search/filter), `GET/POST /api/expenses`, `DELETE /api/expenses/:id` |
| Settlements | `GET/POST /api/settlements`, `GET/DELETE /api/settlements/:id` |
| Balances | `GET /api/balances`, `GET /api/balances/:personId` |
| Budgets | `GET/POST /api/budgets`, `DELETE /api/budgets/:id` |
| Recurring | `GET/POST /api/recurring`, `GET/PUT/DELETE /api/recurring/:id`, `POST /api/recurring/generate-due` |
| Dashboard | `GET /api/dashboard?month=YYYY-MM` |
| Invoices | `GET /api/invoices/:personId` |
| Due dates | `GET /api/udhaar/due?days=7` |
| CSV export | `GET /api/export/{expenses,settlements,balances}.csv` |

Full reference with request/response shapes: [`docs/API.md`](docs/API.md).

## How money works

All money is stored as **integer paisa** (Rs 250.50 → `25050`) so there are
no floating-point rounding errors. The API accepts PKR decimals (max 2
decimal places, max Rs 10,000,000 per amount) and converts them
server-side. Split shares are computed in paisa; any remainder paisa from
an equal split goes to the first split so shares always sum exactly to the
expense total.

## Security

This app is a **single-user local tool**. It is designed to run on
`127.0.0.1` (localhost). There is no login system — if you expose it on a
network, put it behind a reverse proxy with authentication (and HTTPS).

What is hardened in the code:

- **All inputs validated** on every endpoint — types, ranges, lengths,
  enums, strict `YYYY-MM-DD` dates (impossible dates like 2026-02-30 are
  rejected), money as finite numbers with ≤ 2 decimals.
- **Parameterized queries only** — every SQL statement uses bound
  parameters; user input is never concatenated into SQL. A test proves an
  attempted `'; DROP TABLE people; --` input is stored harmlessly as text.
- **No XSS** — the frontend renders all user data with `textContent`
  (never `innerHTML` with user data); the server escapes HTML/CSV output
  where strings are composed.
- **No secrets in code** — configuration comes from environment variables;
  `.env` files are git-ignored.
- **No `eval()`**, no dynamic code execution, no deserialization of
  untrusted data.
- **Safe errors** — clients receive `{error: {message}}` only. Stack traces
  and internals are logged server-side, never sent. Tested: error bodies
  contain no `stack` field.
- **Security headers** — `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, a restrictive Content-Security-Policy,
  `Referrer-Policy: no-referrer`, and a `Permissions-Policy` that disables
  camera/mic/geolocation. `X-Powered-By` is disabled.
- **Rate limiting** — 600 requests per 15 minutes per IP (generous for
  local use, blocks runaway scripts).
- **Body size cap** — JSON bodies over 100 KB are rejected.
- **Business-rule guards** — settlements cannot exceed the outstanding
  amount; split amounts must sum exactly to the expense total; deleting a
  person with history is blocked (409).

If you find a security issue, please report it rather than exploiting it —
see `SECURITY.md` if one exists in the repo, otherwise open an issue.

## License

MIT — see [LICENSE](LICENSE).
