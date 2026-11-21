from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient

from app.statements import parsers
from app.statements.parsers import RowKind, StatementError, parse_bbva_azul, parse_bbva_oro

# Anonymized text of a BBVA Oro statement, one string per PDF page, as pdfplumber reads it.
PROMO = "Descubre todo lo que tu TDC puede hacer por ti\n"
HEADER = """Página 1 de 8
TU PAGO REQUERIDO ESTE PERIODO
CLIENTE DE PRUEBA
Periodo: 13-sep-2026 al 12-oct-2026
Colonia: CENTRO Fecha de corte: 12-oct-2026
TARJETA ORO BBVA (ORO) Pago para no generar intereses:2 $1,000.00
Número de tarjeta: 4000000000001234
Pago mínimo:4 $300.00
"""
MOVEMENTS_1 = """Número de cuenta: XXXXXX1234 Página 3 de 8
COMPRAS Y CARGOS DIFERIDOS A MESES SIN INTERESES Tarjeta titular: XXXXXXXXXXXX1234
16-nov-2025 AMAZON A MESES $6,799.00 $1,696.00 $567.00 9 de 12 0.00%
10-abr-2026 MERCADO PAGO ; Tarjeta Digital ***5678 $24,500.00 $8,164.00 $4,084.00 4 de 6 0.00%
CARGOS,COMPRAS Y ABONOS REGULARES(NO A MESES) Tarjeta titular: XXXXXXXXXXXX1234
Fecha
de la Descripción del movimiento Monto
02-oct-2026 03-oct-2026 NETFLIX COM 1 + $369.00
21-sep-2026 22-sep-2026 BMOVIL.PAGO TDC - $1,000.00
IVA :$ 0.00 Interes: $ 0.00 Comisiones:$0.00 Capital:$1,000.00
29-sep-2026 29-sep-2026 USO DE PUNTOS GASOLINERA - $66.50
"""
MOVEMENTS_2 = """Número de cuenta: XXXXXX1234 Página 4 de 8
CARGOS,COMPRAS Y ABONOS REGULARES(NO A MESES) Tarjeta titular: XXXXXXXXXXXX1234
10-oct-2026 13-oct-2026 SMARTFIT ; Tarjeta Digital ***5678 + $1,599.00
12-oct-2026 13-oct-2026 09 DE 12 AMAZON A MESES + $567.00
TOTAL CARGOS $2,535.00
TOTAL ABONOS -$1,066.50
"""
BENEFITS = """Número de cuenta: XXXXXX1234 Página 6 de 8
DETALLE DE TRANSACCIONES DE BENEFICIOS
2026-09-29 PGOPTOS 4000000000001234 PUNTOS BBVA 0 665 0
"""
PAGES = [PROMO, HEADER, MOVEMENTS_1, MOVEMENTS_2, BENEFITS]


def test_parse_bbva_oro() -> None:
    statement = parse_bbva_oro(PAGES)

    # The period spans two months.
    assert (statement.period_start, statement.period_end) == (date(2026, 9, 13), date(2026, 10, 12))
    assert statement.card_ending == "1234"
    rows = [(r.date, r.description, r.amount, r.kind, r.card_ending) for r in statement.rows]
    # Only the regular movements, across both pages; MSI and points tables are ignored.
    assert rows == [
        (date(2026, 10, 2), "NETFLIX COM 1", Decimal("369.00"), RowKind.EXPENSE, "1234"),
        (date(2026, 9, 21), "BMOVIL.PAGO TDC", Decimal("1000.00"), RowKind.PAYMENT, "1234"),
        (date(2026, 9, 29), "USO DE PUNTOS GASOLINERA", Decimal("66.50"), RowKind.INCOME, "1234"),
        (date(2026, 10, 10), "SMARTFIT", Decimal("1599.00"), RowKind.EXPENSE, "5678"),
        (date(2026, 10, 12), "09 DE 12 AMAZON A MESES", Decimal("567.00"), RowKind.EXPENSE, "1234"),
    ]


@pytest.mark.parametrize(
    ("pages", "message"),
    [
        (
            [HEADER.replace("Fecha de corte: 12-oct", "Fecha de corte: 11-oct"), MOVEMENTS_1],
            "La fecha de corte no coincide con el periodo",
        ),
        ([HEADER.replace("Página 1 de 8", "Página 2 de 8"), MOVEMENTS_1], "página 1"),
        ([HEADER, MOVEMENTS_1], "totales"),
    ],
)
def test_parse_bbva_oro_rejects(pages: list[str], message: str) -> None:
    with pytest.raises(StatementError, match=message):
        parse_bbva_oro(pages)


def test_parse_bbva_oro_warns_when_totals_differ() -> None:
    assert parse_bbva_oro(PAGES).warnings == []
    pages = [HEADER, MOVEMENTS_1, MOVEMENTS_2.replace("$2,535.00", "$2,151.32")]
    statement = parse_bbva_oro(pages)
    # Still loads, so the user can review the rows instead of being blocked.
    assert len(statement.rows) == 5
    assert statement.warnings == [
        "No cuadra: TOTAL CARGOS dice 2,151.32, los movimientos suman 2,535.00 (diferencia 383.68)"
    ]


@pytest.fixture
def fake_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(parsers, "extract_pages", lambda pdf, **_: PAGES)


async def _post(client: AsyncClient, path: str, body: dict[str, Any]) -> dict[str, Any]:
    res = await client.post(path, json=body)
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
async def accounts(auth_client: AsyncClient) -> dict[str, Any]:
    card = await _post(
        auth_client,
        "/api/accounts",
        {
            "name": "BBVA Oro",
            "type": "credit_card",
            "statement_format": "bbva_oro",
            "card_endings": ["1234", "5678"],
        },
    )
    debit = await _post(auth_client, "/api/accounts", {"name": "Nómina", "type": "debit"})
    return {"card": card, "debit": debit}


async def _preview(client: AsyncClient, account_id: int) -> Any:
    return await client.post(
        "/api/statements/preview",
        data={"account_id": str(account_id)},
        files={"file": ("estado.pdf", b"%PDF-fake", "application/pdf")},
    )


def _period(preview: dict[str, Any]) -> dict[str, Any]:
    keys = ("period_start", "period_end", "file_sha256")
    return {k: preview[k] for k in keys}


async def test_preview(auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None) -> None:
    res = await _preview(auth_client, accounts["card"]["id"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["period_start"] == "2026-09-13"
    assert body["card_ending"] == "1234"
    assert len(body["rows"]) == 5
    assert body["rows"][3] == {
        "date": "2026-10-10",
        "description": "SMARTFIT",
        "amount": "1599.00",
        "kind": "expense",
        "card_ending": "5678",
        "notes": "Tarjeta ***5678",
        "skip_reason": None,
    }
    assert body["warnings"] == []


async def test_preview_rejects_other_card(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    await auth_client.patch(
        f"/api/accounts/{accounts['card']['id']}", json={"card_endings": ["1111"]}
    )
    res = await _preview(auth_client, accounts["card"]["id"])
    assert res.status_code == 400
    assert "no corresponde a esta cuenta" in res.json()["error"]["message"]


async def test_preview_requires_statement_format(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    res = await _preview(auth_client, accounts["debit"]["id"])
    assert res.status_code == 400
    assert "carga masiva" in res.json()["error"]["message"]


async def test_preview_rejects_non_pdf(auth_client: AsyncClient, accounts: dict[str, Any]) -> None:
    res = await auth_client.post(
        "/api/statements/preview",
        data={"account_id": str(accounts["card"]["id"])},
        files={"file": ("estado.txt", b"hola", "text/plain")},
    )
    assert res.status_code == 400


async def test_import(auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None) -> None:
    card, debit = accounts["card"]["id"], accounts["debit"]["id"]
    streaming = await _post(
        auth_client, "/api/categories", {"name": "Streaming", "kind": "expense"}
    )
    preview = (await _preview(auth_client, card)).json()
    rows = preview["rows"]
    rows[0]["category_id"] = streaming["id"]

    res = await auth_client.post(
        "/api/statements/import",
        json={
            **_period(preview),
            "account_id": card,
            "payment_source_account_id": debit,
            "rows": rows,
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["created"] == 5

    txs = (await auth_client.get("/api/transactions", params={"account_id": card})).json()
    by_description = {t["description"]: t for t in txs["items"]}
    assert by_description["NETFLIX COM 1"]["category_id"] == streaming["id"]
    assert by_description["SMARTFIT"]["notes"] == "Tarjeta ***5678"
    assert by_description["USO DE PUNTOS GASOLINERA"]["kind"] == "income"
    payment = by_description["BMOVIL.PAGO TDC"]
    assert (payment["kind"], payment["counterpart_account_id"]) == ("transfer_in", debit)

    balances = {a["id"]: a["balance"] for a in (await auth_client.get("/api/accounts")).json()}
    # Charges 2,535.00 - payment 1,000.00 - points 66.50.
    assert balances[card] == "-1468.50"
    assert balances[debit] == "-1000.00"


async def test_import_requires_payment_source(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    card = accounts["card"]["id"]
    preview = (await _preview(auth_client, card)).json()
    rows = preview["rows"]
    res = await auth_client.post(
        "/api/statements/import", json={**_period(preview), "account_id": card, "rows": rows}
    )
    assert res.status_code == 400
    assert (await auth_client.get("/api/transactions")).json()["total"] == 0


async def test_import_checks_category_kind(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    card = accounts["card"]["id"]
    salary = await _post(auth_client, "/api/categories", {"name": "Salario", "kind": "income"})
    preview = (await _preview(auth_client, card)).json()
    rows = preview["rows"]
    rows[0]["category_id"] = salary["id"]
    res = await auth_client.post(
        "/api/statements/import",
        json={
            **_period(preview),
            "account_id": card,
            "payment_source_account_id": accounts["debit"]["id"],
            "rows": rows,
        },
    )
    assert res.status_code == 400
    # Nothing was saved: the import is all or nothing.
    assert (await auth_client.get("/api/transactions")).json()["total"] == 0


# Anonymized BBVA Azul (Libretón) pages, as `extract_pages(..., columns=True)` tags them.
AZUL_PAGE_1 = """Estado de Cuenta
LIBRETON NOMINA
PAGINA 1 / 3
Periodo DEL 13/12/2026 AL 12/01/2027
Fecha de Corte 12/01/2027
No. de Cuenta 1234567890
No. de Cliente 11111111
Saldo Global $ 49.72
Detalle de Movimientos Realizados
FECHA SALDO
OPER LIQ DESCRIPCION REFERENCIA CARGOS ABONOS OPERACION LIQUIDACION
13/DIC 14/DIC PAGO CUENTA DE TERCERO [CARGO]200.00
BNET 1534618966 Transf a Amiga Referencia 0023142249
14/DIC 14/DIC SPEI ENVIADO BANORTE [CARGO]5,000.00 [SALDO]29,604.46 [SALDO]44,790.77
0509260cs octubre Referencia 0052040209 072
La GAT Real es el rendimiento que obtendría después de descontar la inflación estimada
BBVA MEXICO, S.A., INSTITUCION DE BANCA MULTIPLE, GRUPO FINANCIERO BBVA MEXICO
"""
AZUL_PAGE_2 = """Estado de Cuenta
LIBRETON NOMINA
PAGINA 2 / 3
No. de Cuenta 1234567890
No. de Cliente 11111111
00072180010667111526
MBAN01002609170052040209
Cliente Prueba
15/DIC 15/DIC PAGO DE NOMINA [ABONO]50,541.24
EMPRESA SA DE CV Referencia BC 4207343175
19/DIC 21/DIC PAGO TARJETA DE CREDITO [CARGO]28,000.00
CUENTA: BMOV Referencia 8812804073
03/ENE 05/ENE RETIRO CAJERO AUTOMATICO [CARGO]3,500.00 [SALDO]17,049.72 [SALDO]22,989.72
ENE03 16:12 BBVA 9587 FOLIO:6862 Referencia ******0105
05/ENE 05/ENE SPEI RECIBIDOSTP [ABONO]6,000.00
0230926 Referencia 0102367767 646
Total de Movimientos
TOTAL IMPORTE CARGOS [CARGO]36,700.00 TOTAL MOVIMIENTOS CARGOS 4
TOTAL IMPORTE ABONOS [ABONO]56,541.24 TOTAL MOVIMIENTOS ABONOS 2
Estado de cuenta de Apartados Vigentes
BMW $ 49.72
"""
AZUL_PAGES = [AZUL_PAGE_1, AZUL_PAGE_2]


def test_parse_bbva_azul() -> None:
    statement = parse_bbva_azul(AZUL_PAGES)

    assert (statement.period_start, statement.period_end) == (
        date(2026, 12, 13),
        date(2027, 1, 12),
    )
    assert statement.card_ending == "7890"
    rows = [(r.date, r.description, r.amount, r.kind, r.card_ending) for r in statement.rows]
    assert rows == [
        (
            date(2026, 12, 13),
            "PAGO CUENTA DE TERCERO · Transf a Amiga",
            Decimal("200.00"),
            RowKind.EXPENSE,
            None,
        ),
        # Its details continue on the next page, after the page header.
        (
            date(2026, 12, 14),
            "SPEI ENVIADO BANORTE · Cliente Prueba",
            Decimal("5000.00"),
            RowKind.EXPENSE,
            None,
        ),
        (date(2026, 12, 15), "PAGO DE NOMINA", Decimal("50541.24"), RowKind.INCOME, None),
        (
            date(2026, 12, 19),
            "PAGO TARJETA DE CREDITO",
            Decimal("28000.00"),
            RowKind.TRANSFER_OUT,
            None,
        ),
        # The year comes from the period, which spans new year.
        (date(2027, 1, 3), "RETIRO CAJERO AUTOMATICO", Decimal("3500.00"), RowKind.EXPENSE, "0105"),
        (date(2027, 1, 5), "SPEI RECIBIDO STP", Decimal("6000.00"), RowKind.INCOME, None),
    ]
    banorte = statement.rows[1]
    assert banorte.notes == (
        "0509260cs octubre Referencia 0052040209 072 · 00072180010667111526"
        " · MBAN01002609170052040209 · Cliente Prueba"
    )
    assert statement.rows[4].notes is not None
    assert statement.rows[4].notes.startswith("Tarjeta ***0105 · ")
    # Card payments are imported from the card's statement: unselected by default.
    assert [r.skip_reason is not None for r in statement.rows] == [
        False,
        False,
        False,
        True,
        False,
        False,
    ]


@pytest.mark.parametrize(
    ("pages", "message"),
    [
        (
            [AZUL_PAGE_1.replace("Fecha de Corte 12/01/2027", "Fecha de Corte 11/01/2027")],
            "La fecha de corte no coincide",
        ),
        ([AZUL_PAGE_1], "totales"),
    ],
)
def test_parse_bbva_azul_rejects(pages: list[str], message: str) -> None:
    with pytest.raises(StatementError, match=message):
        parse_bbva_azul(pages)


@pytest.mark.parametrize(
    ("pages", "warning"),
    [
        (
            [AZUL_PAGE_1, AZUL_PAGE_2.replace("MOVIMIENTOS ABONOS 2", "MOVIMIENTOS ABONOS 3")],
            "TOTAL IMPORTE ABONOS dice 3 movimientos, se leyeron 2",
        ),
        (
            # A credit read as a charge no longer adds up.
            [AZUL_PAGE_1, AZUL_PAGE_2.replace("[ABONO]6,000.00", "[CARGO]6,000.00")],
            "TOTAL IMPORTE CARGOS dice 36,700.00, los movimientos suman 42,700.00",
        ),
    ],
)
def test_parse_bbva_azul_warns(pages: list[str], warning: str) -> None:
    assert parse_bbva_azul(AZUL_PAGES).warnings == []
    warnings = parse_bbva_azul(pages).warnings
    assert any(warning in w for w in warnings), warnings


async def test_import_azul_with_transfers(
    auth_client: AsyncClient, accounts: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[bool] = []

    def fake_extract(pdf: bytes, *, columns: bool = False) -> list[str]:
        calls.append(columns)
        return AZUL_PAGES

    monkeypatch.setattr(parsers, "extract_pages", fake_extract)
    azul = await _post(
        auth_client,
        "/api/accounts",
        {
            "name": "BBVA Azul",
            "type": "debit",
            "statement_format": "bbva_azul",
            "card_endings": ["7890"],
        },
    )
    card = accounts["card"]["id"]
    res = await _preview(auth_client, azul["id"])
    assert res.status_code == 200, res.text
    assert calls == [True]
    preview = res.json()
    rows = preview["rows"]
    payment = rows[3]
    assert payment["kind"] == "transfer_out" and payment["skip_reason"]

    # The user includes the card payment and marks the STP credit as a transfer from the card.
    payment["counterpart_account_id"] = card
    rows[5] |= {"kind": "transfer_in", "counterpart_account_id": card}
    res = await auth_client.post(
        "/api/statements/import", json={**_period(preview), "account_id": azul["id"], "rows": rows}
    )
    assert res.status_code == 201, res.text

    balances = {a["id"]: a["balance"] for a in (await auth_client.get("/api/accounts")).json()}
    assert balances[azul["id"]] == "19841.24"  # 56,541.24 in - 36,700.00 out
    assert balances[card] == "22000.00"  # +28,000 payment - 6,000 sent back
    spending = await auth_client.get(
        "/api/transactions", params={"account_id": azul["id"], "kind": "expense"}
    )
    assert spending.json()["total"] == 3


async def test_import_transfer_requires_counterpart(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    card = accounts["card"]["id"]
    preview = (await _preview(auth_client, card)).json()
    rows = preview["rows"]
    rows[0]["kind"] = "transfer_out"
    res = await auth_client.post(
        "/api/statements/import",
        json={
            **_period(preview),
            "account_id": card,
            "payment_source_account_id": accounts["debit"]["id"],
            "rows": rows,
        },
    )
    assert res.status_code == 400
    assert "Elige la cuenta de la transferencia" in res.json()["error"]["message"]


async def test_statement_is_loaded_once(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    card, debit = accounts["card"]["id"], accounts["debit"]["id"]
    preview = (await _preview(auth_client, card)).json()
    assert len(preview["file_sha256"]) == 64
    body = {**_period(preview), "account_id": card, "payment_source_account_id": debit}
    res = await auth_client.post("/api/statements/import", json={**body, "rows": preview["rows"]})
    assert res.status_code == 201, res.text
    load_id = res.json()["id"]

    # The same period can't be previewed nor imported again.
    res = await _preview(auth_client, card)
    assert res.status_code == 409
    assert "ya se cargó" in res.json()["error"]["message"]
    res = await auth_client.post("/api/statements/import", json={**body, "rows": preview["rows"]})
    assert res.status_code == 409
    # Neither can the same file under another period.
    other = {**body, "period_start": "2026-01-01", "period_end": "2026-01-31"}
    res = await auth_client.post("/api/statements/import", json={**other, "rows": preview["rows"]})
    assert res.status_code == 409

    loads = (await auth_client.get("/api/statements/imports", params={"account_id": card})).json()
    assert [(x["id"], x["period_start"], x["row_count"]) for x in loads] == [
        (load_id, "2026-09-13", 5)
    ]

    # Deleting the load deletes its movements, both sides of its transfers too.
    res = await auth_client.delete(f"/api/statements/imports/{load_id}")
    assert res.status_code == 204
    assert (await auth_client.get("/api/transactions")).json()["total"] == 0
    balances = {a["id"]: a["balance"] for a in (await auth_client.get("/api/accounts")).json()}
    assert balances[card] == balances[debit] == "0.00"
    assert (await _preview(auth_client, card)).status_code == 200


async def test_delete_load_keeps_other_movements(
    auth_client: AsyncClient, accounts: dict[str, Any], fake_pdf: None
) -> None:
    card, debit = accounts["card"]["id"], accounts["debit"]["id"]
    manual = await _post(
        auth_client,
        "/api/transactions",
        {
            "account_id": card,
            "date": "2026-10-01",
            "kind": "expense",
            "amount": "10.00",
            "description": "A mano",
        },
    )
    preview = (await _preview(auth_client, card)).json()
    res = await auth_client.post(
        "/api/statements/import",
        json={
            **_period(preview),
            "account_id": card,
            "payment_source_account_id": debit,
            "rows": preview["rows"],
        },
    )
    await auth_client.delete(f"/api/statements/imports/{res.json()['id']}")
    items = (await auth_client.get("/api/transactions")).json()["items"]
    assert [t["id"] for t in items] == [manual["id"]]


def test_parse_bbva_oro_fees_are_not_in_total_charges() -> None:
    # The fee row is a charge, but BBVA reports it in page 1's summary, not in the total.
    header = HEADER + "Monto de comisiones + $383.68\nIVA de intereses y comisiones + $0.00\n"
    fee = "19-oct-2026 19-oct-2026 ADM.TAR.TIT. 3 DE 03 + $383.68\nTOTAL CARGOS"
    pages = [header, MOVEMENTS_1, MOVEMENTS_2.replace("TOTAL CARGOS", fee)]
    statement = parse_bbva_oro(pages)
    assert statement.warnings == []
    assert statement.rows[-1].description == "ADM.TAR.TIT. 3 DE 03"
    assert statement.rows[-1].kind == RowKind.EXPENSE


def test_parse_bbva_oro_lowercase_totals() -> None:
    # Some months print "Total cargos" / "Total abonos".
    totals = MOVEMENTS_2.replace("TOTAL CARGOS", "Total cargos").replace(
        "TOTAL ABONOS", "Total abonos"
    )
    statement = parse_bbva_oro([HEADER, MOVEMENTS_1, totals])
    assert len(statement.rows) == 5
    assert statement.warnings == []
