import datetime as dt
from decimal import Decimal
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.monthly import monthly_summary
from app.statements.models import StatementImport
from app.transactions.models import Transaction


async def _post(client: AsyncClient, path: str, body: dict[str, Any]) -> dict[str, Any]:
    res = await client.post(path, json=body)
    assert res.status_code == 201, res.text
    return res.json()


async def _tx(client: AsyncClient, account_id: int, date: str, amount: str, kind: str) -> None:
    await _post(
        client,
        "/api/transactions",
        {
            "account_id": account_id,
            "date": date,
            "kind": kind,
            "amount": amount,
            "description": "Movimiento",
        },
    )


async def test_calendar_months_for_accounts_without_cut_day(auth_client: AsyncClient) -> None:
    account = await _post(auth_client, "/api/accounts", {"name": "Efectivo", "type": "cash"})
    await _tx(auth_client, account["id"], "2026-09-03", "100.00", "expense")
    await _tx(auth_client, account["id"], "2026-09-30", "50.00", "income")
    await _tx(auth_client, account["id"], "2026-11-15", "20.00", "expense")

    res = await auth_client.get(f"/api/accounts/{account['id']}/months")
    assert res.status_code == 200, res.text
    months = {(m["year"], m["month"]): m for m in res.json()}
    sep = months[(2026, 9)]
    assert (sep["period_start"], sep["period_end"]) == ("2026-09-01", "2026-09-30")
    assert (sep["movement_count"], sep["charges_total"], sep["credits_total"]) == (
        2,
        "100.00",
        "50.00",
    )
    # Months with no movements still show up, so gaps are visible.
    assert months[(2026, 10)]["movement_count"] == 0
    assert not any(m["missing"] for m in months.values())


async def test_credit_card_periods_end_on_cut_day(
    auth_client: AsyncClient, db: AsyncSession
) -> None:
    card = await _post(
        auth_client,
        "/api/accounts",
        {"name": "Liverpool", "type": "credit_card", "statement_day": 19},
    )
    # 25-sep belongs to the period 20-sep..19-oct, labeled October.
    await _tx(auth_client, card["id"], "2026-09-25", "300.00", "expense")

    rows = await monthly_summary(db, 1, card["id"], today=dt.date(2026, 10, 25))
    assert [(r.year, r.month, r.period_start, r.period_end, r.movement_count) for r in rows] == [
        (2026, 11, dt.date(2026, 10, 20), dt.date(2026, 11, 19), 0),
        (2026, 10, dt.date(2026, 9, 20), dt.date(2026, 10, 19), 1),
    ]


async def test_loaded_statements_and_missing_months(
    auth_client: AsyncClient, db: AsyncSession
) -> None:
    card = await _post(
        auth_client,
        "/api/accounts",
        {
            "name": "BBVA Oro",
            "type": "credit_card",
            "statement_format": "bbva_oro",
            "card_endings": ["0739"],
        },
    )
    loads = []
    for start, end in [((6, 20), (7, 19)), ((8, 20), (9, 19))]:
        load = StatementImport(
            user_id=1,
            account_id=card["id"],
            period_start=dt.date(2026, *start),
            period_end=dt.date(2026, *end),
            file_sha256="0" * 63 + str(len(loads)),
            row_count=2,
        )
        db.add(load)
        await db.flush()
        loads.append(load)
        for amount, kind in [("500.00", "expense"), ("200.00", "income")]:
            db.add(
                Transaction(
                    user_id=1,
                    account_id=card["id"],
                    date=dt.date(2026, *start),
                    kind=kind,
                    amount=Decimal(amount),
                    description="Del PDF",
                    statement_import_id=load.id,
                )
            )
    await db.commit()
    # A movement typed by hand in a loaded period is not part of that statement.
    await _tx(auth_client, card["id"], "2026-09-01", "999.00", "expense")

    rows = await monthly_summary(db, 1, card["id"], today=dt.date(2026, 10, 5))
    summary = [
        (r.month, r.movement_count, r.charges_total, r.statement_import_id, r.missing) for r in rows
    ]
    assert summary == [
        (10, 0, Decimal("0"), None, False),  # still open: not missing yet
        (9, 2, Decimal("500.00"), loads[1].id, False),
        (8, 0, Decimal("0"), None, True),  # July 20 .. Aug 19 was never loaded
        (7, 2, Decimal("500.00"), loads[0].id, False),
    ]
    assert rows[1].loaded_at is not None
    # Periods follow the statements' cut day (19), also for the missing month.
    assert (rows[2].period_start, rows[2].period_end) == (
        dt.date(2026, 7, 20),
        dt.date(2026, 8, 19),
    )


async def test_months_of_other_users_account(auth_client: AsyncClient) -> None:
    res = await auth_client.get("/api/accounts/999/months")
    assert res.status_code == 404
