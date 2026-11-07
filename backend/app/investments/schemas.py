import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    computed_field,
)

from app.common.money import Money, NonNegativeMoney, PositiveMoney
from app.investments import interest as calc
from app.investments.models import InvestmentGroup

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
Year = Annotated[int, Field(ge=2000, le=2100)]
Month = Annotated[int, Field(ge=1, le=12)]
# Annual percent, e.g. "11.5"; serialized without trailing zeros.
Rate = Annotated[
    Decimal,
    Field(gt=0, le=100, max_digits=7, decimal_places=4),
    PlainSerializer(lambda d: format(d.normalize(), "f"), return_type=str, when_used="json"),
]
TermStatus = Literal["scheduled", "active", "matured"]

# Twelve values, January first; None is a blank cell.
MonthValues = list[Money | None]


# --- Investments -------------------------------------------------------------


class InvestmentCreate(BaseModel):
    name: Name
    group: InvestmentGroup = InvestmentGroup.MAIN


class InvestmentUpdate(BaseModel):
    name: Name | None = None
    group: InvestmentGroup | None = None


class InvestmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    group: InvestmentGroup


class BalanceSet(BaseModel):
    amount: NonNegativeMoney | None  # None clears the cell


class BalanceOut(BaseModel):
    investment_id: int
    year: int
    month: int
    amount: Money | None


# --- Terms (plazos) ----------------------------------------------------------


class TermCreate(BaseModel):
    start_date: dt.date
    days: int = Field(gt=0, le=3650)
    amount: PositiveMoney
    annual_rate: Rate
    isr_withheld: NonNegativeMoney = Decimal("0")
    notes: Notes | None = None


class TermUpdate(BaseModel):
    start_date: dt.date | None = None
    days: int | None = Field(None, gt=0, le=3650)
    amount: PositiveMoney | None = None
    annual_rate: Rate | None = None
    isr_withheld: NonNegativeMoney | None = None
    notes: Notes | None = None


class TermOut(BaseModel):
    """A term with its derived figures. Interest = amount × rate × days / 360."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    investment_id: int
    start_date: dt.date
    days: int
    amount: Money
    annual_rate: Rate
    isr_withheld: Money
    notes: str | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def end_date(self) -> dt.date:
        return calc.end_date(self.start_date, self.days)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def interest(self) -> Money:
        return calc.simple_interest(self.amount, self.annual_rate, self.days)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def net_interest(self) -> Money:
        return self.interest - self.isr_withheld

    @computed_field  # type: ignore[prop-decorator]
    @property
    def final_amount(self) -> Money:
        """What the next term would start with when renewed."""
        return self.amount + self.net_interest

    @computed_field  # type: ignore[prop-decorator]
    @property
    def status(self) -> TermStatus:
        today = dt.date.today()
        if today < self.start_date:
            return "scheduled"
        return "active" if today < self.end_date else "matured"


class TermTotals(BaseModel):
    """Totals over one investment's terms. Terms can run in parallel (several deposits at
    once), so the invested amount is the sum of every term that hasn't matured."""

    count: int
    active: int
    running: int  # active + scheduled
    invested: Money  # principal in running terms (Monto invertido)
    invested_at_maturity: Money  # what those terms pay back, principal + net interest
    net_interest: Money  # earned on matured terms
    expected_interest: Money  # still to be earned on running and scheduled terms


class TermList(BaseModel):
    items: list[TermOut]
    totals: TermTotals


# --- Grid --------------------------------------------------------------------


class InvestmentRow(InvestmentOut):
    months: MonthValues
    term_count: int
    active_terms: int


class GridTotals(BaseModel):
    main: MonthValues  # Total
    occasional: MonthValues  # Inversiones ocasionales
    overall: MonthValues  # Resumen = Total + ocasionales


class GridSummary(BaseModel):
    """Header cards. `as_of_month` is the latest month with data that isn't in the future."""

    as_of_month: int | None
    current_total: Money | None
    monthly_change: Money | None  # vs. the previous month with data
    previous_total: Money | None
    year_change: Money | None  # vs. the first month with data this year
    first_total: Money | None
    interest_earned: Money  # net interest of terms that matured this year
    active_principal: Money  # in running terms
    expected_interest: Money  # net interest those running terms will pay
    active_terms: int


class InvestmentGrid(BaseModel):
    year: int
    years: list[int]  # years that have balances, plus the requested one
    items: list[InvestmentRow]
    totals: GridTotals
    summary: GridSummary


class GridFilters(BaseModel):
    year: Year | None = None  # defaults to the current year


# --- Dashboard ---------------------------------------------------------------


class MonthPoint(BaseModel):
    year: int
    month: int
    main: Money
    occasional: Money
    total: Money


class ForecastPoint(BaseModel):
    year: int
    month: int
    total: Money


class Trend(BaseModel):
    months_used: int  # how many recent months the line was fitted to
    monthly_growth: Money  # slope of the line, per month
    projected_year_end: Money | None  # value of the line in December of this year


class Maturity(BaseModel):
    term_id: int
    investment_id: int
    investment_name: str
    end_date: dt.date
    days_left: int
    amount: Money
    annual_rate: Rate
    net_interest: Money
    final_amount: Money


class TermsProjection(BaseModel):
    """Running terms renewed at the same rate and length until the horizon."""

    horizon: dt.date
    principal: Money
    projected_value: Money


class InvestmentGrowth(BaseModel):
    id: int
    name: str
    group: InvestmentGroup
    first: Money | None  # first month with data this year
    latest: Money | None  # latest month with data, not in the future
    change: Money | None


class Dashboard(BaseModel):
    history: list[MonthPoint]
    forecast: list[ForecastPoint]
    trend: Trend | None  # None with fewer than two months of history
    maturities: list[Maturity]
    terms_projection: TermsProjection
    growth: list[InvestmentGrowth]
