from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.common.money import MONEY_SQL
from app.db import Base, TimestampMixin


class AccountType(StrEnum):
    DEBIT = "debit"
    CREDIT_CARD = "credit_card"
    CASH = "cash"
    SAVINGS = "savings"
    INVESTMENT = "investment"


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
