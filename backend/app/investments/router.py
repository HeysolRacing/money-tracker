from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.deps import CurrentUser, DbSession
from app.investments import service
from app.investments.schemas import (
    BalanceOut,
    BalanceSet,
    Dashboard,
    GridFilters,
    InvestmentCreate,
    InvestmentGrid,
    InvestmentOut,
    InvestmentUpdate,
    TermCreate,
    TermList,
    TermOut,
    TermUpdate,
)

router = APIRouter(prefix="/investments", tags=["investments"])


@router.get("", response_model=InvestmentGrid)
async def get_grid(
    filters: Annotated[GridFilters, Query()], db: DbSession, user: CurrentUser
) -> InvestmentGrid:
    return await service.get_grid(db, user.id, filters)


@router.get("/dashboard", response_model=Dashboard)
async def get_dashboard(db: DbSession, user: CurrentUser) -> Dashboard:
    return await service.get_dashboard(db, user.id)


@router.post("", response_model=InvestmentOut, status_code=status.HTTP_201_CREATED)
async def create_investment(
    body: InvestmentCreate, db: DbSession, user: CurrentUser
) -> InvestmentOut:
    return await service.create_investment(db, user.id, body)


@router.patch("/{investment_id}", response_model=InvestmentOut)
async def update_investment(
    investment_id: int, body: InvestmentUpdate, db: DbSession, user: CurrentUser
) -> InvestmentOut:
    return await service.update_investment(db, user.id, investment_id, body)


@router.delete("/{investment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_investment(investment_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_investment(db, user.id, investment_id)


@router.put("/{investment_id}/balances/{year}/{month}", response_model=BalanceOut)
async def set_balance(
    investment_id: int,
    year: Annotated[int, Path(ge=2000, le=2100)],
    month: Annotated[int, Path(ge=1, le=12)],
    body: BalanceSet,
    db: DbSession,
    user: CurrentUser,
) -> BalanceOut:
    return await service.set_balance(db, user.id, investment_id, year, month, body)


@router.get("/{investment_id}/terms", response_model=TermList)
async def list_terms(investment_id: int, db: DbSession, user: CurrentUser) -> TermList:
    return await service.list_terms(db, user.id, investment_id)


@router.post("/{investment_id}/terms", response_model=TermOut, status_code=status.HTTP_201_CREATED)
async def create_term(
    investment_id: int, body: TermCreate, db: DbSession, user: CurrentUser
) -> TermOut:
    return await service.create_term(db, user.id, investment_id, body)


@router.patch("/terms/{term_id}", response_model=TermOut)
async def update_term(term_id: int, body: TermUpdate, db: DbSession, user: CurrentUser) -> TermOut:
    return await service.update_term(db, user.id, term_id, body)


@router.delete("/terms/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_term(term_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_term(db, user.id, term_id)
