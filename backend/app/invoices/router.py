from typing import Annotated

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.invoices import service
from app.invoices.schemas import (
    InvoiceCreate,
    InvoiceFilters,
    InvoiceList,
    InvoiceOut,
    InvoiceUpdate,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=InvoiceList)
async def list_invoices(
    filters: Annotated[InvoiceFilters, Query()], db: DbSession, user: CurrentUser
) -> InvoiceList:
    return await service.list_invoices(db, user.id, filters)


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice(body: InvoiceCreate, db: DbSession, user: CurrentUser) -> InvoiceOut:
    return await service.create_invoice(db, user.id, body)


@router.patch("/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(
    invoice_id: int, body: InvoiceUpdate, db: DbSession, user: CurrentUser
) -> InvoiceOut:
    return await service.update_invoice(db, user.id, invoice_id, body)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(invoice_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_invoice(db, user.id, invoice_id)
