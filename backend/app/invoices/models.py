import datetime as dt
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.common.money import MONEY_SQL
from app.db import Base, TimestampMixin


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (Index("ix_invoices_user_date", "user_id", "application_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    application_date: Mapped[dt.date] = mapped_column(Date)  # Fecha de aplicación
    concept: Mapped[str] = mapped_column(String(255))  # Concepto
    subtotal: Mapped[Decimal] = mapped_column(MONEY_SQL)
    iva: Mapped[Decimal] = mapped_column(MONEY_SQL, default=Decimal("0"))
    # Total is not stored: always subtotal + iva.
    is_invoiced: Mapped[bool] = mapped_column(Boolean, default=False)  # Facturado
    is_extra: Mapped[bool] = mapped_column(Boolean, default=False)  # Extra
