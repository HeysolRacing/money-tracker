# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal finance app for one user in Mexico: bank accounts and credit cards (BBVA, Inbursa, Liverpool, Falabella, Banorte, Sofipos), expenses, invoices (CFDI), statement imports and receipt extraction. **The UI is in Spanish** (es-MX formatting, MXN + USD). The roadmap and data model are in the approved plan; development is phased:

1. foundation ✅
2. ledger ✅
3. documents/extraction
4. invoices
5. statement import
6. budgets/dashboard
7. hardening

## Commands

Everything runs in Docker. On Windows Git Bash, prefix `docker compose exec/run` with `MSYS_NO_PATHCONV=1` when arguments contain paths.

- `docker compose up -d --build` — dev stack (compose.yaml + compose.override.yaml):
  - web (Vite) on 127.0.0.1:5173
  - api (uvicorn --reload) on :8000
  - db on :5432
- `docker compose -f compose.yaml up -d --build` — production build (nginx on :8080, prod API image runs `alembic upgrade head` on start).
- Backend, run inside the api container with `docker compose exec api <cmd>`:
  - `pytest`; a single test with `pytest tests/test_auth.py::test_login_me_logout`
  - `ruff check .`, `ruff format .`, `mypy app` (strict)
  - `alembic revision --autogenerate -m "..."`, then `alembic upgrade head`
- Frontend, run on the host in `frontend/`:
  - `npm test`; a single test with `npx vitest run tests/money.test.ts -t "name"`
  - `npm run typecheck`, `npm run lint`, `npm run build`
- **After adding or changing frontend dependencies, run `docker compose restart web`.** The dev web container keeps its own `node_modules` volume and only runs `npm ci` on start; without a restart the page breaks with "Failed to resolve import".
- `npm run gen:api` — regenerates `src/api/schema.d.ts` from the running API's OpenAPI. **Run it after any backend schema/route change** and commit the result.
- Backend dependencies: edit `backend/pyproject.toml`, then rebuild the image (`docker compose build api`). `uv` isn't installed on the host; to refresh `uv.lock`, run uv in a container:

  ```
  docker run --rm -v "<repo>/backend:/app" -w /app --entrypoint sh python:3.12-slim -c "pip install -q uv && uv lock"
  ```

## Architecture

- **API contract flows backend → frontend.** Pydantic schemas in FastAPI produce the OpenAPI schema. `openapi-typescript` generates `frontend/src/api/schema.d.ts`, and `src/api/client.ts` exposes the typed `api` client (openapi-fetch) plus `unwrap()`. `unwrap()` turns the backend error body into `ApiRequestError`. Operation ids are `<tag>-<function name>` (see `_operation_id` in `app/main.py`).
- **Backend** (`backend/app/`):
  - One package per feature (`auth/`, later `accounts/`, `transactions/`, …), each with `models.py`, `schemas.py`, `service.py`, `router.py`.
  - Routers are mounted under `/api` in `main.py`.
  - **Every new models module must be imported in `app/models.py`**, or Alembic autogenerate and the test schema won't see it.
  - Errors: raise `AppError` (`app/errors.py`). All errors, including validation errors, render as `{"error": {"code", "message", "details?"}}`, with Spanish messages.
  - Dependencies: `DbSession` and `CurrentUser` from `app/deps.py`. Every non-auth route should depend on `CurrentUser`.
- **Ledger model** (`accounts/`, `categories/`, `transactions/`):
  - `transactions.amount` is always positive; `kind` gives the direction: `expense`, `income`, `transfer_out`, `transfer_in`.
  - A transfer between own accounts (including a credit-card payment) is two rows linked by `transfer_peer_id`, created only via `POST /api/transfers`. Reports must exclude transfer kinds from spending and income.
  - Deleting either side of a transfer deletes both. Only date, description and notes are editable, and edits are mirrored to the peer row.
  - Account balance = `opening_balance` + inflows (`INFLOW_KINDS`) − outflows, computed per request. A credit-card balance is negative while there is debt.
  - Categories have at most two levels. A category's `kind` must match the transaction kind, and filtering by a parent category includes its children.
  - Every owned row has `user_id`; fetch by id with `get_owned()` (`app/common/crud.py`), which returns 404 for other users' rows.
  - New users get the default Spanish categories (`categories/defaults.py`). For existing users: `python -m app.cli seed-categories --email ...`.
- **Invoices** (`invoices/`): a simple user-defined record that replaces the richer model in the original plan.
  - Columns: Fecha Aplicación, Concepto, Subtotal, I.V.A, Facturado, Extra.
  - **Total is never stored**: it is a Pydantic `computed_field` (subtotal + iva).
  - `GET /api/invoices` returns `{items, summary}`. The summary (all / invoiced / pending / extra) follows the same filters, and the page header renders it.
  - The UI shows dates as `DD-MMM` in English ("22-Aug"), and I.V.A defaults to 16% of the subtotal until edited by hand.
- **Auth:** a single user created via `python -m app.cli create-user` (there is no signup endpoint). The session is a random token in the httpOnly cookie `mt_session`; only its SHA-256 is stored in `sessions`.
- **Tests:**
  - Run against the real Postgres database `moneytracker_test`, created by `docker/db-init/` only on first DB volume init.
  - `conftest.py` sets `DATABASE_URL` before importing the app, creates the schema from metadata (not migrations), and truncates all tables after each test.
  - Use the `auth_client` fixture for authenticated requests.
- **Frontend:**
  - Feature folders under `src/features/<feature>/`: TanStack Query hooks and components.
  - Pages under `src/pages/`, routes in `src/router.tsx`. All routes except `/login` are wrapped in `RequireAuth`.
  - Add sidebar sections to `NAV_ITEMS` in `src/components/Layout.tsx`.
  - Uses Mantine 9 components. dayjs and Mantine dates use the `es-mx` locale.

## Conventions

- Money:
  - Backend: `NUMERIC(14,2)` columns (`MONEY_SQL`) and the `Money` / `PositiveMoney` Pydantic types (`app/common/money.py`). JSON always uses two-decimal **strings** ("100.00").
  - Frontend: format with `formatMoney()` and do arithmetic with `addMoney()` / `toCents()` (`src/lib/money.ts`). Never float math.
- Compose ports bind to 127.0.0.1 only; keep it that way, since this holds financial data.
- Dev and prod API images have different tags (`moneytracker-api:dev` vs `moneytracker-api`) so one build doesn't overwrite the other.
- In Pydantic schemas, import `datetime as dt` and annotate `dt.date`. A field named `date` shadows the type and breaks `date | None`.
- SQLAlchemy 2.1:
  - Write select types as `Select[A, B]`, not `Select[tuple[A, B]]`.
  - `Result.tuples()` is deprecated; iterate rows directly.
  - Don't use `ForeignKey(..., use_alter=True)`: Alembic's `create_table` silently skips such constraints.
- Alembic runs ruff on each generated migration (post-write hook). Check that models and migrations agree with `alembic check`.
- Frontend tests:
  - Page smoke tests in `tests/pages.test.tsx` stub `fetch` with sample API data. The API client resolves `globalThis.fetch` per call so the stub takes effect.
  - jsdom polyfills that Mantine needs (matchMedia, ResizeObserver, `document.fonts`) are in `tests/setup.ts`.
- Frontend TypeScript is pinned to 5.9 because `openapi-typescript` and `typescript-eslint` don't support TS 6+/7 yet.
