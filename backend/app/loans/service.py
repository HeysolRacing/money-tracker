from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.crud import get_owned
from app.errors import AppError
from app.loans.models import Borrower, LoanEntry
from app.loans.schemas import (
    BorrowerCreate,
    BorrowerOut,
    BorrowerUpdate,
    LoanEntryCreate,
    LoanEntryFilters,
    LoanEntryList,
    LoanEntryOut,
    LoanEntryUpdate,
    LoanTotals,
)

ZERO = Decimal("0")


def _check_has_amount(entry: LoanEntry) -> None:
    if not entry.lent and not entry.paid:
        raise AppError.bad_request("Escribe un préstamo o un pago")


def _totals(entries: list[LoanEntry]) -> LoanTotals:
    net: dict[int, Decimal] = defaultdict(Decimal)  # lent - paid, per borrower
    for e in entries:
        net[e.borrower_id] += e.lent - e.paid
    return LoanTotals(
        count=len(entries),
        lent=sum((e.lent for e in entries), ZERO),
        paid=sum((e.paid for e in entries), ZERO),
        balance=sum((n for n in net.values() if n > 0), ZERO),
        revenue=sum((-n for n in net.values() if n < 0), ZERO),
    )


# --- Borrowers ---------------------------------------------------------------


async def list_borrowers(db: AsyncSession, user_id: int) -> list[BorrowerOut]:
    borrowers = await db.scalars(
        select(Borrower).where(Borrower.user_id == user_id).order_by(Borrower.name)
    )
    entries = await db.scalars(select(LoanEntry).where(LoanEntry.user_id == user_id))
    by_borrower: dict[int, list[LoanEntry]] = defaultdict(list)
    for e in entries:
        by_borrower[e.borrower_id].append(e)
    return [BorrowerOut(id=b.id, name=b.name, totals=_totals(by_borrower[b.id])) for b in borrowers]


async def _borrower_out(db: AsyncSession, borrower: Borrower) -> BorrowerOut:
    entries = await db.scalars(select(LoanEntry).where(LoanEntry.borrower_id == borrower.id))
    return BorrowerOut(id=borrower.id, name=borrower.name, totals=_totals(list(entries)))


async def _commit_unique(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError.conflict("Ya existe un deudor con ese nombre") from exc


async def create_borrower(db: AsyncSession, user_id: int, data: BorrowerCreate) -> BorrowerOut:
    borrower = Borrower(user_id=user_id, name=data.name)
    db.add(borrower)
    await _commit_unique(db)
    return await _borrower_out(db, borrower)


async def update_borrower(
    db: AsyncSession, user_id: int, borrower_id: int, data: BorrowerUpdate
) -> BorrowerOut:
    borrower = await get_owned(db, Borrower, borrower_id, user_id, "Deudor")
    borrower.name = data.name
    await _commit_unique(db)
    return await _borrower_out(db, borrower)


async def delete_borrower(db: AsyncSession, user_id: int, borrower_id: int) -> None:
    borrower = await get_owned(db, Borrower, borrower_id, user_id, "Deudor")
    has_entries = await db.scalar(
        select(LoanEntry.id).where(LoanEntry.borrower_id == borrower.id).limit(1)
    )
    if has_entries is not None:
        raise AppError.conflict("El deudor tiene movimientos; elimínalos primero")
    await db.delete(borrower)
    await db.commit()


# --- Entries -----------------------------------------------------------------


async def list_entries(db: AsyncSession, user_id: int, f: LoanEntryFilters) -> LoanEntryList:
    query = select(LoanEntry).where(LoanEntry.user_id == user_id)
    if f.borrower_id is not None:
        query = query.where(LoanEntry.borrower_id == f.borrower_id)
    if f.date_from is not None:
        query = query.where(LoanEntry.entry_date >= f.date_from)
    if f.date_to is not None:
        query = query.where(LoanEntry.entry_date <= f.date_to)
    if f.q:
        query = query.where(LoanEntry.description.ilike(f"%{f.q.strip()}%"))

    # Oldest first, like the spreadsheet, so a running balance reads top to bottom.
    entries = list(await db.scalars(query.order_by(LoanEntry.entry_date, LoanEntry.id)))
    return LoanEntryList(
        items=[LoanEntryOut.model_validate(e) for e in entries], summary=_totals(entries)
    )


async def create_entry(db: AsyncSession, user_id: int, data: LoanEntryCreate) -> LoanEntryOut:
    await get_owned(db, Borrower, data.borrower_id, user_id, "Deudor")
    entry = LoanEntry(user_id=user_id, **data.model_dump())
    _check_has_amount(entry)
    db.add(entry)
    await db.commit()
    return LoanEntryOut.model_validate(entry)


async def update_entry(
    db: AsyncSession, user_id: int, entry_id: int, data: LoanEntryUpdate
) -> LoanEntryOut:
    entry = await get_owned(db, LoanEntry, entry_id, user_id, "Movimiento")
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "borrower_id" in changes:
        await get_owned(db, Borrower, changes["borrower_id"], user_id, "Deudor")
    for field, value in changes.items():
        setattr(entry, field, value)
    try:
        _check_has_amount(entry)
    except AppError:
        await db.rollback()
        raise
    await db.commit()
    return LoanEntryOut.model_validate(entry)


async def delete_entry(db: AsyncSession, user_id: int, entry_id: int) -> None:
    entry = await get_owned(db, LoanEntry, entry_id, user_id, "Movimiento")
    await db.delete(entry)
    await db.commit()
