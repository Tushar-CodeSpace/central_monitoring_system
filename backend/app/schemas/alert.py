"""Alert schemas."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

AlertType = Literal[
    "cpu_high", "ram_high", "disk_high", "server_offline", "service_stopped", "api_unhealthy"
]
AlertSeverity = Literal["info", "warning", "critical"]
AlertStatus = Literal["active", "resolved"]


class AlertRead(BaseModel):
    id: str
    server_id: str
    type: AlertType
    severity: AlertSeverity
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    status: AlertStatus = "active"
    created_at: datetime
    resolved_at: Optional[datetime] = None