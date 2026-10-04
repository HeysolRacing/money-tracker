from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


async def _create(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    body = {
        "application_date": "2026-08-22",
        "concept": "Consultoría agosto",
        "subtotal": "10000",
        "iva": "1600",
        **overrides,
    }
    res = await client.post("/api/invoices", json=body)
    assert res.status_code == 201, res.text
    return res.json()


async def test_total_is_subtotal_plus_iva(auth_client: AsyncClient) -> None:
    invoice = await _create(auth_client, subtotal="1234.5", iva="197.52")
    assert invoice["subtotal"] == "1234.50"
    assert invoice["iva"] == "197.52"
    assert invoice["total"] == "1432.02"
    assert invoice["is_invoiced"] is False and invoice["is_extra"] is False


async def test_negative_amounts_rejected(auth_client: AsyncClient) -> None:
    res = await auth_client.post(
        "/api/invoices",
        json={"application_date": "2026-08-22", "concept": "X", "subtotal": "-1", "iva": "0"},
    )
    assert res.status_code == 422


async def test_summary_splits_invoiced_pending_and_extra(auth_client: AsyncClient) -> None:
    await _create(auth_client, subtotal="1000", iva="160", is_invoiced=True)
    await _create(auth_client, subtotal="500", iva="80", is_extra=True)
    await _create(auth_client, subtotal="200", iva="32", is_invoiced=True, is_extra=True)

    summary = (await auth_client.get("/api/invoices")).json()["summary"]
    assert summary["all"] == {
        "count": 3,
        "subtotal": "1700.00",
        "iva": "272.00",
        "total": "1972.00",
    }
    assert summary["invoiced"] == {
        "count": 2,
        "subtotal": "1200.00",
        "iva": "192.00",
        "total": "1392.00",
    }
    assert summary["pending"]["total"] == "580.00"
    assert summary["extra"] == {
        "count": 2,
        "subtotal": "700.00",
        "iva": "112.00",
        "total": "812.00",
    }


async def test_empty_summary_is_zero(auth_client: AsyncClient) -> None:
    body = (await auth_client.get("/api/invoices")).json()
    assert body["items"] == []
    assert body["summary"]["all"] == {
        "count": 0,
        "subtotal": "0.00",
        "iva": "0.00",
        "total": "0.00",
    }


async def test_filters(auth_client: AsyncClient) -> None:
    await _create(auth_client, application_date="2026-08-22", concept="Agosto", is_invoiced=True)
    await _create(auth_client, application_date="2026-09-05", concept="Septiembre", is_extra=True)
    await _create(auth_client, application_date="2025-09-05", concept="Año pasado")

    async def concepts(**params: Any) -> list[str]:
        res = await auth_client.get("/api/invoices", params=params)
        assert res.status_code == 200, res.text
        return [i["concept"] for i in res.json()["items"]]

    assert await concepts(year=2026) == ["Septiembre", "Agosto"]
    assert await concepts(year=2026, month=8) == ["Agosto"]
    assert await concepts(is_invoiced=False) == ["Septiembre", "Año pasado"]
    assert await concepts(is_extra=True) == ["Septiembre"]
    assert await concepts(q="sept") == ["Septiembre"]


async def test_toggle_and_delete(auth_client: AsyncClient) -> None:
    invoice = await _create(auth_client)
    res = await auth_client.patch(f"/api/invoices/{invoice['id']}", json={"is_invoiced": True})
    assert res.json()["is_invoiced"] is True
    assert res.json()["concept"] == "Consultoría agosto"

    assert (await auth_client.delete(f"/api/invoices/{invoice['id']}")).status_code == 204
    assert (await auth_client.get("/api/invoices")).json()["items"] == []


async def test_other_users_invoices_are_invisible(
    auth_client: AsyncClient, db: AsyncSession
) -> None:
    import datetime as dt
    from decimal import Decimal

    from app.auth.service import create_user
    from app.invoices.models import Invoice

    other = await create_user(db, "other@example.com", "password123")
    db.add(
        Invoice(
            user_id=other.id,
            application_date=dt.date(2026, 8, 1),
            concept="Ajena",
            subtotal=Decimal("1"),
            iva=Decimal("0"),
        )
    )
    await db.commit()

    assert (await auth_client.get("/api/invoices")).json()["items"] == []
    assert (await auth_client.patch("/api/invoices/1", json={"is_extra": True})).status_code == 404
