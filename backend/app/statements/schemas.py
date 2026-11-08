import datetime as dt
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.common.money import PositiveMoney
from app.statements.parsers import RowKind
from app.transactions.schemas import Description

CardEnding = Annotated[str, Field(pattern=r"^\d{4}$")]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class StatementRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: dt.date
    description: Description
    amount: PositiveMoney
    kind: RowKind
    card_ending: CardEnding | None
    notes: str | None


class StatementPreviewRow(StatementRow):
    # Why the row starts unselected (e.g. a card payment that is imported from the card).
    skip_reason: str | None


class StatementPreview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    period_start: dt.date
    period_end: dt.date
    # Last digits of the card or account number printed in the statement.
    card_ending: str
    # Sent back on import, to record which file was loaded.
    file_sha256: str
    rows: list[StatementPreviewRow]
    # E.g. the rows don't add up to the statement's totals; the import is still allowed.
    warnings: list[str]


class StatementImportRow(StatementRow):
    category_id: int | None = None
    # The other account of a transfer_out/transfer_in row.
    counterpart_account_id: int | None = None


class StatementImportCreate(BaseModel):
    account_id: int
    period_start: dt.date
    period_end: dt.date
    file_sha256: Sha256
    # Account the card payments came from; required when a row is a payment.
    payment_source_account_id: int | None = None
    rows: list[StatementImportRow] = Field(min_length=1, max_length=1000)


class StatementImportResult(BaseModel):
    id: int
    created: int


class StatementImportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    period_start: dt.date
    period_end: dt.date
    row_count: int
    created_at: dt.datetime
