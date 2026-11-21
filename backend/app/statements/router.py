from typing import Annotated

from fastapi import APIRouter, Form, UploadFile, status

from app.deps import CurrentUser, DbSession
from app.errors import AppError
from app.statements import service
from app.statements.schemas import (
    StatementImportCreate,
    StatementImportOut,
    StatementImportResult,
    StatementPreview,
)

router = APIRouter(prefix="/statements", tags=["statements"])


@router.post("/preview", response_model=StatementPreview)
async def preview_statement(
    account_id: Annotated[int, Form()],
    file: UploadFile,
    db: DbSession,
    user: CurrentUser,
) -> StatementPreview:
    """Reads the PDF without saving anything (the file itself is never stored)."""
    if file.content_type != "application/pdf":
        raise AppError.bad_request("El archivo debe ser un PDF")
    pdf = await file.read(service.MAX_PDF_BYTES + 1)
    return await service.preview_statement(db, user.id, account_id, pdf)


@router.post("/import", response_model=StatementImportResult, status_code=status.HTTP_201_CREATED)
async def import_statement(
    body: StatementImportCreate, db: DbSession, user: CurrentUser
) -> StatementImportResult:
    return await service.import_statement(db, user.id, body)


@router.get("/imports", response_model=list[StatementImportOut])
async def list_imports(
    db: DbSession, user: CurrentUser, account_id: int | None = None
) -> list[StatementImportOut]:
    return await service.list_imports(db, user.id, account_id)


@router.delete("/imports/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_import(import_id: int, db: DbSession, user: CurrentUser) -> None:
    await service.delete_import(db, user.id, import_id)
