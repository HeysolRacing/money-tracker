import datetime as dt
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.common.money import Money, NonNegativeMoney

BorrowerName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class LoanTotals(BaseModel):
    """Totals over loan entries. Balance and revenue are netted per borrower, then summed:
    a borrower who has paid back less than they were lent owes the difference (Saldo); one
    who has paid back more produced revenue (Ganancia)."""

    count: int
    lent: Money  # Prestado
    paid: Money  # Pagado
    balance: Money  # Saldo pendiente
    revenue: Money  # Ganancia


class BorrowerCreate(BaseModel):
    name: BorrowerName


class BorrowerUpdate(BaseModel):
    name: BorrowerName


class BorrowerOut(BaseModel):
    id: int
    name: str
    totals: LoanTotals


class LoanEntryCreate(BaseModel):
    borrower_id: int
    entry_date: dt.date
    description: Description
    lent: NonNegativeMoney = Decimal("0")
    paid: NonNegativeMoney = Decimal("0")


class LoanEntryUpdate(BaseModel):
    borrower_id: int | None = None
    entry_date: dt.date | None = None
    description: Description | None = None
    lent: NonNegativeMoney | None = None
    paid: NonNegativeMoney | None = None


class LoanEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    borrower_id: int
    entry_date: dt.date
    description: str
    lent: Money
    paid: Money


class LoanEntryList(BaseModel):
    items: list[LoanEntryOut]
    summary: LoanTotals


class LoanEntryFilters(BaseModel):
    borrower_id: int | None = None
    date_from: dt.date | None = None
    date_to: dt.date | None = None
    q: str | None = None
