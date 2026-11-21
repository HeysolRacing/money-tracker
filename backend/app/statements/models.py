import datetime as dt

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class StatementImport(TimestampMixin, Base):
    """A statement PDF loaded into an account. Its movements point back to it
    (`Transaction.statement_import_id`), so deleting it deletes them, and a period can only
    be loaded once per account."""

    __tablename__ = "statement_imports"
    __table_args__ = (
        UniqueConstraint("account_id", "period_start", "period_end", name="uq_statement_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    period_start: Mapped[dt.date] = mapped_column(Date)
    period_end: Mapped[dt.date] = mapped_column(Date)
    # SHA-256 of the PDF, to also recognize the same file; the file itself is never stored.
    file_sha256: Mapped[str] = mapped_column(String(64))
    row_count: Mapped[int] = mapped_column(Integer)
