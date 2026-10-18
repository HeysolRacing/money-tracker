from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute

from app import models  # noqa: F401  (register all models)
from app.accounts.router import router as accounts_router
from app.auth.router import router as auth_router
from app.categories.router import router as categories_router
from app.errors import register_error_handlers
from app.invoices.router import router as invoices_router
from app.loans.router import router as loans_router
from app.transactions.router import router as transactions_router
from app.transactions.router import transfers_router


def _operation_id(route: APIRoute) -> str:
    # Clean operation ids (e.g. "auth-login") for the generated frontend client.
    return f"{route.tags[0]}-{route.name}" if route.tags else route.name


app = FastAPI(title="MoneyTracker API", generate_unique_id_function=_operation_id)
register_error_handlers(app)

api = APIRouter(prefix="/api")


@api.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


api.include_router(auth_router)
api.include_router(accounts_router)
api.include_router(categories_router)
api.include_router(transactions_router)
api.include_router(transfers_router)
api.include_router(invoices_router)
api.include_router(loans_router)
app.include_router(api)
