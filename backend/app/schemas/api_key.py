"""Agent API key schemas."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

ApiKeyStatus = Literal["active", "revoked"]


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ApiKeyRead(BaseModel):
    id: str
    server_id: str
    name: str
    status: ApiKeyStatus = "active"
    created_at: datetime
    last_used_at: Optional[datetime] = None


class ApiKeyCreateResponse(ApiKeyRead):
    raw_key: str