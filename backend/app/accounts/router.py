from fastapi import APIRouter, status

from app.accounts import service
from app.accounts.schemas import AccountCreate, AccountOut, AccountUpdate
from app.deps import CurrentUser, DbSession

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    db: DbSession, user: CurrentUser, include_archived: bool = False
) -> list[AccountOut]:
    return await service.list_accounts(db, user.id, include_archived)


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(body: AccountCreate, db: DbSession, user: CurrentUser) -> AccountOut:
    return await service.create_account(db, user.id, body)


@router.get("/{account_id}", response_model=AccountOut)
async def get_account(account_id: int, db: DbSession, user: CurrentUser) -> AccountOut:
    return await service.get_account(db, user.id, account_id)


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: int, body: AccountUpdate, db: DbSession, user: CurrentUser
) -> AccountOut:
    return await service.update_account(db, user.id, account_id, body)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(account_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_account(db, user.id, account_id)
