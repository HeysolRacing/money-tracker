from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.investments.importer import SheetError, import_sheet, parse_amount, parse_sheet

# Same shape as the real export: BOM, quoted amounts, "$ -", blanks, both groups.
SHEET = (
    "﻿2026,ENE,FEB,MAR,ABR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC\n"
    'BBVA,," $1,058.00 ", $-   ," $100,343.49 ",,,,,,,,\n'
    "BANORTE,, $53.00 , $-   , $248.70 ,,,,,,,,\n"
    'NU," $27,469.53 "," $27,761.74 ",,,,,,,,,,\n'
    '," $27,469.53 "," $28,872.74 ", $-   ," $100,592.19 ",,,,,,,,\n'
    "Investment Ocassionally,,,,,,,,,,,,\n"
    'BANORTE," $68,600.00 ",,,,,,,,,,,\n'
    'Summarize," $96,069.53 "," $28,872.74 ", $-   ," $100,592.19 ",,,,,,,,\n'
)


def test_parse_amount() -> None:
    assert parse_amount(" $1,058.00 ") == Decimal("1058.00")
    assert parse_amount(" $-   ") == Decimal("0")
    assert parse_amount("") is None
    assert parse_amount(" ($5.00) ") == Decimal("-5.00")
    with pytest.raises(SheetError):
        parse_amount("abc")


def test_parse_sheet_groups_and_cells() -> None:
    sheet = parse_sheet(SHEET)
    assert sheet.year == 2026
    assert [(r.name, r.group) for r in sheet.rows] == [
        ("BBVA", "main"),
        ("BANORTE", "main"),
        ("NU", "main"),
        ("BANORTE", "occasional"),
    ]
    bbva = sheet.rows[0].months
    assert bbva[:4] == [None, Decimal("1058.00"), Decimal("0"), Decimal("100343.49")]


def test_totals_that_dont_add_up_are_rejected() -> None:
    # NU gets an ABR balance the CSV's own Total row doesn't include.
    nu = 'NU," $27,469.53 "," $27,761.74 ",,'
    broken = SHEET.replace(nu, nu + " $0.01 ")
    with pytest.raises(SheetError, match="ABR no cuadra"):
        parse_sheet(broken)


async def test_import_is_idempotent(auth_client: AsyncClient, db: AsyncSession) -> None:
    user = await db.scalar(select(User))
    assert user is not None
    user_id = user.id  # the dry run's rollback expires `user`
    sheet = parse_sheet(SHEET)

    dry = await import_sheet(db, user_id, sheet, dry_run=True)
    assert dry.balances_created == 9
    assert (await auth_client.get("/api/investments", params={"year": 2026})).json()["items"] == []

    first = await import_sheet(db, user_id, sheet)
    assert len(first.investments_created) == 4
    assert first.balances_created == 9

    again = await import_sheet(db, user_id, sheet)
    assert again.investments_created == []
    assert (again.balances_created, again.balances_updated, again.balances_unchanged) == (0, 0, 9)

    grid = (await auth_client.get("/api/investments", params={"year": 2026})).json()
    assert grid["totals"]["main"][:4] == ["27469.53", "28872.74", "0.00", "100592.19"]
    assert grid["totals"]["overall"][0] == "96069.53"
