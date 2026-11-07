"""Imports every model module so Base.metadata is complete (used by Alembic and tests)."""

from app.accounts.models import Account
from app.auth.models import User, UserSession
from app.categories.models import Category
from app.db import Base
from app.investments.models import Investment, InvestmentBalance, InvestmentTerm
from app.invoices.models import Invoice
from app.loans.models import Borrower, LoanEntry
from app.transactions.models import Transaction

__all__ = [
    "Account",
    "Base",
    "Borrower",
    "Category",
    "Investment",
    "InvestmentBalance",
    "InvestmentTerm",
    "Invoice",
    "LoanEntry",
    "Transaction",
    "User",
    "UserSession",
]
