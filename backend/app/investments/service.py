import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.crud import get_owned
from app.common.money import CENTS
from app.errors import AppError
from app.investments import interest as calc
from app.investments.models import (
    Investment,
    InvestmentBalance,
    InvestmentGroup,
    InvestmentTerm,
)
from app.investments.schemas import (
    BalanceOut,
    BalanceSet,
    Dashboard,
    ForecastPoint,
    GridFilters,
    GridSummary,
    GridTotals,
    InvestmentCreate,
    InvestmentGrid,
    InvestmentGrowth,
    InvestmentOut,
    InvestmentRow,
    InvestmentUpdate,
    Maturity,
    MonthPoint,
    MonthValues,
    TermCreate,
    TermList,
    TermOut,
    TermsProjection,
    TermTotals,
    TermUpdate,
    Trend,
)

ZERO = Decimal("0")
FORECAST_MONTHS = 6
TREND_MONTHS = 12  # fit the trend to at most the last year of data


def _sum_months(rows: Iterable[MonthValues]) -> MonthValues:
    """Column sums; a month stays blank (None) when every row is blank in it."""
    totals: MonthValues = [None] * 12
    for months in rows:
        for i, value in enumerate(months):
            if value is not None:
                totals[i] = (totals[i] or ZERO) + value
    return totals


def _last_visible_month(year: int, today: dt.date) -> int:
    """Later months haven't happened yet (0 means the whole year is in the future)."""
    if year < today.year:
        return 12
    return today.month if year == today.year else 0


def _terms_out(terms: Iterable[InvestmentTerm]) -> list[TermOut]:
    return [TermOut.model_validate(t) for t in terms]


def _running(terms: list[TermOut]) -> list[TermOut]:
    """Terms that haven't matured: active ones and those scheduled to start later."""
    return [t for t in terms if t.status != "matured"]


def _term_totals(terms: list[TermOut]) -> TermTotals:
    running = _running(terms)
    return TermTotals(
        count=len(terms),
        active=sum(1 for t in terms if t.status == "active"),
        running=len(running),
        invested=sum((t.amount for t in running), ZERO),
        invested_at_maturity=sum((t.final_amount for t in running), ZERO),
        net_interest=sum((t.net_interest for t in terms if t.status == "matured"), ZERO),
        expected_interest=sum((t.net_interest for t in running), ZERO),
    )


async def _commit_unique(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError.conflict("Ya existe una inversión con ese nombre en ese grupo") from exc


# --- Investments -------------------------------------------------------------


async def create_investment(
    db: AsyncSession, user_id: int, data: InvestmentCreate
) -> InvestmentOut:
    investment = Investment(user_id=user_id, name=data.name, group=data.group)
    db.add(investment)
    await _commit_unique(db)
    return InvestmentOut.model_validate(investment)


async def update_investment(
    db: AsyncSession, user_id: int, investment_id: int, data: InvestmentUpdate
) -> InvestmentOut:
    investment = await get_owned(db, Investment, investment_id, user_id, "Inversión")
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(investment, field, value)
    await _commit_unique(db)
    return InvestmentOut.model_validate(investment)


async def delete_investment(db: AsyncSession, user_id: int, investment_id: int) -> None:
    """Also deletes its monthly balances and terms (ON DELETE CASCADE)."""
    investment = await get_owned(db, Investment, investment_id, user_id, "Inversión")
    await db.delete(investment)
    await db.commit()


async def set_balance(
    db: AsyncSession, user_id: int, investment_id: int, year: int, month: int, data: BalanceSet
) -> BalanceOut:
    await get_owned(db, Investment, investment_id, user_id, "Inversión")
    balance = await db.scalar(
        select(InvestmentBalance).where(
            InvestmentBalance.investment_id == investment_id,
            InvestmentBalance.year == year,
            InvestmentBalance.month == month,
        )
    )
    if data.amount is None:
        if balance is not None:
            await db.delete(balance)
    elif balance is None:
        db.add(
            InvestmentBalance(
                user_id=user_id,
                investment_id=investment_id,
                year=year,
                month=month,
                amount=data.amount,
            )
        )
    else:
        balance.amount = data.amount
    await db.commit()
    return BalanceOut(investment_id=investment_id, year=year, month=month, amount=data.amount)


# --- Grid --------------------------------------------------------------------


async def _investments(db: AsyncSession, user_id: int) -> list[Investment]:
    return list(
        await db.scalars(
            select(Investment).where(Investment.user_id == user_id).order_by(Investment.id)
        )
    )


async def _months_by_investment(
    db: AsyncSession, user_id: int, year: int
) -> dict[int, MonthValues]:
    balances = await db.scalars(
        select(InvestmentBalance).where(
            InvestmentBalance.user_id == user_id, InvestmentBalance.year == year
        )
    )
    months: dict[int, MonthValues] = defaultdict(lambda: [None] * 12)
    for b in balances:
        months[b.investment_id][b.month - 1] = b.amount
    return months


async def _user_terms(db: AsyncSession, user_id: int) -> list[TermOut]:
    return _terms_out(
        await db.scalars(
            select(InvestmentTerm)
            .where(InvestmentTerm.user_id == user_id)
            .order_by(InvestmentTerm.start_date, InvestmentTerm.id)
        )
    )


def _summary(overall: MonthValues, terms: list[TermOut], year: int, today: dt.date) -> GridSummary:
    visible = [
        (i + 1, v)
        for i, v in enumerate(overall[: _last_visible_month(year, today)])
        if v is not None
    ]
    as_of, current = visible[-1] if visible else (None, None)
    previous = visible[-2][1] if len(visible) >= 2 else None
    first = visible[0][1] if len(visible) >= 2 else None
    running = _running(terms)
    return GridSummary(
        as_of_month=as_of,
        current_total=current,
        previous_total=previous,
        monthly_change=current - previous if current is not None and previous is not None else None,
        first_total=first,
        year_change=current - first if current is not None and first is not None else None,
        interest_earned=sum(
            (t.net_interest for t in terms if t.status == "matured" and t.end_date.year == year),
            ZERO,
        ),
        active_principal=sum((t.amount for t in running), ZERO),
        expected_interest=sum((t.net_interest for t in running), ZERO),
        active_terms=len(running),
    )


async def get_grid(db: AsyncSession, user_id: int, f: GridFilters) -> InvestmentGrid:
    today = dt.date.today()
    year = f.year or today.year
    investments = await _investments(db, user_id)
    months = await _months_by_investment(db, user_id, year)
    terms = await _user_terms(db, user_id)
    terms_by_investment: dict[int, list[TermOut]] = defaultdict(list)
    for t in terms:
        terms_by_investment[t.investment_id].append(t)

    rows = [
        InvestmentRow(
            id=inv.id,
            name=inv.name,
            group=InvestmentGroup(inv.group),
            months=months[inv.id],
            term_count=len(terms_by_investment[inv.id]),
            active_terms=len(_running(terms_by_investment[inv.id])),
        )
        for inv in investments
    ]
    main = _sum_months(r.months for r in rows if r.group == InvestmentGroup.MAIN)
    occasional = _sum_months(r.months for r in rows if r.group == InvestmentGroup.OCCASIONAL)
    overall = _sum_months([main, occasional])

    years = set(
        await db.scalars(
            select(InvestmentBalance.year).where(InvestmentBalance.user_id == user_id).distinct()
        )
    )
    return InvestmentGrid(
        year=year,
        years=sorted(years | {year, today.year}, reverse=True),
        items=rows,
        totals=GridTotals(main=main, occasional=occasional, overall=overall),
        summary=_summary(overall, terms, year, today),
    )


# --- Terms -------------------------------------------------------------------


def _check_isr(term: InvestmentTerm) -> None:
    gross = calc.simple_interest(term.amount, term.annual_rate, term.days)
    if term.isr_withheld > gross:
        raise AppError.bad_request("El ISR retenido no puede ser mayor que el interés")


async def list_terms(db: AsyncSession, user_id: int, investment_id: int) -> TermList:
    await get_owned(db, Investment, investment_id, user_id, "Inversión")
    terms = _terms_out(
        await db.scalars(
            select(InvestmentTerm)
            .where(InvestmentTerm.investment_id == investment_id)
            .order_by(InvestmentTerm.start_date, InvestmentTerm.id)
        )
    )
    return TermList(items=terms, totals=_term_totals(terms))


async def create_term(
    db: AsyncSession, user_id: int, investment_id: int, data: TermCreate
) -> TermOut:
    await get_owned(db, Investment, investment_id, user_id, "Inversión")
    term = InvestmentTerm(user_id=user_id, investment_id=investment_id, **data.model_dump())
    _check_isr(term)
    db.add(term)
    await db.commit()
    return TermOut.model_validate(term)


async def update_term(db: AsyncSession, user_id: int, term_id: int, data: TermUpdate) -> TermOut:
    term = await get_owned(db, InvestmentTerm, term_id, user_id, "Plazo")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None and field != "notes":
            continue  # only notes can be cleared
        setattr(term, field, value)
    try:
        _check_isr(term)
    except AppError:
        await db.rollback()
        raise
    await db.commit()
    return TermOut.model_validate(term)


async def delete_term(db: AsyncSession, user_id: int, term_id: int) -> None:
    term = await get_owned(db, InvestmentTerm, term_id, user_id, "Plazo")
    await db.delete(term)
    await db.commit()


# --- Dashboard ---------------------------------------------------------------


def _month_index(year: int, month: int) -> int:
    return year * 12 + month - 1


def _from_index(index: int) -> tuple[int, int]:
    return index // 12, index % 12 + 1


def _trend(history: list[MonthPoint], today: dt.date) -> tuple[Trend | None, list[ForecastPoint]]:
    """Straight line through the last months' totals, extended FORECAST_MONTHS ahead.
    x is the calendar month, so a month without data doesn't squash the line."""
    recent = history[-TREND_MONTHS:]
    if len(recent) < 2:
        return None, []
    slope, intercept = calc.linear_trend([(_month_index(p.year, p.month), p.total) for p in recent])

    def at(index: int) -> Decimal:
        return max((intercept + slope * index).quantize(CENTS), ZERO)

    last = _month_index(recent[-1].year, recent[-1].month)
    forecast = [
        ForecastPoint(year=y, month=m, total=at(i))
        for i in range(last + 1, last + FORECAST_MONTHS + 1)
        for y, m in [_from_index(i)]
    ]
    december = _month_index(today.year, 12)
    trend = Trend(
        months_used=len(recent),
        monthly_growth=slope.quantize(CENTS),
        projected_year_end=at(december) if december >= last else None,
    )
    return trend, forecast


async def get_dashboard(db: AsyncSession, user_id: int) -> Dashboard:
    today = dt.date.today()
    investments = await _investments(db, user_id)
    group_of = {inv.id: InvestmentGroup(inv.group) for inv in investments}

    # Totals per month that has data, up to the current month (later ones are pre-filled).
    by_month: dict[tuple[int, int], dict[InvestmentGroup, Decimal]] = defaultdict(
        lambda: dict.fromkeys(InvestmentGroup, ZERO)
    )
    this_year: dict[int, dict[int, Decimal]] = defaultdict(dict)  # investment -> month -> amount
    balances = await db.scalars(
        select(InvestmentBalance).where(InvestmentBalance.user_id == user_id)
    )
    for b in balances:
        if (b.year, b.month) > (today.year, today.month):
            continue
        by_month[(b.year, b.month)][group_of[b.investment_id]] += b.amount
        if b.year == today.year:
            this_year[b.investment_id][b.month] = b.amount

    history = [
        MonthPoint(
            year=y,
            month=m,
            main=g[InvestmentGroup.MAIN],
            occasional=g[InvestmentGroup.OCCASIONAL],
            total=g[InvestmentGroup.MAIN] + g[InvestmentGroup.OCCASIONAL],
        )
        for (y, m), g in sorted(by_month.items())
    ]
    trend, forecast = _trend(history, today)

    terms = await _user_terms(db, user_id)
    names = {inv.id: inv.name for inv in investments}
    running = _running(terms)
    maturities = [
        Maturity(
            term_id=t.id,
            investment_id=t.investment_id,
            investment_name=names[t.investment_id],
            end_date=t.end_date,
            days_left=(t.end_date - today).days,
            amount=t.amount,
            annual_rate=t.annual_rate,
            net_interest=t.net_interest,
            final_amount=t.final_amount,
        )
        for t in sorted(running, key=lambda t: (t.end_date, t.id))
    ]
    horizon = today + dt.timedelta(days=365)
    projection = TermsProjection(
        horizon=horizon,
        principal=sum((t.amount for t in running), ZERO),
        projected_value=sum(
            (
                calc.projected_value(
                    t.amount, t.annual_rate, t.days, t.start_date, t.isr_withheld, horizon
                )
                for t in running
            ),
            ZERO,
        ),
    )

    growth = []
    for inv in investments:
        values = [amount for _, amount in sorted(this_year[inv.id].items())]
        first, latest = (values[0], values[-1]) if values else (None, None)
        growth.append(
            InvestmentGrowth(
                id=inv.id,
                name=inv.name,
                group=InvestmentGroup(inv.group),
                first=first,
                latest=latest,
                change=latest - first if latest is not None and first is not None else None,
            )
        )

    return Dashboard(
        history=history,
        forecast=forecast,
        trend=trend,
        maturities=maturities,
        terms_projection=projection,
        growth=growth,
    )
