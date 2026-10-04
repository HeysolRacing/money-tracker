from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.common.money import MONEY_SQL
from app.db import Base, TimestampMixin


class TransactionKind(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    # A transfer between own accounts (incl. credit card payments) is two linked rows:
    # transfer_out on the source account and transfer_in on the destination. Not spending.
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"


# Kinds that increase an account's balance; the rest decrease it.
INFLOW_KINDS = (TransactionKind.INCOME, TransactionKind.TRANSFER_IN)
TRANSFER_KINDS = (TransactionKind.TRANSFER_OUT, TransactionKind.TRANSFER_IN)


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_account_date", "account_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(20))
    # Always positive, in the account's currency; `kind` gives the direction.
    amount: Mapped[Decimal] = mapped_column(MONEY_SQL)
    description: Mapped[str] = mapped_column(String(255))
    merchant: Mapped[str | None] = mapped_column(String(120))
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    transfer_peer_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL")
    )
