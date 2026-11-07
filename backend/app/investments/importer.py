"""Import the investments spreadsheet (exported as CSV) into monthly balances.

Expected layout, as in the original spreadsheet:

    2026,ENE,FEB,…,DEC                 <- year, then the 12 months
    BBVA,," $1,058.00 ", $-   ,…       <- one row per investment (main group)
    ," $1,505,910.94 ",…               <- unnamed row: total of the rows above
    Investment Ocassionally,,,…        <- starts the occasional group
    BANORTE," $68,600.00 ",…
    Summarize," $1,634,510.94 ",…      <- total + occasional

A blank cell has no balance; "$ -" is an explicit 0. Total rows are not imported (the app
computes them) but are checked against the rows, so a mis-pasted export is rejected.
Re-importing is safe: cells are upserted and blank cells never delete existing values.
"""

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.investments.models import Investment, InvestmentBalance, InvestmentGroup

# The spreadsheet spells it "Ocassionally".
OCCASIONAL_HEADERS = {
    "investment ocassionally",
    "investment occasionally",
    "inversiones ocasionales",
}
SUMMARY_NAMES = {"summarize", "summary", "resumen"}

Months = list[Decimal | None]


class SheetError(ValueError):
    """The CSV doesn't have the expected layout or its totals don't add up."""


@dataclass
class ParsedRow:
    name: str
    group: InvestmentGroup
    months: Months


@dataclass
class ParsedSheet:
    year: int
    rows: list[ParsedRow]
    # Totals as written in the CSV, used only to check the rows.
    main_total: Months | None = None
    overall_total: Months | None = None


@dataclass
class ImportResult:
    investments_created: list[str] = field(default_factory=list)
    balances_created: int = 0
    balances_updated: int = 0
    balances_unchanged: int = 0


def parse_amount(cell: str) -> Decimal | None:
    """ " $1,058.00 " -> 1058.00; " $-   " -> 0; "" -> None (blank cell)."""
    text = cell.strip().replace("$", "").replace(",", "").strip()
    if not text:
        return None if "$" not in cell else Decimal("0")
    if text == "-":
        return Decimal("0")
    negative = text.startswith("(") and text.endswith(")")
    try:
        value = Decimal(text.strip("()"))
    except InvalidOperation as exc:
        raise SheetError(f"Monto no válido: {cell!r}") from exc
    return -value if negative else value


def _sum(rows: list[Months]) -> Months:
    totals: Months = [None] * 12
    for months in rows:
        for i, v in enumerate(months):
            if v is not None:
                totals[i] = (totals[i] or Decimal("0")) + v
    return totals


def _check(label: str, expected: Months, rows: list[Months], month_names: list[str]) -> None:
    computed = _sum(rows)
    for i, (want, got) in enumerate(zip(expected, computed, strict=True)):
        if (want or Decimal("0")) != (got or Decimal("0")):
            raise SheetError(
                f"{label} de {month_names[i]} no cuadra: el CSV dice {want}, las filas suman {got}"
            )


def parse_sheet(text: str) -> ParsedSheet:
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    lines = [row for row in reader if any(cell.strip() for cell in row)]
    if not lines:
        raise SheetError("El archivo está vacío")
    header = lines[0]
    try:
        year = int(header[0].strip())
    except ValueError as exc:
        raise SheetError("La primera celda debe ser el año, p. ej. 2026") from exc
    month_names = [h.strip() for h in header[1:13]]
    if len(month_names) != 12:
        raise SheetError("El encabezado debe tener los 12 meses")

    sheet = ParsedSheet(year=year, rows=[])
    group = InvestmentGroup.MAIN
    for line in lines[1:]:
        cells = (line + [""] * 13)[:13]
        name = cells[0].strip()
        months = [parse_amount(c) for c in cells[1:13]]
        if not name:
            sheet.main_total = months
        elif name.lower() in OCCASIONAL_HEADERS:
            group = InvestmentGroup.OCCASIONAL
        elif name.lower() in SUMMARY_NAMES:
            sheet.overall_total = months
        else:
            if len(name) > 60:
                raise SheetError(f"Nombre demasiado largo: {name[:60]}…")
            sheet.rows.append(ParsedRow(name=name, group=group, months=months))

    if any(v is not None and v < 0 for r in sheet.rows for v in r.months):
        raise SheetError("Los saldos no pueden ser negativos")
    main = [r.months for r in sheet.rows if r.group == InvestmentGroup.MAIN]
    if sheet.main_total is not None:
        _check("El total", sheet.main_total, main, month_names)
    if sheet.overall_total is not None:
        _check("El resumen", sheet.overall_total, [r.months for r in sheet.rows], month_names)
    return sheet


async def import_sheet(
    db: AsyncSession, user_id: int, sheet: ParsedSheet, *, dry_run: bool = False
) -> ImportResult:
    result = ImportResult()
    existing = {
        (inv.group, inv.name): inv
        for inv in await db.scalars(select(Investment).where(Investment.user_id == user_id))
    }
    balances = {
        (b.investment_id, b.month): b
        for b in await db.scalars(
            select(InvestmentBalance).where(
                InvestmentBalance.user_id == user_id, InvestmentBalance.year == sheet.year
            )
        )
    }
    for row in sheet.rows:
        investment = existing.get((row.group, row.name))
        if investment is None:
            investment = Investment(user_id=user_id, name=row.name, group=row.group)
            db.add(investment)
            await db.flush()  # assigns the id
            existing[(row.group, row.name)] = investment
            result.investments_created.append(f"{row.name} ({row.group})")
        for month, amount in enumerate(row.months, start=1):
            if amount is None:
                continue  # blank cell: leave whatever is there
            balance = balances.get((investment.id, month))
            if balance is None:
                db.add(
                    InvestmentBalance(
                        user_id=user_id,
                        investment_id=investment.id,
                        year=sheet.year,
                        month=month,
                        amount=amount,
                    )
                )
                result.balances_created += 1
            elif balance.amount != amount:
                balance.amount = amount
                result.balances_updated += 1
            else:
                result.balances_unchanged += 1
    if dry_run:
        await db.rollback()
    else:
        await db.commit()
    return result
