from fastapi import APIRouter, status

from app.categories import service
from app.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.deps import CurrentUser, DbSession

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(db: DbSession, user: CurrentUser) -> list[CategoryOut]:
    return [CategoryOut.model_validate(c) for c in await service.list_categories(db, user.id)]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, db: DbSession, user: CurrentUser) -> CategoryOut:
    return CategoryOut.model_validate(await service.create_category(db, user.id, body))


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int, body: CategoryUpdate, db: DbSession, user: CurrentUser
) -> CategoryOut:
    return CategoryOut.model_validate(await service.update_category(db, user.id, category_id, body))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_category(db, user.id, category_id)
