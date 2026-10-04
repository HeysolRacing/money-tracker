from typing import Annotated

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.transactions import service
from app.transactions.schemas import (
    TransactionCreate,
    TransactionFilters,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
    TransferCreate,
    TransferOut,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])
transfers_router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.get("", response_model=TransactionPage)
async def list_transactions(
    filters: Annotated[TransactionFilters, Query()], db: DbSession, user: CurrentUser
) -> TransactionPage:
    return await service.list_transactions(db, user.id, filters)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate, db: DbSession, user: CurrentUser
) -> TransactionOut:
    return await service.create_transaction(db, user.id, body)


@router.get("/{transaction_id}", response_model=TransactionOut)
async def get_transaction(transaction_id: int, db: DbSession, user: CurrentUser) -> TransactionOut:
    return await service.get_transaction(db, user.id, transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: int, body: TransactionUpdate, db: DbSession, user: CurrentUser
) -> TransactionOut:
    return await service.update_transaction(db, user.id, transaction_id, body)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_transaction(db, user.id, transaction_id)


@transfers_router.post("", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
async def create_transfer(body: TransferCreate, db: DbSession, user: CurrentUser) -> TransferOut:
    return await service.create_transfer(db, user.id, body)
