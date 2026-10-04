"""Tests run against a real Postgres database (TEST_DATABASE_URL), recreated per session
and truncated between tests."""

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://moneytracker:moneytracker@localhost:5432/moneytracker_test",
)
# Must be set before importing the app so its engine points at the test DB.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

engine = create_async_engine(TEST_DATABASE_URL)
TestSession = async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
async def _schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables() -> AsyncIterator[None]:
    yield
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    async with TestSession() as session:
        yield session


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async def _get_db() -> AsyncIterator[AsyncSession]:
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """A client already logged in as test@example.com."""
    from app.auth.service import create_user

    await create_user(db, "test@example.com", "password123")
    res = await client.post(
        "/api/auth/login", json={"email": "test@example.com", "password": "password123"}
    )
    assert res.status_code == 200
    return client
