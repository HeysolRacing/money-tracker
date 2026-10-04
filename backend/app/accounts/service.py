from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountType
from app.accounts.schemas import AccountCreate, AccountOut, AccountUpdate
from app.common.crud import get_owned
from app.errors import AppError
from app.transactions.models import INFLOW_KINDS, Transaction

CREDIT_CARD_FIELDS = ("credit_limit", "statement_day", "payment_due_day")


async def _movement_totals(db: AsyncSession, user_id: int) -> dict[int, Decimal]:
    signed = case(
        (Transaction.kind.in_(INFLOW_KINDS), Transaction.amount), else_=-Transaction.amount
    )
    rows = await db.execute(
        select(Transaction.account_id, func.sum(signed))
        .where(Transaction.user_id == user_id)
        .group_by(Transaction.account_id)
    )
    return {account_id: total for account_id, total in rows}


def _to_out(account: Account, movements: Decimal) -> AccountOut:
    return AccountOut.model_validate(
        {
            **{c: getattr(account, c) for c in AccountOut.model_fields if c != "balance"},
            "balance": account.opening_balance + movements,
        }
    )


def _clear_card_fields_if_not_card(account: Account) -> None:
    if account.type != AccountType.CREDIT_CARD:
        for field in CREDIT_CARD_FIELDS:
            setattr(account, field, None)


async def list_accounts(
    db: AsyncSession, user_id: int, include_archived: bool = False
) -> list[AccountOut]:
    query = select(Account).where(Account.user_id == user_id).order_by(Account.name)
    if not include_archived:
        query = query.where(Account.is_archived.is_(False))
    accounts = (await db.scalars(query)).all()
    totals = await _movement_totals(db, user_id)
    return [_to_out(a, totals.get(a.id, Decimal("0"))) for a in accounts]


async def get_account(db: AsyncSession, user_id: int, account_id: int) -> AccountOut:
    account = await get_owned(db, Account, account_id, user_id, "Cuenta")
    totals = await _movement_totals(db, user_id)
    return _to_out(account, totals.get(account.id, Decimal("0")))


async def create_account(db: AsyncSession, user_id: int, data: AccountCreate) -> AccountOut:
    account = Account(user_id=user_id, **data.model_dump())
    _clear_card_fields_if_not_card(account)
    db.add(account)
    await db.commit()
    return _to_out(account, Decimal("0"))


async def update_account(
    db: AsyncSession, user_id: int, account_id: int, data: AccountUpdate
) -> AccountOut:
    account = await get_owned(db, Account, account_id, user_id, "Cuenta")
    changes = data.model_dump(exclude_unset=True)
    if "currency" in changes and changes["currency"] != account.currency:
        has_movements = await db.scalar(
            select(func.count()).where(Transaction.account_id == account.id)
        )
        if has_movements:
            raise AppError.conflict("No se puede cambiar la moneda de una cuenta con movimientos")
    for field, value in changes.items():
        setattr(account, field, value)
    _clear_card_fields_if_not_card(account)
    await db.commit()
    return await get_account(db, user_id, account_id)


async def delete_account(db: AsyncSession, user_id: int, account_id: int) -> None:
    account = await get_owned(db, Account, account_id, user_id, "Cuenta")
    has_movements = await db.scalar(
        select(func.count()).where(Transaction.account_id == account.id)
    )
    if has_movements:
        raise AppError.conflict("La cuenta tiene movimientos; archívala en lugar de eliminarla")
    await db.delete(account)
    await db.commit()
