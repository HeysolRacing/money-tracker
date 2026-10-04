from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import create_user


async def test_health(client: AsyncClient) -> None:
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_me_requires_login(client: AsyncClient) -> None:
    res = await client.get("/api/auth/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


async def test_login_rejects_wrong_password(client: AsyncClient, db: AsyncSession) -> None:
    await create_user(db, "me@example.com", "correct-password")
    res = await client.post(
        "/api/auth/login", json={"email": "me@example.com", "password": "wrong"}
    )
    assert res.status_code == 401


async def test_login_me_logout(client: AsyncClient, db: AsyncSession) -> None:
    await create_user(db, "Me@Example.com", "correct-password", rfc="XAXX010101000")

    res = await client.post(
        "/api/auth/login", json={"email": "me@example.com", "password": "correct-password"}
    )
    assert res.status_code == 200
    assert "mt_session" in res.cookies

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {"id": 1, "email": "me@example.com", "rfc": "XAXX010101000"}

    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401
