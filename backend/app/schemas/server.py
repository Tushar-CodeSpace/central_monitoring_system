"""Server schemas. A server belongs to a site."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

ServerStatus = Literal["unknown", "online", "warning", "offline"]


class ServerBase(BaseModel):
    site_id: str
    name: str = Field(min_length=1, max_length=200)
    hostname: str = Field(min_length=1, max_length=200)
    ip_address: Optional[str] = Field(default=None, max_length=64)


class ServerCreate(ServerBase):
    pass


class ServerUpdate(BaseModel):
    site_id: Optional[str] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    hostname: Optional[str] = Field(default=None, min_length=1, max_length=200)
    ip_address: Optional[str] = Field(default=None, max_length=64)


class ServerRead(ServerBase):
    id: str
    status: ServerStatus = "unknown"
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime