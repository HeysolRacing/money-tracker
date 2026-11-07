import datetime as dt
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.common.money import MONEY_SQL
from app.db import Base, TimestampMixin

# Annual rate in percent, e.g. 11.5 for 11.5%.
RATE_SQL = Numeric(7, 4)


class InvestmentGroup(StrEnum):
    MAIN = "main"  # Regular holdings, the top block of the spreadsheet.
    OCCASIONAL = "occasional"  # "Inversiones ocasionales": Infonavit, X3, …


class Investment(TimestampMixin, Base):
    """A place where money is invested (Openbank, Mifel, Cetes, …), shown as a grid row."""

    __tablename__ = "investments"
    # The same institution can appear in both groups (e.g. Banorte).
    __table_args__ = (UniqueConstraint("user_id", "group", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    group: Mapped[str] = mapped_column(String(20), default=InvestmentGroup.MAIN)


class InvestmentBalance(TimestampMixin, Base):
    """Balance of an investment in one month, entered by hand. No row means a blank cell;
    an explicit 0 ("$ -" in the spreadsheet) is shown as "$0.00"."""

    __tablename__ = "investment_balances"
    __table_args__ = (
        UniqueConstraint("investment_id", "year", "month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="month_valid"),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id", ondelete="CASCADE"), index=True
    )
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(MONEY_SQL)


class InvestmentTerm(TimestampMixin, Base):
    """A fixed-term deposit (plazo): `amount` at `annual_rate` for `days`, from `start_date`.
    End date and interest are derived (see `interest.py`), never stored."""

    __tablename__ = "investment_terms"
    __table_args__ = (
        CheckConstraint("days > 0", name="days_positive"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("annual_rate > 0", name="rate_positive"),
        CheckConstraint("isr_withheld >= 0", name="isr_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id", ondelete="CASCADE"), index=True
    )
    start_date: Mapped[dt.date] = mapped_column(Date)
    days: Mapped[int] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(MONEY_SQL)
    annual_rate: Mapped[Decimal] = mapped_column(RATE_SQL)
    isr_withheld: Mapped[Decimal] = mapped_column(MONEY_SQL, default=Decimal("0"))
    notes: Mapped[str | None] = mapped_column(String(255))
