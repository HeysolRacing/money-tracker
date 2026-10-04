from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.accounts.models import AccountType
from app.common.money import Money

Currency = Literal["MXN", "USD"]
DayOfMonth = Annotated[int, Field(ge=1, le=31)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class AccountCreate(BaseModel):
    name: Name
    bank: str | None = None
    type: AccountType
    currency: Currency = "MXN"
    opening_balance: Money = Decimal("0")
    credit_limit: Money | None = None
    statement_day: DayOfMonth | None = None
    payment_due_day: DayOfMonth | None = None


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
    # opening_balance + inflows - outflows. Credit cards: negative = amount owed.
    balance: Money
