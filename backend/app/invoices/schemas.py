import datetime as dt
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, computed_field

from app.common.money import Money, NonNegativeMoney

Concept = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class InvoiceCreate(BaseModel):
    application_date: dt.date
    concept: Concept
    subtotal: NonNegativeMoney
    iva: NonNegativeMoney
    is_invoiced: bool = False
    is_extra: bool = False


class InvoiceUpdate(BaseModel):
    application_date: dt.date | None = None
    concept: Concept | None = None
    subtotal: NonNegativeMoney | None = None
    iva: NonNegativeMoney | None = None
    is_invoiced: bool | None = None
    is_extra: bool | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_date: dt.date
    concept: str
    subtotal: Money
    iva: Money
    is_invoiced: bool
    is_extra: bool

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total(self) -> Money:
        return self.subtotal + self.iva


class AmountSummary(BaseModel):
    count: int
    subtotal: Money
    iva: Money
    total: Money


class InvoiceSummary(BaseModel):
    """Totals for the filtered invoices, split by Facturado and Extra."""

    all: AmountSummary
    invoiced: AmountSummary  # Facturado
    pending: AmountSummary  # Por facturar
    extra: AmountSummary


class InvoiceList(BaseModel):
    items: list[InvoiceOut]
    summary: InvoiceSummary


class InvoiceFilters(BaseModel):
    year: int | None = Field(None, ge=2000, le=2100)
    month: int | None = Field(None, ge=1, le=12)
    is_invoiced: bool | None = None
    is_extra: bool | None = None
    q: str | None = None
