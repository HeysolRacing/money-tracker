# MoneyTracker

Personal finance tracker for Mexican bank accounts and credit cards: expenses, income,
invoices (CFDI), statement imports and receipt extraction. Runs locally in Docker.

Stack: FastAPI + PostgreSQL (backend), React + Mantine (frontend), Docker Compose.

## Getting started

Requires Docker Desktop.

```sh
cp .env.example .env          # set POSTGRES_PASSWORD
docker compose up -d --build  # dev mode: http://localhost:5173 (API on :8000)
docker compose exec api python -m app.cli create-user --email you@example.com --rfc YOURRFC
```

Production build (nginx + compiled frontend) on http://localhost:8080:

```sh
docker compose -f compose.yaml up -d --build
```

All ports are bound to 127.0.0.1 only.

## Development commands

| Task                          | Command                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| Backend tests                 | `docker compose exec api pytest`                                            |
| Backend lint / format / types | `docker compose exec api sh -c "ruff check . && ruff format . && mypy app"` |
| New migration                 | `docker compose exec api alembic revision --autogenerate -m "msg"`          |
| Apply migrations              | `docker compose exec api alembic upgrade head`                              |
| Frontend tests / types / lint | `cd frontend && npm test && npm run typecheck && npm run lint`              |
| Regenerate API types          | `cd frontend && npm run gen:api` (API must be running)                      |

## Backups

```sh
docker compose exec db pg_dump -U moneytracker moneytracker > backup.sql
```

Uploaded files live in the `files` Docker volume; back it up too.
