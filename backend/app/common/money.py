from decimal import Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer
from sqlalchemy import Numeric

# NUMERIC(14,2) in Postgres; Decimal in Python; serialized as a string in JSON.
MONEY_SQL = Numeric(14, 2)

CENTS = Decimal("0.01")

# Always render two decimals ("100.00"), whether the value came from the DB or from input.
_as_string = PlainSerializer(lambda d: str(d.quantize(CENTS)), return_type=str, when_used="json")

Money = Annotated[Decimal, Field(max_digits=14, decimal_places=2), _as_string]
PositiveMoney = Annotated[Decimal, Field(max_digits=14, decimal_places=2, gt=0), _as_string]
NonNegativeMoney = Annotated[Decimal, Field(max_digits=14, decimal_places=2, ge=0), _as_string]
