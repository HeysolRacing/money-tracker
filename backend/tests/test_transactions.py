from typing import Any

import pytest
from httpx import AsyncClient


@pytest.fixture
async def setup(auth_client: AsyncClient) -> dict[str, Any]:
    async def post(path: str, body: dict[str, Any]) -> dict[str, Any]:
        res = await auth_client.post(path, json=body)
        assert res.status_code == 201, res.text
        return res.json()

    debit = await post("/api/accounts", {"name": "BBVA", "type": "debit"})
    card = await post("/api/accounts", {"name": "Inbursa", "type": "credit_card"})
    usd = await post("/api/accounts", {"name": "Dólares", "type": "savings", "currency": "USD"})
    food = await post("/api/categories", {"name": "Alimentación", "kind": "expense"})
    groceries = await post(
        "/api/categories", {"name": "Supermercado", "kind": "expense", "parent_id": food["id"]}
    )
    salary = await post("/api/categories", {"name": "Salario", "kind": "income"})
    return {
        "debit": debit,
        "card": card,
        "usd": usd,
        "food": food,
        "groceries": groceries,
        "salary": salary,
    }


def _tx(account_id: int, **overrides: Any) -> dict[str, Any]:
    return {
        "account_id": account_id,
        "date": "2026-10-01",
        "kind": "expense",
        "amount": "100.00",
        "description": "Compra",
        **overrides,
    }


async def test_category_kind_must_match(auth_client: AsyncClient, setup: dict[str, Any]) -> None:
    res = await auth_client.post(
        "/api/transactions", json=_tx(setup["debit"]["id"], category_id=setup["salary"]["id"])
    )
    assert res.status_code == 400


async def test_amount_must_be_positive(auth_client: AsyncClient, setup: dict[str, Any]) -> None:
    res = await auth_client.post("/api/transactions", json=_tx(setup["debit"]["id"], amount="-5"))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_filters_and_pagination(auth_client: AsyncClient, setup: dict[str, Any]) -> None:
    debit, card = setup["debit"]["id"], setup["card"]["id"]
    for body in [
        _tx(debit, description="Walmart", category_id=setup["groceries"]["id"], date="2026-09-15"),
        _tx(card, description="Soriana", merchant="SORIANA", category_id=setup["food"]["id"]),
        _tx(debit, kind="income", description="Nómina", category_id=setup["salary"]["id"]),
        _tx(debit, description="Sin categoría"),
    ]:
        assert (await auth_client.post("/api/transactions", json=body)).status_code == 201

    async def ids(**params: Any) -> list[str]:
        res = await auth_client.get("/api/transactions", params=params)
        assert res.status_code == 200, res.text
        return [t["description"] for t in res.json()["items"]]

    # Parent category includes its subcategories.
    assert sorted(await ids(category_id=setup["food"]["id"])) == ["Soriana", "Walmart"]
    assert await ids(account_id=card) == ["Soriana"]
    assert await ids(kind="income") == ["Nómina"]
    assert await ids(date_to="2026-09-30") == ["Walmart"]
    assert await ids(q="soriana") == ["Soriana"]
    assert await ids(uncategorized=True) == ["Sin categoría"]

    # Default is newest first.
    assert await ids() == ["Sin categoría", "Nómina", "Soriana", "Walmart"]
    assert await ids(sort="description", order="asc") == [
        "Nómina",
        "Sin categoría",
        "Soriana",
        "Walmart",
    ]
    # Signed amounts: every expense is below the income.
    assert (await ids(sort="amount", order="desc"))[0] == "Nómina"
    # By label "Parent › Child"; uncategorized last in either direction.
    assert await ids(sort="category", order="asc") == [
        "Soriana",  # Alimentación
        "Walmart",  # Alimentación › Supermercado
        "Nómina",  # Salario
        "Sin categoría",
    ]
    assert await ids(sort="category", order="desc") == [
        "Nómina",
        "Walmart",
        "Soriana",
        "Sin categoría",
    ]
    # BBVA rows first, newest first within the account; then Inbursa.
    assert await ids(sort="account", order="asc") == [
        "Sin categoría",
        "Nómina",
        "Walmart",
        "Soriana",
    ]
    res = await auth_client.get("/api/transactions", params={"sort": "nope"})
    assert res.status_code == 422

    page = (await auth_client.get("/api/transactions", params={"limit": 2})).json()
    assert page["total"] == 4
    assert len(page["items"]) == 2


async def test_transfer_creates_linked_pair(
    auth_client: AsyncClient, setup: dict[str, Any]
) -> None:
    res = await auth_client.post(
        "/api/transfers",
        json={
            "from_account_id": setup["debit"]["id"],
            "to_account_id": setup["card"]["id"],
            "date": "2026-10-03",
            "amount": "500",
            "description": "Pago Inbursa",
        },
    )
    assert res.status_code == 201
    pair = res.json()
    out, inflow = pair["outflow"], pair["inflow"]
    assert out["kind"] == "transfer_out" and inflow["kind"] == "transfer_in"
    assert out["transfer_peer_id"] == inflow["id"]
    assert out["counterpart_account_id"] == setup["card"]["id"]

    # Shared fields are mirrored; amounts can't be edited.
    edited = await auth_client.patch(f"/api/transactions/{out['id']}", json={"date": "2026-10-04"})
    assert edited.status_code == 200
    peer = (await auth_client.get(f"/api/transactions/{inflow['id']}")).json()
    assert peer["date"] == "2026-10-04"
    assert peer["counterpart_account_id"] == setup["debit"]["id"]
    bad = await auth_client.patch(f"/api/transactions/{out['id']}", json={"amount": "1"})
    assert bad.status_code == 400

    # Deleting one side deletes both.
    assert (await auth_client.delete(f"/api/transactions/{inflow['id']}")).status_code == 204
    assert (await auth_client.get("/api/transactions")).json()["total"] == 0


async def test_cross_currency_transfer_requires_to_amount(
    auth_client: AsyncClient, setup: dict[str, Any]
) -> None:
    body = {
        "from_account_id": setup["debit"]["id"],
        "to_account_id": setup["usd"]["id"],
        "date": "2026-10-03",
        "amount": "1800",
    }
    assert (await auth_client.post("/api/transfers", json=body)).status_code == 400
    res = await auth_client.post("/api/transfers", json={**body, "to_amount": "100"})
    assert res.status_code == 201
    assert res.json()["inflow"]["amount"] == "100.00"


async def test_archived_account_rejects_new_transactions(
    auth_client: AsyncClient, setup: dict[str, Any]
) -> None:
    await auth_client.patch(f"/api/accounts/{setup['debit']['id']}", json={"is_archived": True})
    res = await auth_client.post("/api/transactions", json=_tx(setup["debit"]["id"]))
    assert res.status_code == 400
