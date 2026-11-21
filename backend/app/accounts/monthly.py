"""Monthly summary of an account: one row per statement period with its movement totals.

Periods end on the account's cut day: the day of its loaded statements (bulk import), else
`statement_day` (credit cards), else the end of each calendar month. A period with a loaded
statement uses that statement's exact dates and only its movements; the other periods count
every movement of the account between their dates. In accounts with bulk import, a period
without a statement nor movements between the first one and today is reported as missing.
"""

import calendar
import datetime as dt
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.accounts.schemas import AccountMonth
from app.common.crud import get_owned
from app.statements.models import StatementImport
from app.transactions.models import INFLOW_KINDS, Transaction

# How many periods the summary shows, newest first.
MAX_MONTHS = 24


def _period_end(year: int, month: int, cut_day: int | None) -> dt.date:
    last = calendar.monthrange(year, month)[1]
    return dt.date(year, month, min(cut_day or last, last))


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _period(year: int, month: int, cut_day: int | None) -> tuple[dt.date, dt.date]:
    """The period that ends in the given month."""
    start = _period_end(*_previous_month(year, month), cut_day) + dt.timedelta(days=1)
    return start, _period_end(year, month, cut_day)


def _month_of(day: dt.date, cut_day: int | None) -> tuple[int, int]:
    """The month whose period contains the given day."""
    if day > _period_end(day.year, day.month, cut_day):
        return _next_month(day.year, day.month)
    return day.year, day.month


async def monthly_summary(
    db: AsyncSession, user_id: int, account_id: int, today: dt.date | None = None
) -> list[AccountMonth]:
    account = await get_owned(db, Account, account_id, user_id, "Cuenta")
    today = today or dt.date.today()
    imports = list(
        await db.scalars(
            select(StatementImport)
            .where(StatementImport.account_id == account.id)
            .order_by(StatementImport.period_end)
        )
    )
    cut_day = imports[-1].period_end.day if imports else account.statement_day
    by_month = {(i.period_end.year, i.period_end.month): i for i in imports}

    signed = case((Transaction.kind.in_(INFLOW_KINDS), Transaction.amount), else_=Decimal("0"))
    outflow = case((Transaction.kind.in_(INFLOW_KINDS), Decimal("0")), else_=Transaction.amount)
    totals = select(func.count(), func.sum(outflow), func.sum(signed)).where(
        Transaction.account_id == account.id
    )

    first_tx = await db.scalar(
        select(func.min(Transaction.date)).where(Transaction.account_id == account.id)
    )
    starts = [d for d in (first_tx, imports[0].period_start if imports else None) if d]
    if not starts:
        return []
    year, month = _month_of(min(starts), cut_day)
    last = _month_of(today, cut_day)
    if imports:
        last = max(last, (imports[-1].period_end.year, imports[-1].period_end.month))

    rows: list[AccountMonth] = []
    while (year, month) <= last:
        loaded = by_month.get((year, month))
        if loaded is not None:
            start, end = loaded.period_start, loaded.period_end
            query = totals.where(Transaction.statement_import_id == loaded.id)
        else:
            start, end = _period(year, month, cut_day)
            query = totals.where(Transaction.date >= start, Transaction.date <= end)
        count, charges, credits = (await db.execute(query)).one()
        # Periods of bulk-import accounts with no statement nor movements, from the first
        # statement loaded on (movements loaded before loads were recorded have no
        # statement); the current, still open period isn't missing yet.
        missing = (
            account.statement_format is not None
            and loaded is None
            and count == 0
            and bool(imports)
            and end > imports[0].period_end
            and end < today
        )
        rows.append(
            AccountMonth(
                year=year,
                month=month,
                period_start=start,
                period_end=end,
                movement_count=count,
                charges_total=charges or Decimal("0"),
                credits_total=credits or Decimal("0"),
                statement_import_id=loaded.id if loaded else None,
                loaded_at=loaded.created_at if loaded else None,
                missing=missing,
            )
        )
        year, month = _next_month(year, month)
    return rows[::-1][:MAX_MONTHS]
