from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.auth import service
from app.auth.schemas import LoginRequest, UserOut
from app.config import get_settings
from app.deps import SESSION_COOKIE, CurrentUser, DbSession
from app.errors import AppError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, response: Response, db: DbSession) -> UserOut:
    user = await service.authenticate(db, body.email, body.password)
    if user is None:
        raise AppError.unauthorized("Correo o contraseña incorrectos")

    settings = get_settings()
    ttl = timedelta(days=settings.session_ttl_days)
    token = await service.create_session(db, user, ttl)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(ttl.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    mt_session: Annotated[str | None, Cookie()] = None,
) -> None:
    if mt_session:
        await service.delete_session(db, mt_session)
    response.delete_cookie(SESSION_COOKIE)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
