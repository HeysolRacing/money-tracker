from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories import defaults
from app.categories.service import seed_defaults


async def test_seed_defaults_is_idempotent(auth_client: AsyncClient, db: AsyncSession) -> None:
    expected = sum(1 + len(children) for children in defaults.EXPENSE.values()) + sum(
        1 + len(children) for children in defaults.INCOME.values()
    )
    assert await seed_defaults(db, 1) == expected
    assert await seed_defaults(db, 1) == 0

    categories = (await auth_client.get("/api/categories")).json()
    assert len(categories) == expected
    by_name = {c["name"]: c for c in categories}
    assert by_name["Supermercado"]["parent_id"] == by_name["Alimentación"]["id"]


async def test_parent_must_match_kind_and_depth(auth_client: AsyncClient) -> None:
    parent = (
        await auth_client.post("/api/categories", json={"name": "Mascotas", "kind": "expense"})
    ).json()
    child = await auth_client.post(
        "/api/categories",
        json={"name": "Veterinario", "kind": "expense", "parent_id": parent["id"]},
    )
    assert child.status_code == 201

    wrong_kind = await auth_client.post(
        "/api/categories", json={"name": "Bono", "kind": "income", "parent_id": parent["id"]}
    )
    assert wrong_kind.status_code == 400

    too_deep = await auth_client.post(
        "/api/categories",
        json={"name": "Vacunas", "kind": "expense", "parent_id": child.json()["id"]},
    )
    assert too_deep.status_code == 400


async def test_duplicate_name_conflicts(auth_client: AsyncClient) -> None:
    await auth_client.post("/api/categories", json={"name": "Mascotas", "kind": "expense"})
    res = await auth_client.post("/api/categories", json={"name": "Mascotas", "kind": "expense"})
    assert res.status_code == 409


async def test_delete_parent_with_children_conflicts(auth_client: AsyncClient) -> None:
    parent = (
        await auth_client.post("/api/categories", json={"name": "Mascotas", "kind": "expense"})
    ).json()
    await auth_client.post(
        "/api/categories",
        json={"name": "Veterinario", "kind": "expense", "parent_id": parent["id"]},
    )
    assert (await auth_client.delete(f"/api/categories/{parent['id']}")).status_code == 409
