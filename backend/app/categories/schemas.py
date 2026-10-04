from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.categories.models import CategoryKind

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class CategoryCreate(BaseModel):
    name: Name
    kind: CategoryKind
    parent_id: int | None = None
    color: str | None = None


class CategoryUpdate(BaseModel):
    name: Name | None = None
    parent_id: int | None = None
    color: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: CategoryKind
    parent_id: int | None
    color: str | None
