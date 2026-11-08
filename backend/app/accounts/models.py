from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.common.money import MONEY_SQL
from app.db import Base, TimestampMixin


class AccountType(StrEnum):
    DEBIT = "debit"
    CREDIT_CARD = "credit_card"
    CASH = "cash"
    SAVINGS = "savings"
    INVESTMENT = "investment"


class StatementFormat(StrEnum):
    """Layout of the PDF statements an account can bulk-import (see app/statements)."""

    BBVA_ORO = "bbva_oro"
    BBVA_AZUL = "bbva_azul"


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    bank: Mapped[str | None] = mapped_column(String(50))
    type: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3), default="MXN")
    # Balance before the first recorded transaction. Credit cards: negative = debt.
    opening_balance: Mapped[Decimal] = mapped_column(MONEY_SQL, default=Decimal("0"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    # Credit cards only
    credit_limit: Mapped[Decimal | None] = mapped_column(MONEY_SQL)
    statement_day: Mapped[int | None] = mapped_column(SmallInteger)  # fecha de corte
    payment_due_day: Mapped[int | None] = mapped_column(SmallInteger)  # fecha límite de pago

    # Bulk import of PDF statements; None = not enabled for this account.
    statement_format: Mapped[str | None] = mapped_column(String(30))
    # Last 4 digits of the account's cards (physical and digital), checked against the PDF.
    card_endings: Mapped[list[str] | None] = mapped_column(ARRAY(String(4)))
