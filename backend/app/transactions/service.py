from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.accounts.models import Account
from app.categories.models import Category
from app.common.crud import get_owned
from app.errors import AppError
from app.transactions.models import TRANSFER_KINDS, Transaction, TransactionKind
from app.transactions.schemas import (
    TransactionCreate,
    TransactionFilters,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
    TransferCreate,
    TransferOut,
)

# Fields of a transfer row that may be edited; they are mirrored to the peer row.
TRANSFER_EDITABLE = {"date", "description", "notes"}

Peer = aliased(Transaction)


def _with_counterpart(query: Select[Transaction]) -> Select[Transaction, int | None]:
    return query.add_columns(Peer.account_id).outerjoin(
        Peer, Peer.id == Transaction.transfer_peer_id
    )


def _to_out(tx: Transaction, counterpart_account_id: int | None) -> TransactionOut:
    out = TransactionOut.model_validate(tx)
    out.counterpart_account_id = counterpart_account_id
    return out


async def _get_tx(db: AsyncSession, user_id: int, tx_id: int) -> Transaction:
    return await get_owned(db, Transaction, tx_id, user_id, "Movimiento")


async def _get_out(db: AsyncSession, user_id: int, tx_id: int) -> TransactionOut:
    row = (
        await db.execute(_with_counterpart(select(Transaction)).where(Transaction.id == tx_id))
    ).one_or_none()
    if row is None or row[0].user_id != user_id:
        raise AppError.not_found("Movimiento")
    return _to_out(row[0], row[1])


async def _active_account(db: AsyncSession, user_id: int, account_id: int) -> Account:
    account = await get_owned(db, Account, account_id, user_id, "Cuenta")
    if account.is_archived:
        raise AppError.bad_request("La cuenta está archivada")
    return account


async def _check_category(db: AsyncSession, user_id: int, category_id: int, kind: str) -> None:
    category = await get_owned(db, Category, category_id, user_id, "Categoría")
    if category.kind != kind:
        label = "gasto" if kind == TransactionKind.EXPENSE else "ingreso"
        raise AppError.bad_request(f"La categoría no es de tipo {label}")


async def list_transactions(
    db: AsyncSession, user_id: int, f: TransactionFilters
) -> TransactionPage:
    query = select(Transaction).where(Transaction.user_id == user_id)
    if f.account_id is not None:
        query = query.where(Transaction.account_id == f.account_id)
    if f.uncategorized:
        query = query.where(
            Transaction.category_id.is_(None), Transaction.kind.not_in(TRANSFER_KINDS)
        )
    elif f.category_id is not None:
        # A parent category also matches its subcategories.
        children = select(Category.id).where(Category.parent_id == f.category_id)
        query = query.where(
            or_(Transaction.category_id == f.category_id, Transaction.category_id.in_(children))
        )
    if f.kind is not None:
        query = query.where(Transaction.kind == f.kind)
    if f.date_from is not None:
        query = query.where(Transaction.date >= f.date_from)
    if f.date_to is not None:
        query = query.where(Transaction.date <= f.date_to)
    if f.q:
        pattern = f"%{f.q.strip()}%"
        query = query.where(
            or_(Transaction.description.ilike(pattern), Transaction.merchant.ilike(pattern))
        )

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page = (
        _with_counterpart(query)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(f.limit)
        .offset(f.offset)
    )
    rows = (await db.execute(page)).all()
    return TransactionPage(items=[_to_out(tx, cp) for tx, cp in rows], total=total)


async def get_transaction(db: AsyncSession, user_id: int, tx_id: int) -> TransactionOut:
    return await _get_out(db, user_id, tx_id)


async def create_transaction(
    db: AsyncSession, user_id: int, data: TransactionCreate
) -> TransactionOut:
    await _active_account(db, user_id, data.account_id)
    if data.category_id is not None:
        await _check_category(db, user_id, data.category_id, data.kind)
    tx = Transaction(user_id=user_id, **data.model_dump())
    db.add(tx)
    await db.commit()
    return _to_out(tx, None)


async def update_transaction(
    db: AsyncSession, user_id: int, tx_id: int, data: TransactionUpdate
) -> TransactionOut:
    tx = await _get_tx(db, user_id, tx_id)
    changes = data.model_dump(exclude_unset=True)

    if tx.kind in TRANSFER_KINDS:
        if not set(changes) <= TRANSFER_EDITABLE:
            raise AppError.bad_request(
                "En una transferencia solo se puede editar fecha, descripción y notas; "
                "para cambiar cuentas o monto, elimínala y créala de nuevo"
            )
        peer = await db.get(Transaction, tx.transfer_peer_id) if tx.transfer_peer_id else None
        for target in (tx, peer):
            if target is not None:
                for field, value in changes.items():
                    setattr(target, field, value)
        await db.commit()
        return await _get_out(db, user_id, tx.id)

    if "account_id" in changes and changes["account_id"] != tx.account_id:
        await _active_account(db, user_id, changes["account_id"])
    kind = changes.get("kind", tx.kind)
    category_id = changes.get("category_id", tx.category_id)
    if category_id is not None:
        await _check_category(db, user_id, category_id, kind)
    for field, value in changes.items():
        setattr(tx, field, value)
    await db.commit()
    return _to_out(tx, None)


async def delete_transaction(db: AsyncSession, user_id: int, tx_id: int) -> None:
    """Deletes a transaction; deleting either side of a transfer deletes both rows."""
    tx = await _get_tx(db, user_id, tx_id)
    ids = [tx.id] + ([tx.transfer_peer_id] if tx.transfer_peer_id else [])
    await db.execute(delete(Transaction).where(Transaction.id.in_(ids)))
    await db.commit()


async def create_transfer(db: AsyncSession, user_id: int, data: TransferCreate) -> TransferOut:
    if data.from_account_id == data.to_account_id:
        raise AppError.bad_request("Las cuentas de origen y destino deben ser distintas")
    source = await _active_account(db, user_id, data.from_account_id)
    target = await _active_account(db, user_id, data.to_account_id)
    if source.currency != target.currency and data.to_amount is None:
        raise AppError.bad_request(
            f"Indica el monto recibido en {target.currency} (las monedas son distintas)"
        )

    common = {
        "user_id": user_id,
        "date": data.date,
        "description": data.description,
        "notes": data.notes,
    }
    outflow = Transaction(
        **common, account_id=source.id, kind=TransactionKind.TRANSFER_OUT, amount=data.amount
    )
    inflow = Transaction(
        **common,
        account_id=target.id,
        kind=TransactionKind.TRANSFER_IN,
        amount=data.to_amount or data.amount,
    )
    db.add_all([outflow, inflow])
    await db.flush()
    outflow.transfer_peer_id = inflow.id
    inflow.transfer_peer_id = outflow.id
    await db.commit()
    return TransferOut(outflow=_to_out(outflow, target.id), inflow=_to_out(inflow, source.id))
