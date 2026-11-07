import datetime as dt
from decimal import Decimal
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.investments.interest import linear_trend, projected_value, simple_interest

D = Decimal


async def _investment(
    client: AsyncClient, name: str = "OPENBANK", group: str = "main"
) -> dict[str, Any]:
    res = await client.post("/api/investments", json={"name": name, "group": group})
    assert res.status_code == 201, res.text
    return res.json()


async def _balance(
    client: AsyncClient, investment_id: int, year: int, month: int, amount: str | None
) -> None:
    res = await client.put(
        f"/api/investments/{investment_id}/balances/{year}/{month}", json={"amount": amount}
    )
    assert res.status_code == 200, res.text


async def _term(client: AsyncClient, investment_id: int, **overrides: Any) -> dict[str, Any]:
    body = {
        "start_date": "2026-01-01",
        "days": 90,
        "amount": "100000",
        "annual_rate": "10",
        **overrides,
    }
    res = await client.post(f"/api/investments/{investment_id}/terms", json=body)
    assert res.status_code == 201, res.text
    return res.json()


# --- Math --------------------------------------------------------------------


def test_simple_interest_uses_a_360_day_year() -> None:
    assert simple_interest(D("100000"), D("10"), 90) == D("2500.00")
    assert simple_interest(D("102500"), D("11.5"), 90) == D("2946.88")  # 2946.875 rounds up


def test_projected_value_renews_with_principal_plus_interest() -> None:
    start = dt.date(2026, 1, 1)
    # Ends before the horizon: one full term, then 30 of the next 90 days accrued.
    value = projected_value(D("100000"), D("10"), 90, start, D("0"), start + dt.timedelta(120))
    assert value == D("102500") + simple_interest(D("102500"), D("10"), 30)
    # ISR is deducted from the first (known) term only.
    with_isr = projected_value(D("100000"), D("10"), 90, start, D("100"), start + dt.timedelta(90))
    assert with_isr == D("102400.00")
    # Still running on the horizon: accrued interest so far.
    assert projected_value(D("100000"), D("10"), 90, start, D("0"), start) == D("100000")


def test_linear_trend() -> None:
    slope, intercept = linear_trend([(0, D("100")), (1, D("200")), (3, D("400"))])
    assert (slope, intercept) == (D("100"), D("100"))


# --- Investments and grid ----------------------------------------------------


async def test_names_are_unique_per_group(auth_client: AsyncClient) -> None:
    await _investment(auth_client, "BANORTE")
    res = await auth_client.post("/api/investments", json={"name": "BANORTE"})
    assert res.status_code == 409
    # The same institution can also be an occasional investment, as in the spreadsheet.
    await _investment(auth_client, "BANORTE", "occasional")


async def test_grid_totals_like_the_spreadsheet(auth_client: AsyncClient) -> None:
    bbva = await _investment(auth_client, "BBVA")
    nu = await _investment(auth_client, "NU")
    infonavit = await _investment(auth_client, "INFONAVIT", "occasional")
    await _balance(auth_client, bbva["id"], 2025, 2, "1058")
    await _balance(auth_client, bbva["id"], 2025, 3, "0")  # "$ -"
    await _balance(auth_client, nu["id"], 2025, 1, "27469.53")
    await _balance(auth_client, nu["id"], 2025, 2, "27761.74")
    await _balance(auth_client, nu["id"], 2025, 3, "27955.18")
    await _balance(auth_client, infonavit["id"], 2025, 1, "10000")
    await _balance(auth_client, infonavit["id"], 2025, 2, "10000")
    # Overwrite, then clear a cell.
    await _balance(auth_client, nu["id"], 2025, 4, "1")
    await _balance(auth_client, nu["id"], 2025, 4, None)

    grid = (await auth_client.get("/api/investments", params={"year": 2025})).json()
    rows = {r["name"]: r for r in grid["items"]}
    assert rows["BBVA"]["months"][:4] == [None, "1058.00", "0.00", None]
    assert rows["NU"]["months"][3] is None
    totals = grid["totals"]
    assert totals["main"][:4] == ["27469.53", "28819.74", "27955.18", None]
    assert totals["occasional"][:3] == ["10000.00", "10000.00", None]
    assert totals["overall"][:4] == ["37469.53", "38819.74", "27955.18", None]
    assert 2025 in grid["years"]

    summary = grid["summary"]
    assert summary["as_of_month"] == 3
    assert summary["current_total"] == "27955.18"
    assert summary["monthly_change"] == "-10864.56"
    assert summary["year_change"] == "-9514.35"


async def test_future_months_are_not_the_current_total(auth_client: AsyncClient) -> None:
    finsus = await _investment(auth_client, "FINSUS")
    await _balance(auth_client, finsus["id"], 2099, 1, "205473.92")
    grid = (await auth_client.get("/api/investments", params={"year": 2099})).json()
    assert grid["totals"]["overall"][0] == "205473.92"  # still shown in the grid
    assert grid["summary"]["as_of_month"] is None
    assert grid["summary"]["current_total"] is None


async def test_balances_must_be_valid(auth_client: AsyncClient) -> None:
    inv = await _investment(auth_client)
    url = f"/api/investments/{inv['id']}/balances/2025"
    assert (await auth_client.put(f"{url}/13", json={"amount": "1"})).status_code == 422
    assert (await auth_client.put(f"{url}/1", json={"amount": "-1"})).status_code == 422


async def test_delete_investment_cascades(auth_client: AsyncClient) -> None:
    inv = await _investment(auth_client)
    await _balance(auth_client, inv["id"], 2025, 1, "100")
    await _term(auth_client, inv["id"])
    assert (await auth_client.delete(f"/api/investments/{inv['id']}")).status_code == 204
    grid = (await auth_client.get("/api/investments", params={"year": 2025})).json()
    assert grid["items"] == []
    assert grid["totals"]["overall"][0] is None


# --- Terms -------------------------------------------------------------------


async def test_term_details(auth_client: AsyncClient) -> None:
    inv = await _investment(auth_client, "MIFEL")
    first = await _term(auth_client, inv["id"], isr_withheld="100")
    assert first["end_date"] == "2026-04-01"
    assert first["interest"] == "2500.00"
    assert first["net_interest"] == "2400.00"
    assert first["final_amount"] == "102400.00"
    assert first["annual_rate"] == "10"
    assert first["status"] == "matured"

    # Renewed with principal + interest at 11.5%.
    second = await _term(
        auth_client,
        inv["id"],
        start_date=first["end_date"],
        amount=first["final_amount"],
        annual_rate="11.5",
    )
    assert second["interest"] == "2944.00"  # 102,400 × 11.5% × 90 / 360
    assert second["annual_rate"] == "11.5"

    listed = (await auth_client.get(f"/api/investments/{inv['id']}/terms")).json()
    assert [t["id"] for t in listed["items"]] == [first["id"], second["id"]]
    assert listed["totals"]["count"] == 2
    assert listed["totals"]["net_interest"] == "5344.00"


async def test_term_status_and_summary(auth_client: AsyncClient) -> None:
    today = dt.date.today()
    inv = await _investment(auth_client, "STORI")
    await _term(auth_client, inv["id"], start_date=today.isoformat(), days=30, amount="36000")
    future = (today + dt.timedelta(days=10)).isoformat()
    scheduled = await _term(auth_client, inv["id"], start_date=future, days=30, amount="1000")
    assert scheduled["status"] == "scheduled"

    grid = (await auth_client.get("/api/investments")).json()
    assert grid["year"] == today.year
    assert grid["items"][0]["term_count"] == 2
    assert grid["items"][0]["active_terms"] == 2
    summary = grid["summary"]
    assert summary["active_terms"] == 2
    assert summary["active_principal"] == "37000.00"
    assert summary["expected_interest"] == "308.33"  # 300.00 + 8.33


async def test_parallel_terms_add_up(auth_client: AsyncClient) -> None:
    """Several deposits can run at once (as with STORI): the invested amount is the sum of
    every term that hasn't matured, not the latest term."""
    today = dt.date.today()
    inv = await _investment(auth_client, "STORI")
    started = (today - dt.timedelta(days=10)).isoformat()
    await _term(auth_client, inv["id"], start_date="2020-01-01", amount="100000")  # matured
    await _term(auth_client, inv["id"], start_date=started, days=180, amount="100000")
    await _term(auth_client, inv["id"], start_date=started, days=90, amount="207680")
    await _term(auth_client, inv["id"], start_date=today.isoformat(), amount="152306")

    totals = (await auth_client.get(f"/api/investments/{inv['id']}/terms")).json()["totals"]
    assert totals["count"] == 4
    assert totals["running"] == 3
    assert totals["invested"] == "459986.00"
    # 5,000.00 + 5,192.00 + 3,807.65 of interest on top.
    assert totals["invested_at_maturity"] == "473985.65"


async def test_term_validation(auth_client: AsyncClient) -> None:
    inv = await _investment(auth_client)
    url = f"/api/investments/{inv['id']}/terms"
    base = {"start_date": "2026-01-01", "days": 90, "amount": "1000", "annual_rate": "10"}
    assert (await auth_client.post(url, json={**base, "days": 0})).status_code == 422
    assert (await auth_client.post(url, json={**base, "annual_rate": "0"})).status_code == 422
    # Interest is 25.00, so 26 of ISR is impossible.
    assert (await auth_client.post(url, json={**base, "isr_withheld": "26"})).status_code == 400

    term = await _term(auth_client, inv["id"], amount="1000", isr_withheld="5", notes="Pagaré")
    res = await auth_client.patch(f"/api/investments/terms/{term['id']}", json={"days": 30})
    assert res.json()["interest"] == "8.33"
    res = await auth_client.patch(f"/api/investments/terms/{term['id']}", json={"days": 1})
    assert res.status_code == 400  # 0.28 of interest < 5 of ISR
    res = await auth_client.patch(f"/api/investments/terms/{term['id']}", json={"notes": None})
    assert res.json()["notes"] is None
    assert res.json()["days"] == 30
    assert (await auth_client.delete(f"/api/investments/terms/{term['id']}")).status_code == 204


# --- Dashboard ---------------------------------------------------------------


async def test_dashboard_history_and_forecast(auth_client: AsyncClient) -> None:
    today = dt.date.today()
    cetes = await _investment(auth_client, "CETES")
    x3 = await _investment(auth_client, "X3", "occasional")
    await _balance(auth_client, cetes["id"], 2025, 1, "100")
    await _balance(auth_client, cetes["id"], 2025, 2, "150")
    await _balance(auth_client, x3["id"], 2025, 2, "50")
    await _balance(auth_client, cetes["id"], 2025, 3, "300")
    await _balance(auth_client, cetes["id"], today.year + 1, 1, "999")  # future: ignored

    dash = (await auth_client.get("/api/investments/dashboard")).json()
    assert [(p["month"], p["main"], p["occasional"], p["total"]) for p in dash["history"]] == [
        (1, "100.00", "0.00", "100.00"),
        (2, "150.00", "50.00", "200.00"),
        (3, "300.00", "0.00", "300.00"),
    ]
    assert dash["trend"]["monthly_growth"] == "100.00"
    assert dash["trend"]["months_used"] == 3
    assert [(f["year"], f["month"], f["total"]) for f in dash["forecast"][:2]] == [
        (2025, 4, "400.00"),
        (2025, 5, "500.00"),
    ]
    assert len(dash["forecast"]) == 6
    months_to_december = (today.year - 2025) * 12 + 11
    assert dash["trend"]["projected_year_end"] == f"{100 + 100 * months_to_december}.00"


async def test_dashboard_maturities_and_growth(auth_client: AsyncClient) -> None:
    today = dt.date.today()
    mifel = await _investment(auth_client, "MIFEL")
    await _balance(auth_client, mifel["id"], today.year, 1, "1000")
    await _balance(auth_client, mifel["id"], today.year, today.month, "1500")
    await _term(auth_client, mifel["id"], start_date="2020-01-01")  # matured: not listed
    running = await _term(
        auth_client, mifel["id"], start_date=today.isoformat(), days=30, amount="36000"
    )

    dash = (await auth_client.get("/api/investments/dashboard")).json()
    [maturity] = dash["maturities"]
    assert maturity["term_id"] == running["id"]
    assert maturity["investment_name"] == "MIFEL"
    assert maturity["days_left"] == 30
    assert maturity["final_amount"] == "36300.00"
    assert dash["terms_projection"]["principal"] == "36000.00"
    assert D(dash["terms_projection"]["projected_value"]) > D("36300")

    [growth] = dash["growth"]
    if today.month > 1:
        assert (growth["first"], growth["latest"], growth["change"]) == (
            "1000.00",
            "1500.00",
            "500.00",
        )


async def test_other_users_investments_are_invisible(
    auth_client: AsyncClient, db: AsyncSession
) -> None:
    from app.auth.service import create_user
    from app.investments.models import Investment

    other = await create_user(db, "other@example.com", "password123")
    theirs = Investment(user_id=other.id, name="AJENA")
    db.add(theirs)
    await db.commit()

    assert (await auth_client.get("/api/investments")).json()["items"] == []
    url = f"/api/investments/{theirs.id}"
    assert (
        await auth_client.put(f"{url}/balances/2025/1", json={"amount": "1"})
    ).status_code == 404
    assert (await auth_client.get(f"{url}/terms")).status_code == 404
    assert (await auth_client.delete(url)).status_code == 404
