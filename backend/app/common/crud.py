from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError


class _Owned(Protocol):
    user_id: Any


async def get_owned[T: _Owned](
    db: AsyncSession, model: type[T], id: int, user_id: int, label: str
) -> T:
    """Fetches a user's row by id, or raises 404 (never 403, so ids don't leak)."""
    obj = await db.get(model, id)
    if obj is None or obj.user_id != user_id:
        raise AppError.not_found(label)
    return obj
