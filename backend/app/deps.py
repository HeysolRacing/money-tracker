from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.models import User
from app.db import get_db
from app.errors import AppError

SESSION_COOKIE = "mt_session"

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    mt_session: Annotated[str | None, Cookie()] = None,
) -> User:
    if mt_session is None:
        raise AppError.unauthorized()
    user = await service.get_user_by_token(db, mt_session)
    if user is None:
        raise AppError.unauthorized("Sesión expirada")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
