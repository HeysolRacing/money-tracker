import datetime as dt
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.common.money import Money, PositiveMoney
from app.transactions.models import TransactionKind

Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Merchant = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
# Only expenses and income are created directly; transfers go through /transfers.
SimpleKind = Literal["expense", "income"]


class TransactionCreate(BaseModel):
    account_id: int
    date: dt.date
    kind: SimpleKind
    amount: PositiveMoney
    description: Description
    merchant: Merchant | None = None
    category_id: int | None = None
    notes: str | None = None


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    date: dt.date | None = None
    kind: SimpleKind | None = None
    amount: PositiveMoney | None = None
    description: Description | None = None
    merchant: Merchant | None = None
    category_id: int | None = None
    notes: str | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    date: dt.date
    kind: TransactionKind
    amount: Money
    description: str
    merchant: str | None
    category_id: int | None
    notes: str | None
    transfer_peer_id: int | None
    # For transfers: the other account involved.
    counterpart_account_id: int | None = None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    date: dt.date
    amount: PositiveMoney
    # Amount received, when the accounts have different currencies (e.g. MXN -> USD).
    to_amount: PositiveMoney | None = None
    description: Description = "Transferencia"
    notes: str | None = None


class TransferOut(BaseModel):
    outflow: TransactionOut
    inflow: TransactionOut


class TransactionFilters(BaseModel):
    account_id: int | None = None
    category_id: int | None = None
    uncategorized: bool = False
    kind: TransactionKind | None = None
    date_from: dt.date | None = None
    date_to: dt.date | None = None
    q: str | None = None
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)
