"""Metric schemas (time-series measurements per server)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MetricCreate(BaseModel):
    server_id: str
    timestamp: datetime

    hostname: Optional[str] = Field(default=None, max_length=200)
    ip_address: Optional[str] = Field(default=None, max_length=64)

    cpu_percent: float = Field(ge=0, le=100)
    memory_percent: float = Field(ge=0, le=100)
    memory_total: float = Field(ge=0)
    memory_available: float = Field(ge=0)

    disk_percent: float = Field(ge=0, le=100)
    disk_total: float = Field(ge=0)
    disk_free: float = Field(ge=0)

    network_bytes_sent: float = Field(ge=0)
    network_bytes_received: float = Field(ge=0)

    uptime_seconds: float = Field(ge=0)


class MetricRead(MetricCreate):
    id: str
    recorded_at: datetime


class MetricIngestResponse(BaseModel):
    success: bool = True