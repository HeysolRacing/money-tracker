from httpx import AsyncClient


async def _create(client: AsyncClient, **overrides: object) -> dict:
    body = {"name": "BBVA Débito", "bank": "BBVA", "type": "debit", **overrides}
    res = await client.post("/api/accounts", json=body)
    assert res.status_code == 201, res.text
    return res.json()


async def test_requires_login(client: AsyncClient) -> None:
    assert (await client.get("/api/accounts")).status_code == 401


async def test_create_and_list_serializes_money_as_string(auth_client: AsyncClient) -> None:
    await _create(auth_client, opening_balance="1500.50")
    accounts = (await auth_client.get("/api/accounts")).json()
    assert len(accounts) == 1
    assert accounts[0]["balance"] == "1500.50"
    assert accounts[0]["currency"] == "MXN"


async def test_card_fields_cleared_for_non_card(auth_client: AsyncClient) -> None:
    account = await _create(auth_client, credit_limit="1000", statement_day=5)
    assert account["credit_limit"] is None
    assert account["statement_day"] is None


async def test_credit_card_balance_goes_negative_with_purchases(auth_client: AsyncClient) -> None:
    card = await _create(
        auth_client,
        name="Liverpool",
        bank="Liverpool",
        type="credit_card",
        credit_limit="20000",
        statement_day=10,
        payment_due_day=30,
    )
    debit = await _create(auth_client, opening_balance="5000")
    await auth_client.post(
        "/api/transactions",
        json={
            "account_id": card["id"],
            "date": "2026-10-01",
            "kind": "expense",
            "amount": "1200.00",
            "description": "Compra",
        },
    )
    await auth_client.post(
        "/api/transfers",
        json={
            "from_account_id": debit["id"],
            "to_account_id": card["id"],
            "date": "2026-10-02",
            "amount": "1000",
            "description": "Pago tarjeta",
        },
    )
    balances = {a["id"]: a["balance"] for a in (await auth_client.get("/api/accounts")).json()}
    assert balances[card["id"]] == "-200.00"
    assert balances[debit["id"]] == "4000.00"


async def test_delete_blocked_when_account_has_transactions(auth_client: AsyncClient) -> None:
    account = await _create(auth_client)
    await auth_client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "date": "2026-10-01",
            "kind": "expense",
            "amount": "10",
            "description": "Café",
        },
    )
    res = await auth_client.delete(f"/api/accounts/{account['id']}")
    assert res.status_code == 409

    archived = await auth_client.patch(f"/api/accounts/{account['id']}", json={"is_archived": True})
    assert archived.json()["is_archived"] is True
    assert (await auth_client.get("/api/accounts")).json() == []
    with_archived = await auth_client.get("/api/accounts", params={"include_archived": True})
    assert len(with_archived.json()) == 1


async def test_other_users_accounts_are_invisible(auth_client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    from app.accounts.models import Account
    from app.auth.service import create_user

    other = await create_user(db, "other@example.com", "password123")
    db.add(Account(user_id=other.id, name="Ajena", type="debit"))
    await db.commit()

    assert (await auth_client.get("/api/accounts")).json() == []
    assert (await auth_client.get("/api/accounts/1")).status_code == 404
