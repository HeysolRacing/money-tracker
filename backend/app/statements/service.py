import hashlib
from datetime import date

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, StatementFormat
from app.common.crud import get_owned
from app.config import get_settings
from app.errors import AppError
from app.statements import parsers
from app.statements.models import StatementImport
from app.statements.parsers import PasswordError, RowKind, StatementError
from app.statements.schemas import (
    StatementImportCreate,
    StatementImportOut,
    StatementImportResult,
    StatementPreview,
    StatementPreviewRow,
)
from app.transactions.models import Transaction
from app.transactions.schemas import TransferCreate
from app.transactions.service import _check_category, add_transfer

MAX_PDF_BYTES = 10 * 1024 * 1024
# Setting with the password of each format's PDFs. The bank sets it and it's the same every
# month, so it lives in .env (passed to the api container by compose.yaml), never in the DB.
PDF_PASSWORD_SETTINGS = {StatementFormat.AZTECA: "azteca_pdf_password"}


def _pdf_password(fmt: StatementFormat) -> str | None:
    setting = PDF_PASSWORD_SETTINGS.get(fmt)
    secret = getattr(get_settings(), setting) if setting else None
    if secret is None:
        return None
    return secret.get_secret_value() or None  # compose passes "" when it isn't set


# Rows imported as two linked transactions instead of an expense or income.
TRANSFER_ROW_KINDS = {RowKind.PAYMENT, RowKind.TRANSFER_OUT, RowKind.TRANSFER_IN}


async def _import_account(db: AsyncSession, user_id: int, account_id: int) -> Account:
    account = await get_owned(db, Account, account_id, user_id, "Cuenta")
    if account.statement_format is None:
        raise AppError.bad_request("La cuenta no tiene configurada la carga masiva")
    return account


async def _check_not_loaded(
    db: AsyncSession, account_id: int, period_start: date, period_end: date, file_sha256: str
) -> None:
    """A statement is loaded once: same period of the account, or the very same file."""
    previous = await db.scalar(
        select(StatementImport).where(
            StatementImport.account_id == account_id,
            or_(
                and_(
                    StatementImport.period_start == period_start,
                    StatementImport.period_end == period_end,
                ),
                StatementImport.file_sha256 == file_sha256,
            ),
        )
    )
    if previous is not None:
        raise AppError.conflict(
            f"El periodo {previous.period_start:%d/%m/%Y} al {previous.period_end:%d/%m/%Y} "
            f"ya se cargó el {previous.created_at:%d/%m/%Y} ({previous.row_count} movimientos). "
            "Para volver a cargarlo, elimina primero esa carga."
        )


async def preview_statement(
    db: AsyncSession, user_id: int, account_id: int, pdf: bytes
) -> StatementPreview:
    account = await _import_account(db, user_id, account_id)
    if len(pdf) > MAX_PDF_BYTES:
        raise AppError.bad_request("El PDF no puede pesar más de 10 MB")
    assert account.statement_format is not None  # checked by _import_account
    fmt = StatementFormat(account.statement_format)
    try:
        pages = parsers.extract_pages(
            pdf,
            columns=fmt in parsers.COLUMN_FORMATS,
            channel=fmt in parsers.CHANNEL_FORMATS,
            password=_pdf_password(fmt),
        )
        statement = parsers.PARSERS[fmt](pages)
    except PasswordError as exc:
        setting = PDF_PASSWORD_SETTINGS.get(fmt)
        hint = f"; revisa {setting.upper()} en .env" if setting else ""
        raise AppError.bad_request(f"{exc}{hint}") from exc
    except StatementError as exc:
        raise AppError.bad_request(str(exc)) from exc
    if statement.card_ending not in (account.card_endings or []):
        raise AppError.bad_request(
            f"El estado de cuenta (terminación ***{statement.card_ending}) "
            "no corresponde a esta cuenta"
        )
    file_sha256 = hashlib.sha256(pdf).hexdigest()
    await _check_not_loaded(
        db, account.id, statement.period_start, statement.period_end, file_sha256
    )
    return StatementPreview(
        period_start=statement.period_start,
        period_end=statement.period_end,
        card_ending=statement.card_ending,
        file_sha256=file_sha256,
        rows=[StatementPreviewRow.model_validate(r) for r in statement.rows],
        warnings=statement.warnings,
    )


async def import_statement(
    db: AsyncSession, user_id: int, data: StatementImportCreate
) -> StatementImportResult:
    """Creates the load and every row in one database transaction: all of them or none."""
    account = await _import_account(db, user_id, data.account_id)
    if account.is_archived:
        raise AppError.bad_request("La cuenta está archivada")
    if data.period_start > data.period_end:
        raise AppError.bad_request("El periodo del estado de cuenta no es válido")
    has_payments = any(r.kind == RowKind.PAYMENT for r in data.rows)
    if has_payments and data.payment_source_account_id is None:
        raise AppError.bad_request("Elige la cuenta de origen de los pagos a la tarjeta")
    await _check_not_loaded(db, account.id, data.period_start, data.period_end, data.file_sha256)

    record = StatementImport(
        user_id=user_id,
        account_id=account.id,
        period_start=data.period_start,
        period_end=data.period_end,
        file_sha256=data.file_sha256,
        row_count=len(data.rows),
    )
    db.add(record)
    try:
        await db.flush()  # assigns the id; a concurrent load of the same period fails here
    except IntegrityError as exc:
        raise AppError.conflict("Este periodo ya se cargó") from exc

    for row in data.rows:
        if row.kind in TRANSFER_ROW_KINDS:
            if row.kind == RowKind.PAYMENT:
                assert data.payment_source_account_id is not None
                source, target = data.payment_source_account_id, account.id
            elif row.counterpart_account_id is None:
                raise AppError.bad_request(
                    f"Elige la cuenta de la transferencia «{row.description}»"
                )
            elif row.kind == RowKind.TRANSFER_OUT:
                source, target = account.id, row.counterpart_account_id
            else:
                source, target = row.counterpart_account_id, account.id
            await add_transfer(
                db,
                user_id,
                TransferCreate(
                    from_account_id=source,
                    to_account_id=target,
                    date=row.date,
                    amount=row.amount,
                    description=row.description,
                    notes=row.notes,
                ),
                statement_import_id=record.id,
            )
            continue
        if row.category_id is not None:
            await _check_category(db, user_id, row.category_id, row.kind)
        db.add(
            Transaction(
                user_id=user_id,
                account_id=account.id,
                date=row.date,
                kind=row.kind,
                amount=row.amount,
                description=row.description,
                category_id=row.category_id,
                notes=row.notes,
                statement_import_id=record.id,
            )
        )
    await db.commit()
    return StatementImportResult(id=record.id, created=len(data.rows))


async def list_imports(
    db: AsyncSession, user_id: int, account_id: int | None
) -> list[StatementImportOut]:
    query = select(StatementImport).where(StatementImport.user_id == user_id)
    if account_id is not None:
        query = query.where(StatementImport.account_id == account_id)
    # Oldest period first, the way the user reads the account's history.
    records = await db.scalars(query.order_by(StatementImport.period_start, StatementImport.id))
    return [StatementImportOut.model_validate(r) for r in records]


async def delete_import(db: AsyncSession, user_id: int, import_id: int) -> None:
    """Deletes a load and every movement it created (both rows of its transfers)."""
    record = await get_owned(db, StatementImport, import_id, user_id, "Carga")
    await db.execute(delete(Transaction).where(Transaction.statement_import_id == record.id))
    await db.delete(record)
    await db.commit()
