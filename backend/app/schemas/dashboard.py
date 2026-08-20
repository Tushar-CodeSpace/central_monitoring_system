"""Dashboard response schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LatestMetric(BaseModel):
    recorded_at: datetime
    cpu_percent: float
    memory_percent: float
    memory_total: int
    memory_available: int
    disk_percent: float
    disk_total: int
    disk_free: int
    network_bytes_sent: int
    network_bytes_received: int
    uptime_seconds: int


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