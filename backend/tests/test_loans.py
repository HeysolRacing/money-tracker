from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


async def _borrower(client: AsyncClient, name: str = "Ricardo") -> dict[str, Any]:
    res = await client.post("/api/loans/borrowers", json={"name": name})
    assert res.status_code == 201, res.text
    return res.json()


async def _entry(client: AsyncClient, borrower_id: int, **overrides: Any) -> dict[str, Any]:
    body = {
        "borrower_id": borrower_id,
        "entry_date": "2026-04-14",
        "description": "Préstamo",
        **overrides,
    }
    res = await client.post("/api/loans", json=body)
    assert res.status_code == 201, res.text
    return res.json()


async def test_entry_amounts_default_to_zero(auth_client: AsyncClient) -> None:
    b = await _borrower(auth_client)
    entry = await _entry(auth_client, b["id"], lent="10999")
    assert entry["lent"] == "10999.00"
    assert entry["paid"] == "0.00"


async def test_entry_needs_an_amount(auth_client: AsyncClient) -> None:
    b = await _borrower(auth_client)
    res = await auth_client.post(
        "/api/loans",
        json={"borrower_id": b["id"], "entry_date": "2026-04-14", "description": "Nada"},
    )
    assert res.status_code == 400
    entry = await _entry(auth_client, b["id"], paid="914")
    res = await auth_client.patch(f"/api/loans/{entry['id']}", json={"paid": "0"})
    assert res.status_code == 400
    assert (await auth_client.get("/api/loans")).json()["items"][0]["paid"] == "914.00"


async def test_negative_amounts_rejected(auth_client: AsyncClient) -> None:
    b = await _borrower(auth_client)
    res = await auth_client.post(
        "/api/loans",
        json={
            "borrower_id": b["id"],
            "entry_date": "2026-04-14",
            "description": "X",
            "lent": "-1",
        },
    )
    assert res.status_code == 422


async def test_balance_and_revenue_are_netted_per_borrower(auth_client: AsyncClient) -> None:
    ricardo = await _borrower(auth_client, "Ricardo")
    aromas = await _borrower(auth_client, "Aromas")
    # Ricardo still owes 600; Aromas paid back 150 more than lent (revenue).
    await _entry(auth_client, ricardo["id"], lent="1000")
    await _entry(auth_client, ricardo["id"], paid="400")
    await _entry(auth_client, aromas["id"], lent="500")
    await _entry(auth_client, aromas["id"], paid="650")

    summary = (await auth_client.get("/api/loans")).json()["summary"]
    assert summary == {
        "count": 4,
        "lent": "1500.00",
        "paid": "1050.00",
        "balance": "600.00",
        "revenue": "150.00",
    }

    borrowers = {
        b["name"]: b["totals"] for b in (await auth_client.get("/api/loans/borrowers")).json()
    }
    assert list(borrowers) == ["Aromas", "Ricardo"]
    assert borrowers["Ricardo"]["balance"] == "600.00"
    assert borrowers["Ricardo"]["revenue"] == "0.00"
    assert borrowers["Aromas"]["balance"] == "0.00"
    assert borrowers["Aromas"]["revenue"] == "150.00"


async def test_filters_and_ledger_order(auth_client: AsyncClient) -> None:
    ricardo = await _borrower(auth_client, "Ricardo")
    veracruz = await _borrower(auth_client, "Veracruz")
    await _entry(
        auth_client, ricardo["id"], entry_date="2026-06-01", description="PAGO 1", paid="914"
    )
    await _entry(
        auth_client, ricardo["id"], entry_date="2026-04-14", description="OSVALDO", lent="10999"
    )
    await _entry(auth_client, veracruz["id"], description="Herramienta", lent="5100")

    async def descriptions(**params: Any) -> list[str]:
        res = await auth_client.get("/api/loans", params=params)
        assert res.status_code == 200, res.text
        return [e["description"] for e in res.json()["items"]]

    assert await descriptions(borrower_id=ricardo["id"]) == ["OSVALDO", "PAGO 1"]
    assert await descriptions(q="herram") == ["Herramienta"]
    # Date bounds are inclusive.
    assert await descriptions(date_from="2026-06-01") == ["PAGO 1"]
    assert await descriptions(date_to="2026-04-14") == ["OSVALDO", "Herramienta"]
    assert await descriptions(date_from="2026-04-15", date_to="2026-05-31") == []

    res = await auth_client.get("/api/loans", params={"date_from": "2026-05-01"})
    assert res.json()["summary"]["paid"] == "914.00"


async def test_borrower_names_are_unique_and_delete_is_guarded(auth_client: AsyncClient) -> None:
    b = await _borrower(auth_client, "Ahlova")
    res = await auth_client.post("/api/loans/borrowers", json={"name": "Ahlova"})
    assert res.status_code == 409

    renamed = await auth_client.patch(f"/api/loans/borrowers/{b['id']}", json={"name": "Ahlova SA"})
    assert renamed.json()["name"] == "Ahlova SA"

    entry = await _entry(auth_client, b["id"], lent="100")
    assert (await auth_client.delete(f"/api/loans/borrowers/{b['id']}")).status_code == 409
    assert (await auth_client.delete(f"/api/loans/{entry['id']}")).status_code == 204
    assert (await auth_client.delete(f"/api/loans/borrowers/{b['id']}")).status_code == 204


async def test_other_users_loans_are_invisible(auth_client: AsyncClient, db: AsyncSession) -> None:
    import datetime as dt
    from decimal import Decimal

    from app.auth.service import create_user
    from app.loans.models import Borrower, LoanEntry

    other = await create_user(db, "other@example.com", "password123")
    borrower = Borrower(user_id=other.id, name="Ajeno")
    db.add(borrower)
    await db.flush()
    db.add(
        LoanEntry(
            user_id=other.id,
            borrower_id=borrower.id,
            entry_date=dt.date(2026, 8, 1),
            description="Ajeno",
            lent=Decimal("1"),
        )
    )
    await db.commit()

    assert (await auth_client.get("/api/loans")).json()["items"] == []
    assert (await auth_client.get("/api/loans/borrowers")).json() == []
    # Can't attach an entry to someone else's borrower.
    res = await auth_client.post(
        "/api/loans",
        json={
            "borrower_id": borrower.id,
            "entry_date": "2026-04-14",
            "description": "X",
            "lent": "1",
        },
    )
    assert res.status_code == 404
