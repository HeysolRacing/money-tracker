from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories import defaults
from app.categories.models import Category, CategoryKind
from app.categories.schemas import CategoryCreate, CategoryUpdate
from app.common.crud import get_owned
from app.errors import AppError


async def list_categories(db: AsyncSession, user_id: int) -> list[Category]:
    query = (
        select(Category).where(Category.user_id == user_id).order_by(Category.kind, Category.name)
    )
    return list((await db.scalars(query)).all())


async def _validate_parent(
    db: AsyncSession, user_id: int, parent_id: int, kind: str, self_id: int | None = None
) -> None:
    parent = await get_owned(db, Category, parent_id, user_id, "Categoría padre")
    if parent.id == self_id:
        raise AppError.bad_request("Una categoría no puede ser su propia categoría padre")
    if parent.kind != kind:
        raise AppError.bad_request("La categoría padre debe ser del mismo tipo")
    if parent.parent_id is not None:
        raise AppError.bad_request("Solo se permiten dos niveles de categorías")


async def create_category(db: AsyncSession, user_id: int, data: CategoryCreate) -> Category:
    if data.parent_id is not None:
        await _validate_parent(db, user_id, data.parent_id, data.kind)
    category = Category(user_id=user_id, **data.model_dump())
    db.add(category)
    await _commit_unique(db)
    return category


async def update_category(
    db: AsyncSession, user_id: int, category_id: int, data: CategoryUpdate
) -> Category:
    category = await get_owned(db, Category, category_id, user_id, "Categoría")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("parent_id") is not None:
        has_children = await db.scalar(
            select(func.count()).where(Category.parent_id == category.id)
        )
        if has_children:
            raise AppError.bad_request("Una categoría con subcategorías no puede tener padre")
        await _validate_parent(db, user_id, changes["parent_id"], category.kind, category.id)
    for field, value in changes.items():
        setattr(category, field, value)
    await _commit_unique(db)
    return category


async def delete_category(db: AsyncSession, user_id: int, category_id: int) -> None:
    category = await get_owned(db, Category, category_id, user_id, "Categoría")
    has_children = await db.scalar(select(func.count()).where(Category.parent_id == category.id))
    if has_children:
        raise AppError.conflict("Elimina o mueve primero sus subcategorías")
    # Transactions in this category become uncategorized (FK ON DELETE SET NULL).
    await db.delete(category)
    await db.commit()


async def seed_defaults(db: AsyncSession, user_id: int) -> int:
    """Creates the default categories that don't exist yet. Returns how many were created."""
    existing = {(c.kind, c.name): c for c in await list_categories(db, user_id)}
    created = 0
    for kind, tree in (
        (CategoryKind.EXPENSE, defaults.EXPENSE),
        (CategoryKind.INCOME, defaults.INCOME),
    ):
        for parent_name, children in tree.items():
            parent = existing.get((kind, parent_name))
            if parent is None:
                parent = Category(user_id=user_id, name=parent_name, kind=kind)
                db.add(parent)
                await db.flush()
                created += 1
            for child_name in children:
                if (kind, child_name) not in existing:
                    db.add(
                        Category(user_id=user_id, name=child_name, kind=kind, parent_id=parent.id)
                    )
                    created += 1
    await db.commit()
    return created


async def _commit_unique(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError.conflict("Ya existe una categoría con ese nombre") from exc
