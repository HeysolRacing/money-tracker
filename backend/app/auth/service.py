import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User, UserSession

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerificationError:
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_user(db: AsyncSession, email: str, password: str, rfc: str | None = None) -> User:
    user = User(email=email.lower().strip(), password_hash=hash_password(password), rfc=rfc)
    db.add(user)
    await db.commit()
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    user = await db.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None or not verify_password(user.password_hash, password):
        return None
    return user


async def create_session(db: AsyncSession, user: User, ttl: timedelta) -> str:
    """Creates a session and returns the raw token to put in the cookie."""
    token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            token_hash=_hash_token(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + ttl,
        )
    )
    await db.commit()
    return token


async def get_user_by_token(db: AsyncSession, token: str) -> User | None:
    session = await db.get(UserSession, _hash_token(token))
    if session is None or session.expires_at < datetime.now(UTC):
        return None
    return await db.get(User, session.user_id)


async def delete_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(token)))
    await db.commit()
