"""Agent runtime configuration schemas (centrally managed, pushed to agents)."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

ConfigCollection = list[dict]  # {"database": str, "collections": [str, ...]}


class ConfigCollectionSpec(BaseModel):
    model_config = {"extra": "forbid"}

    database: str = Field(min_length=1, max_length=100)
    collections: list[str] = Field(default_factory=list)


class AgentConfig(BaseModel):
    config_sync_enabled: bool = True
    config_sync_hour: int = Field(default=0, ge=0, le=23)
    monitored_services: list[str] = Field(default_factory=list)
    config_collections: list[ConfigCollectionSpec] = Field(default_factory=list)


class AgentConfigOverrideUpdate(BaseModel):
    model_config = {"extra": "forbid"}

    config_sync_enabled: Optional[bool] = None
    config_sync_hour: Optional[int] = Field(default=None, ge=0, le=23)
    monitored_services: Optional[list[str]] = None
    config_collections: Optional[list[ConfigCollectionSpec]] = None

    @field_validator("config_sync_hour")
    @classmethod
    def _check_hour(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v <= 23):
            raise ValueError("config_sync_hour must be between 0 and 23")
        return v
