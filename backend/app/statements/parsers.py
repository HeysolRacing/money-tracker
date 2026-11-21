"""Read the movements of a bank statement PDF.

Each account picks a layout (`Account.statement_format`); `PARSERS` maps it to a function
that takes the text of every page and returns a `ParsedStatement`. Parsers work on text
only, so they can be tested without a PDF. Layouts that tell charges from credits only by
their column (`COLUMN_FORMATS`) get their amounts tagged by column first; see
`extract_pages`.

Rules shared by every BBVA layout:
- The period and the statement date are read only from the statement's first page
  ("Página 1 de N"); the statement date must be the last day of the period.
- The card or account number on that page must belong to the account (checked by the
  service).
- The movements come only from the statement's detail table. If they don't add up to the
  totals printed in it, the statement still loads but carries a warning, so the user can
  review the rows (or adjust them by hand afterwards) instead of being blocked.
- Payments to a credit card are imported from the card's statement (as transfers from the
  account that paid), so the paying account's side of them is left out by default.
"""

import io
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Any

import pdfplumber

from app.accounts.models import StatementFormat

MONTHS = {
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}

DATE = r"\d{2}-[a-zA-Z]{3}-\d{4}"
AMOUNT = r"\$\s?[\d,]+\.\d{2}"
AMOUNT_WORD = re.compile(r"[\d,]+\.\d{2}")
CARD_PAYMENT = re.compile(r"\bPAGO TDC\b|\bSU PAGO\b", re.IGNORECASE)
DIGITAL_CARD = re.compile(r"\s*;\s*Tarjeta Digital\s*\*+(\d{4})", re.IGNORECASE)


class StatementError(ValueError):
    """The PDF doesn't have the expected layout or doesn't add up."""


class RowKind(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    # A payment to the card; imported as a transfer from another account.
    PAYMENT = "payment"
    # Money moved to/from another own account; the user picks that account.
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"


@dataclass
class ParsedRow:
    date: date
    description: str
    amount: Decimal
    kind: RowKind
    card_ending: str | None
    notes: str | None = None
    # Why the row is left unselected in the preview (it can still be imported).
    skip_reason: str | None = None


@dataclass
class ParsedStatement:
    period_start: date
    period_end: date
    card_ending: str
    rows: list[ParsedRow] = field(default_factory=list)
    # Totals that don't match; shown in the preview, they don't block the import.
    warnings: list[str] = field(default_factory=list)


# Header words of a table whose charges and credits are told apart only by their column.
COLUMN_TAGS = {"CARGOS": "CARGO", "ABONOS": "ABONO", "OPERACION": "SALDO", "LIQUIDACION": "SALDO"}
# Max distance (points) between an amount's right edge and its column header's.
COLUMN_TOLERANCE = 25


def extract_pages(pdf: bytes, *, columns: bool = False) -> list[str]:
    """Text of every page. With `columns`, amounts under a "CARGOS ABONOS OPERACION
    LIQUIDACION" header are tagged by column: "200.00" -> "[CARGO]200.00"."""
    try:
        with pdfplumber.open(io.BytesIO(pdf)) as doc:
            if not columns:
                return [page.extract_text() or "" for page in doc.pages]
            return _tagged_pages(doc.pages)
    except Exception as exc:  # pdfminer raises many unrelated types on a bad file
        raise StatementError("No se pudo leer el PDF") from exc


def _tagged_pages(pages: list[Any]) -> list[str]:
    header: dict[str, float] | None = None  # column -> right edge of its header word
    result = []
    for page in pages:
        lines: list[list[dict[str, Any]]] = []
        for word in sorted(page.extract_words(), key=lambda w: (round(w["top"]), w["x0"])):
            if lines and abs(word["top"] - lines[-1][0]["top"]) <= 3:
                lines[-1].append(word)
            else:
                lines.append([word])
        text = []
        for line in lines:
            line.sort(key=lambda w: w["x0"])
            if header is None and set(COLUMN_TAGS) <= {w["text"] for w in line}:
                header = {w["text"]: w["x1"] for w in line if w["text"] in COLUMN_TAGS}
            text.append(" ".join(_tag(w, header) for w in line))
        result.append("\n".join(text))
    return result


def _tag(word: dict[str, Any], header: dict[str, float] | None) -> str:
    text: str = word["text"]
    if header is None or not AMOUNT_WORD.fullmatch(text):
        return text
    column, x1 = min(header.items(), key=lambda c: abs(c[1] - word["x1"]))
    if abs(x1 - word["x1"]) > COLUMN_TOLERANCE:
        return text
    return f"[{COLUMN_TAGS[column]}]{text}"


def parse_date(text: str) -> date:
    """ "20-jun-2026" -> date(2026, 6, 20)."""
    day, month, year = text.split("-")
    try:
        return date(int(year), MONTHS[month.lower()], int(day))
    except (KeyError, ValueError) as exc:
        raise StatementError(f"Fecha no válida: {text}") from exc


def parse_amount(text: str) -> Decimal:
    return Decimal(text.replace("$", "").replace(",", "").strip())


def _first_page(pages: list[str], pattern: str = r"P[áa]gina\s+1\s+de\s+\d+") -> str:
    for page in pages:
        if re.search(pattern, page, re.IGNORECASE):
            return page
    raise StatementError("No se encontró la página 1 del estado de cuenta")


@dataclass
class _Header:
    period_start: date
    period_end: date
    # Last digits of the card (credit) or account (debit) number.
    card_ending: str


def parse_header(pages: list[str]) -> _Header:
    page = _first_page(pages)
    period = re.search(rf"Periodo:\s*({DATE})\s+al\s+({DATE})", page)
    if period is None:
        raise StatementError("No se encontró el periodo en la página 1")
    start, end = parse_date(period[1]), parse_date(period[2])
    if start > end:
        raise StatementError("El periodo del estado de cuenta no es válido")
    cut = re.search(rf"Fecha de corte:\s*({DATE})", page)
    if cut is None:
        raise StatementError("No se encontró la fecha de corte en la página 1")
    if parse_date(cut[1]) != end:
        raise StatementError("La fecha de corte no coincide con el periodo")
    card = re.search(r"N[úu]mero de tarjeta:\s*\d*(\d{4})\b", page)
    if card is None:
        raise StatementError("No se encontró el número de tarjeta en la página 1")
    return _Header(period_start=start, period_end=end, card_ending=card[1])


def _row_kind(sign: str, description: str) -> RowKind:
    if sign == "+":
        return RowKind.EXPENSE
    return RowKind.PAYMENT if CARD_PAYMENT.search(description) else RowKind.INCOME


def _split_card(description: str, default: str) -> tuple[str, str]:
    match = DIGITAL_CARD.search(description)
    if match is None:
        return description.strip(), default
    return DIGITAL_CARD.sub("", description).strip(), match[1]


def _check_total(
    statement: ParsedStatement,
    label: str,
    expected: Decimal,
    rows: list[ParsedRow],
    count: int | None = None,
) -> None:
    got = sum((r.amount for r in rows), Decimal("0"))
    if got != expected:
        statement.warnings.append(
            f"No cuadra: {label} dice {expected:,}, los movimientos suman {got:,} "
            f"(diferencia {got - expected:,})"
        )
    if count is not None and count != len(rows):
        statement.warnings.append(
            f"No cuadra: {label} dice {count} movimientos, se leyeron {len(rows)}"
        )


# --- BBVA Oro (credit card) --------------------------------------------------------------
# Charges are expenses (including "09 DE 12 …" installments), credits like "BMOVIL.PAGO TDC"
# or "SU PAGO EN PRACTICAJA" are card payments, and any other credit ("USO DE PUNTOS",
# refunds, even from "MERCADO PAGO") is income. A movement may name the digital card
# ("; Tarjeta Digital ***9526"): that text leaves the description and becomes the row's
# `card_ending`; other rows use the main card's ending.
# Fees and interest ("ADM.TAR.TIT. 3 DE 03 + $383.68") are listed with the charges but left
# out of "TOTAL CARGOS": page 1 reports them in its own summary lines (`ORO_FEES`).

ORO_SECTION = "CARGOS,COMPRAS Y ABONOS REGULARES"
ORO_ROW = re.compile(rf"^({DATE})\s+{DATE}\s+(.+?)\s+([+-])\s*({AMOUNT})$")
# "Monto de intereses8 + $0.00", "Monto de comisiones + $383.68", "IVA de intereses y …"
ORO_FEES = re.compile(
    rf"(?:Monto de intereses\d*|Monto de comisiones|IVA de intereses y comisiones)"
    rf"\s*\+\s*({AMOUNT})"
)


def _oro_fees(pages: list[str]) -> Decimal:
    """Interest, fees and their IVA charged this period, from page 1's summary."""
    page = _first_page(pages)
    return sum((parse_amount(m[1]) for m in ORO_FEES.finditer(page)), Decimal("0"))


def parse_bbva_oro(pages: list[str]) -> ParsedStatement:
    header = parse_header(pages)
    statement = ParsedStatement(
        period_start=header.period_start,
        period_end=header.period_end,
        card_ending=header.card_ending,
    )
    in_section = False
    total_charges = total_credits = None
    for page in pages:
        for raw in page.splitlines():
            line = raw.strip()
            if line.upper().startswith(ORO_SECTION):
                in_section = True  # the table repeats its title on every page
                continue
            if not in_section:
                continue
            # "TOTAL CARGOS" or "Total cargos", depending on the month
            if m := re.match(rf"TOTAL CARGOS\s+({AMOUNT})", line, re.IGNORECASE):
                total_charges = parse_amount(m[1])
                continue
            if m := re.match(rf"TOTAL ABONOS\s+-?\s*({AMOUNT})", line, re.IGNORECASE):
                total_credits = parse_amount(m[1])
                in_section = False
                continue
            if m := ORO_ROW.match(line):
                description, card = _split_card(m[2], header.card_ending)
                statement.rows.append(
                    ParsedRow(
                        date=parse_date(m[1]),
                        description=description,
                        amount=parse_amount(m[4]),
                        kind=_row_kind(m[3], description),
                        card_ending=card,
                        notes=f"Tarjeta ***{card}",
                    )
                )
    if total_charges is None or total_credits is None:
        raise StatementError(f"No se encontró la sección «{ORO_SECTION}» con sus totales")
    fees = _oro_fees(pages)
    _check_total(
        statement,
        "TOTAL CARGOS + comisiones e intereses" if fees else "TOTAL CARGOS",
        total_charges + fees,
        [r for r in statement.rows if r.kind == RowKind.EXPENSE],
    )
    _check_total(
        statement,
        "TOTAL ABONOS",
        total_credits,
        [r for r in statement.rows if r.kind != RowKind.EXPENSE],
    )
    return statement


# --- BBVA Azul (Libretón, debit) ---------------------------------------------------------
# One line per movement ("13/SEP 14/SEP PAGO CUENTA DE TERCERO 200.00"), followed by detail
# lines. Dates have no year and the amount's column (CARGOS or ABONOS) is its only sign, so
# pages are extracted with `columns=True`. Charges are expenses, credits are income, and
# payments to a credit card are transfers that start unselected.

AZUL_SECTION = "Detalle de Movimientos Realizados"
AZUL_END = "Total de Movimientos"
SHORT_MONTHS = {k.upper(): v for k, v in MONTHS.items()}
# "13/SEP 14/SEP PAGO CUENTA DE TERCERO [CARGO]200.00 [SALDO]…": operation date first.
AZUL_ROW = re.compile(
    r"^(\d{2})/([A-Z]{3})\s+\d{2}/[A-Z]{3}\s+(.+?)\s+\[(CARGO|ABONO)\]([\d,]+\.\d{2})"
)
AZUL_CARD_PAYMENT = re.compile(r"^PAGO (TARJETA DE CREDITO|INTERBANCARIO TDC)\b")
AZUL_CARD_PAYMENT_REASON = "Pago a tarjeta: se registra al cargar el estado de cuenta de la tarjeta"
# Page header and footer lines that can interrupt a movement's detail lines.
AZUL_NOISE = re.compile(
    r"^(Estado de Cuenta|PAGINA \d+|No\. de Cuenta|No\. de Cliente|BBVA MEXICO, S\.A\."
    r"|Av\. Paseo de la Reforma|La GAT Real|FECHA|OPER LIQ)"
)
TAG = re.compile(r"\[[A-Z]+\]")


def _slash_date(text: str) -> date:
    """ "13/09/2026" -> date(2026, 9, 13)."""
    try:
        day, month, year = (int(p) for p in text.split("/"))
        return date(year, month, day)
    except ValueError as exc:
        raise StatementError(f"Fecha no válida: {text}") from exc


def _parse_azul_header(pages: list[str]) -> _Header:
    page = TAG.sub("", _first_page(pages, r"PAGINA\s+1\s*/\s*\d+"))
    period = re.search(r"Periodo\s+DEL\s+(\S+)\s+AL\s+(\S+)", page, re.IGNORECASE)
    if period is None:
        raise StatementError("No se encontró el periodo en la página 1")
    start, end = _slash_date(period[1]), _slash_date(period[2])
    if start > end:
        raise StatementError("El periodo del estado de cuenta no es válido")
    cut = re.search(r"Fecha de Corte\s+(\S+)", page, re.IGNORECASE)
    if cut is None:
        raise StatementError("No se encontró la fecha de corte en la página 1")
    if _slash_date(cut[1]) != end:
        raise StatementError("La fecha de corte no coincide con el periodo")
    account = re.search(r"No\. de Cuenta\s+\d*(\d{4})\b", page)
    if account is None:
        raise StatementError("No se encontró el número de cuenta en la página 1")
    return _Header(period_start=start, period_end=end, card_ending=account[1])


def _azul_date(day: str, month: str, header: _Header) -> date:
    """Rows have no year: it is the period's, taking care of periods that span new year."""
    if month not in SHORT_MONTHS:
        raise StatementError(f"Fecha no válida: {day}/{month}")
    number = SHORT_MONTHS[month]
    end = header.period_end
    year = end.year if number <= end.month else header.period_start.year
    try:
        return date(year, number, int(day))
    except ValueError as exc:
        raise StatementError(f"Fecha no válida: {day}/{month}") from exc


def _azul_row(title: str, details: list[str]) -> tuple[str, str | None, str | None]:
    """Description, notes and card ending of a movement from its title and detail lines.

    The title is generic ("PAGO CUENTA DE TERCERO"), so the concept is added from the
    details: the text after "BNET <account>" for third-party payments, or the beneficiary
    (the last line with letters) for SPEI transfers. All the details go to the notes.
    """
    concept = None
    if details and (m := re.match(r"BNET \d+ (.+?)(?:\s+Referencia\b.*)?$", details[0])):
        concept = m[1]
    elif title.startswith("SPEI"):
        names = [
            d
            for d in details[1:]
            if re.search(r"[A-Za-z]", d) and "Referencia" not in d and not d.startswith("MBAN")
        ]
        concept = names[-1] if names else None
    card = None
    for d in details:
        if m := re.search(r"Referencia \*+(\d{4})\b", d):
            card = m[1]
    description = f"{title} · {concept}" if concept else title
    notes = ([f"Tarjeta ***{card}"] if card else []) + details
    return description[:255], " · ".join(notes) or None, card


def parse_bbva_azul(pages: list[str]) -> ParsedStatement:
    header = _parse_azul_header(pages)
    statement = ParsedStatement(
        period_start=header.period_start,
        period_end=header.period_end,
        card_ending=header.card_ending,
    )
    rows: list[tuple[re.Match[str], list[str]]] = []
    totals: dict[str, tuple[Decimal, int]] = {}
    in_section = False
    for page in pages:
        # Pages after the first one repeat a header block, which ends at "No. de Cliente".
        in_page_header = in_section
        for raw in page.splitlines():
            line = raw.strip()
            if len(totals) == 2 or not line:
                continue
            if not in_section:
                in_section = line.startswith(AZUL_SECTION)
                continue
            if in_page_header:
                in_page_header = not line.startswith("No. de Cliente")
                continue
            plain = TAG.sub("", line)
            if m := re.match(r"TOTAL IMPORTE (CARGOS|ABONOS)\s+([\d,]+\.\d{2})\D+(\d+)", plain):
                totals[m[1]] = (parse_amount(m[2]), int(m[3]))
            elif plain.startswith(AZUL_END) or AZUL_NOISE.match(plain):
                continue
            elif m := AZUL_ROW.match(line):
                rows.append((m, []))
            elif rows:
                rows[-1][1].append(plain)
    if set(totals) != {"CARGOS", "ABONOS"}:
        raise StatementError(f"No se encontró la sección «{AZUL_SECTION}» con sus totales")

    for m, details in rows:
        # "SPEI RECIBIDOSTP" -> "SPEI RECIBIDO STP"
        title = re.sub(r"^SPEI RECIBIDO(?=\S)", "SPEI RECIBIDO ", TAG.sub("", m[3]).strip())
        description, notes, card = _azul_row(title, details)
        payment = m[4] == "CARGO" and AZUL_CARD_PAYMENT.match(title) is not None
        if payment:
            kind = RowKind.TRANSFER_OUT
        else:
            kind = RowKind.EXPENSE if m[4] == "CARGO" else RowKind.INCOME
        statement.rows.append(
            ParsedRow(
                date=_azul_date(m[1], m[2], header),
                description=description,
                amount=parse_amount(m[5]),
                kind=kind,
                card_ending=card,
                notes=notes,
                skip_reason=AZUL_CARD_PAYMENT_REASON if payment else None,
            )
        )
    credits = [r for r in statement.rows if r.kind == RowKind.INCOME]
    charges = [r for r in statement.rows if r.kind != RowKind.INCOME]
    for label, of_kind in (("CARGOS", charges), ("ABONOS", credits)):
        amount, count = totals[label]
        _check_total(statement, f"TOTAL IMPORTE {label}", amount, of_kind, count)
    return statement


PARSERS: dict[StatementFormat, Callable[[list[str]], ParsedStatement]] = {
    StatementFormat.BBVA_ORO: parse_bbva_oro,
    StatementFormat.BBVA_AZUL: parse_bbva_azul,
}
# Formats whose pages are extracted with `extract_pages(..., columns=True)`.
COLUMN_FORMATS = {StatementFormat.BBVA_AZUL}
