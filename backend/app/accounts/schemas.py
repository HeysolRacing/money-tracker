import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.accounts.models import AccountType, StatementFormat
from app.common.money import Money

Currency = Literal["MXN", "USD"]
DayOfMonth = Annotated[int, Field(ge=1, le=31)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
CardEnding = Annotated[str, StringConstraints(pattern=r"^\d{4}$")]


class AccountCreate(BaseModel):
    name: Name
    bank: str | None = None
    type: AccountType
    currency: Currency = "MXN"
    opening_balance: Money = Decimal("0")
    credit_limit: Money | None = None
    statement_day: DayOfMonth | None = None
    payment_due_day: DayOfMonth | None = None
    statement_format: StatementFormat | None = None
    card_endings: list[CardEnding] | None = None


class AccountUpdate(BaseModel):
    name: Name | None = None
    bank: str | None = None
    type: AccountType | None = None
    currency: Currency | None = None
    opening_balance: Money | None = None
    is_archived: bool | None = None
    credit_limit: Money | None = None
    statement_day: DayOfMonth | None = None
    payment_due_day: DayOfMonth | None = None
    statement_format: StatementFormat | None = None
    card_endings: list[CardEnding] | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    bank: str | None
    type: AccountType
    currency: Currency
    opening_balance: Money
    is_archived: bool
    credit_limit: Money | None
    statement_day: int | None
    payment_due_day: int | None
    statement_format: StatementFormat | None
    card_endings: list[str] | None
    # opening_balance + inflows - outflows. Credit cards: negative = amount owed.
    balance: Money


class AccountMonth(BaseModel):
    """One statement period of an account (see app/accounts/monthly.py)."""

    # Month the period ends in, e.g. 2026-10 for 20-sep..19-oct.
    year: int
    month: int
    period_start: dt.date
    period_end: dt.date
    movement_count: int
    # Outflows (expenses, transfers out) and inflows (income, transfers in, card payments).
    charges_total: Money
    credits_total: Money
    # Set when the period was loaded from a statement PDF.
    statement_import_id: int | None
    loaded_at: dt.datetime | None
    # A bulk-import account with no statement loaded for this period.
    missing: bool
