"""Uniform error responses: {"error": {"code", "message", "details"?}}."""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self, status_code: int, code: str, message: str, details: Any | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details

    @classmethod
    def not_found(cls, resource: str) -> "AppError":
        return cls(status.HTTP_404_NOT_FOUND, "NOT_FOUND", f"{resource} no encontrado")

    @classmethod
    def conflict(cls, message: str) -> "AppError":
        return cls(status.HTTP_409_CONFLICT, "CONFLICT", message)

    @classmethod
    def bad_request(cls, message: str) -> "AppError":
        return cls(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", message)

    @classmethod
    def unauthorized(cls, message: str = "No autenticado") -> "AppError":
        return cls(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)


def _error(status_code: int, code: str, message: str, details: Any | None = None) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = jsonable_encoder(details)
    return JSONResponse(status_code=status_code, content={"error": body})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _error(422, "VALIDATION_ERROR", "Datos inválidos", exc.errors())

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error(exc.status_code, "HTTP_ERROR", str(exc.detail))
