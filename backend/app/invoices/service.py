from decimal import Decimal

from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.crud import get_owned
from app.invoices.models import Invoice
from app.invoices.schemas import (
    AmountSummary,
    InvoiceCreate,
    InvoiceFilters,
    InvoiceList,
    InvoiceOut,
    InvoiceSummary,
    InvoiceUpdate,
)


def _summarize(invoices: list[Invoice]) -> AmountSummary:
    subtotal = sum((i.subtotal for i in invoices), Decimal("0"))
    iva = sum((i.iva for i in invoices), Decimal("0"))
    return AmountSummary(count=len(invoices), subtotal=subtotal, iva=iva, total=subtotal + iva)


async def list_invoices(db: AsyncSession, user_id: int, f: InvoiceFilters) -> InvoiceList:
    query = select(Invoice).where(Invoice.user_id == user_id)
    if f.year is not None:
        query = query.where(extract("year", Invoice.application_date) == f.year)
    if f.month is not None:
        query = query.where(extract("month", Invoice.application_date) == f.month)
    if f.is_invoiced is not None:
        query = query.where(Invoice.is_invoiced.is_(f.is_invoiced))
    if f.is_extra is not None:
        query = query.where(Invoice.is_extra.is_(f.is_extra))
    if f.q:
        query = query.where(Invoice.concept.ilike(f"%{f.q.strip()}%"))

    invoices = list(
        (await db.scalars(query.order_by(Invoice.application_date.desc(), Invoice.id.desc()))).all()
    )
    summary = InvoiceSummary(
        all=_summarize(invoices),
        invoiced=_summarize([i for i in invoices if i.is_invoiced]),
        pending=_summarize([i for i in invoices if not i.is_invoiced]),
        extra=_summarize([i for i in invoices if i.is_extra]),
    )
    return InvoiceList(items=[InvoiceOut.model_validate(i) for i in invoices], summary=summary)


async def create_invoice(db: AsyncSession, user_id: int, data: InvoiceCreate) -> InvoiceOut:
    invoice = Invoice(user_id=user_id, **data.model_dump())
    db.add(invoice)
    await db.commit()
    return InvoiceOut.model_validate(invoice)


async def update_invoice(
    db: AsyncSession, user_id: int, invoice_id: int, data: InvoiceUpdate
) -> InvoiceOut:
    invoice = await get_owned(db, Invoice, invoice_id, user_id, "Factura")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(invoice, field, value)
    await db.commit()
    return InvoiceOut.model_validate(invoice)


async def delete_invoice(db: AsyncSession, user_id: int, invoice_id: int) -> None:
    invoice = await get_owned(db, Invoice, invoice_id, user_id, "Factura")
    await db.delete(invoice)
    await db.commit()
