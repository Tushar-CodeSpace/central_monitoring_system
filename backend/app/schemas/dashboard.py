"""Dashboard response schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LatestMetric(BaseModel):
    recorded_at: datetime
    cpu_percent: float
    memory_percent: float
    memory_total: float
    memory_available: float
    disk_percent: float
    disk_total: float
    disk_free: float
    network_bytes_sent: float
    network_bytes_received: float
    disk_read_bytes: Optional[float] = 0.0
    disk_write_bytes: Optional[float] = 0.0
    disk_read_rate_mb: Optional[float] = 0.0
    disk_write_rate_mb: Optional[float] = 0.0
    disk_iops: Optional[float] = 0.0
    io_status: Optional[dict] = None
    uptime_seconds: float


class DashboardServer(BaseModel):
    id: str
    site_id: str
    name: str
    hostname: str
    ip_address: Optional[str] = None
    status: str = "unknown"
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    latest: Optional[LatestMetric] = None


class DashboardTotals(BaseModel):
    servers: int = 0
    sites: int = 0
    online: int = 0
    warning: int = 0
    offline: int = 0
    unknown: int = 0
    active_alerts: int = 0


class DashboardResponse(BaseModel):
    sites: list[dict]
    servers: list[DashboardServer]
    totals: DashboardTotals