"""Config snapshot schemas (site MongoDB backups pushed by agents)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConfigIngest(BaseModel):
    database: str = Field(min_length=1, max_length=100)
    collection: str = Field(min_length=1, max_length=200)
    captured_at: datetime
    count: int = Field(default=0, ge=0)
    content_hash: str = Field(min_length=8, max_length=128)
    documents: list[dict[str, Any]] = Field(default_factory=list)
    truncated: bool = False


class ConfigSnapshotMeta(BaseModel):
    id: str
    server_id: str
    database: str
    collection: str
    captured_at: datetime
    received_at: datetime
    count: int
    content_hash: str
    truncated: bool = False


class ConfigSnapshotFull(ConfigSnapshotMeta):
    documents: list[dict[str, Any]]
