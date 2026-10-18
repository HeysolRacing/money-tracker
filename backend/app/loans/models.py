import datetime as dt
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.common.money import MONEY_SQL
from app.db import Base, TimestampMixin


class Borrower(TimestampMixin, Base):
    """Someone the user lends money to (Deudor), e.g. "Ricardo" or "Aromas"."""

    __tablename__ = "borrowers"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))


class LoanEntry(TimestampMixin, Base):
    """One row of a borrower's ledger: money lent (Préstamo) and/or paid back (Pagado)."""

    __tablename__ = "loan_entries"
    __table_args__ = (Index("ix_loan_entries_user_date", "user_id", "entry_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    borrower_id: Mapped[int] = mapped_column(
        ForeignKey("borrowers.id", ondelete="RESTRICT"), index=True
    )
    entry_date: Mapped[dt.date] = mapped_column(Date)  # Fecha
    description: Mapped[str] = mapped_column(String(255))  # Descripción
    lent: Mapped[Decimal] = mapped_column(MONEY_SQL, default=Decimal("0"))  # Préstamo
    paid: Mapped[Decimal] = mapped_column(MONEY_SQL, default=Decimal("0"))  # Pagado
