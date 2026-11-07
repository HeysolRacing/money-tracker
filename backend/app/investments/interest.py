"""Interest and forecasting math. Pure functions over Decimal, so they are easy to test.

Rates are annual percentages on a 360-day year, the convention of Mexican banks and
Sofipos: 100,000 at 10% for 90 days earns 100,000 × 0.10 × 90 / 360 = 2,500.00.
"""

import datetime as dt
from decimal import ROUND_HALF_UP, Decimal

from app.common.money import CENTS

DAY_BASIS = 360
ZERO = Decimal("0")


def _cents(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


def simple_interest(amount: Decimal, annual_rate: Decimal, days: int) -> Decimal:
    """Gross interest of `amount` at `annual_rate` percent over `days`."""
    return _cents(amount * annual_rate / 100 * days / DAY_BASIS)


def end_date(start: dt.date, days: int) -> dt.date:
    return start + dt.timedelta(days=days)


def projected_value(
    amount: Decimal,
    annual_rate: Decimal,
    days: int,
    start: dt.date,
    isr_withheld: Decimal,
    horizon: dt.date,
) -> Decimal:
    """Value of a term on `horizon`, assuming each time it matures it is renewed for the
    same days at the same rate with principal + interest. ISR is only known for the
    current term; later renewals are projected gross. A term still running on `horizon`
    contributes the interest accrued so far."""
    value = amount
    period_start = start
    first = True
    while True:
        period_end = end_date(period_start, days)
        if period_end > horizon:
            elapsed = max((horizon - period_start).days, 0)
            return value + simple_interest(value, annual_rate, elapsed)
        value += simple_interest(value, annual_rate, days) - (isr_withheld if first else ZERO)
        period_start, first = period_end, False


def linear_trend(points: list[tuple[int, Decimal]]) -> tuple[Decimal, Decimal]:
    """Least-squares line through (x, y) points: returns (slope, intercept).
    Needs at least two distinct x values."""
    n = len(points)
    if len({x for x, _ in points}) < 2:
        raise ValueError("A trend needs at least two distinct points")
    mean_x = Decimal(sum(x for x, _ in points)) / n
    mean_y = sum((y for _, y in points), ZERO) / n
    cov = sum(((x - mean_x) * (y - mean_y) for x, y in points), ZERO)
    var = sum(((x - mean_x) ** 2 for x, _ in points), ZERO)
    slope = cov / var
    return slope, mean_y - slope * mean_x
