from typing import Annotated

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.loans import service
from app.loans.schemas import (
    BorrowerCreate,
    BorrowerOut,
    BorrowerUpdate,
    LoanEntryCreate,
    LoanEntryFilters,
    LoanEntryList,
    LoanEntryOut,
    LoanEntryUpdate,
)

router = APIRouter(prefix="/loans", tags=["loans"])


@router.get("/borrowers", response_model=list[BorrowerOut])
async def list_borrowers(db: DbSession, user: CurrentUser) -> list[BorrowerOut]:
    return await service.list_borrowers(db, user.id)


@router.post("/borrowers", response_model=BorrowerOut, status_code=status.HTTP_201_CREATED)
async def create_borrower(body: BorrowerCreate, db: DbSession, user: CurrentUser) -> BorrowerOut:
    return await service.create_borrower(db, user.id, body)


@router.patch("/borrowers/{borrower_id}", response_model=BorrowerOut)
async def update_borrower(
    borrower_id: int, body: BorrowerUpdate, db: DbSession, user: CurrentUser
) -> BorrowerOut:
    return await service.update_borrower(db, user.id, borrower_id, body)


@router.delete("/borrowers/{borrower_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_borrower(borrower_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_borrower(db, user.id, borrower_id)


@router.get("", response_model=LoanEntryList)
async def list_entries(
    filters: Annotated[LoanEntryFilters, Query()], db: DbSession, user: CurrentUser
) -> LoanEntryList:
    return await service.list_entries(db, user.id, filters)


@router.post("", response_model=LoanEntryOut, status_code=status.HTTP_201_CREATED)
async def create_entry(body: LoanEntryCreate, db: DbSession, user: CurrentUser) -> LoanEntryOut:
    return await service.create_entry(db, user.id, body)


@router.patch("/{entry_id}", response_model=LoanEntryOut)
async def update_entry(
    entry_id: int, body: LoanEntryUpdate, db: DbSession, user: CurrentUser
) -> LoanEntryOut:
    return await service.update_entry(db, user.id, entry_id, body)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_entry(db, user.id, entry_id)
