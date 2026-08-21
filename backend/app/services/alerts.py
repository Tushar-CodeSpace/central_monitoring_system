"""Alert engine: evaluate thresholds, create/dedupe/resolve alerts."""

from datetime import datetime, timezone
from typing import Optional

from app.database import models as db
from app.database.connection import new_id
from app.realtime import emit
from app.config.settings import settings
from app.services.logging_setup import get_logger

logger = get_logger(__name__)


def now() -> datetime:
    return datetime.now(timezone.utc)


def _active_alert(
    alert_type: str, server_id, service_name: Optional[str] = None
) -> Optional[dict]:
    query: dict = {
        "type": alert_type,
        "server_id": server_id,
        "status": "active",
        "service_name": service_name,
    }
    return db.alerts().find_one(query)


def _open_alert(
    alert_type: str,
    server_id,
    severity: str,
    message: str,
    service_name: Optional[str] = None,
    value: Optional[float] = None,
    threshold: Optional[float] = None,
) -> None:
    existing = _active_alert(alert_type, server_id, service_name)
    timestamp = now()
    if existing:
        db.alerts().update_one(
            {"_id": existing["_id"]},
            {"$set": {"last_seen_at": timestamp, "value": value, "message": message}},
        )
        return
    db.alerts().insert_one(
        {
            "_id": new_id(),
            "type": alert_type,
            "server_id": server_id,
            "service_name": service_name,
            "severity": severity,
            "message": message,
            "value": value,
            "threshold": threshold,
            "status": "active",
            "created_at": timestamp,
            "last_seen_at": timestamp,
            "resolved_at": None,
        }
    )
    emit(
        "alert_opened",
        {
            "server_id": str(server_id),
            "type": alert_type,
            "severity": severity,
            "message": message,
        },
    )
    logger.warning(
        "alert opened",
        extra={
            "extra_fields": {
                "type": alert_type,
                "severity": severity,
                "message": message,
                "server_id": str(server_id),
            }
        },
    )


def _resolve_alert(
    alert_type: str,
    server_id,
    service_name: Optional[str] = None,
    message: str = "Back to normal",
) -> None:
    existing = _active_alert(alert_type, server_id, service_name)
    if existing is None:
        return
    timestamp = now()
    db.alerts().update_one(
        {"_id": existing["_id"]},
        {"$set": {"status": "resolved", "resolved_at": timestamp, "message": message}},
    )
    emit(
        "alert_resolved",
        {
            "server_id": str(server_id),
            "type": alert_type,
            "message": message,
        },
    )
    logger.info(
        "alert resolved",
        extra={"extra_fields": {"type": alert_type, "server_id": str(server_id)}},
    )


def evaluate_server(server: dict) -> None:
    """Evaluate one server: health status + metric/service thresholds."""
    from app.services.monitoring import compute_status

    last_seen = server.get("last_seen_at")
    status = compute_status(last_seen)
    server_id = server["_id"]

    if status == "offline":
        _open_alert(
            "server_offline",
            server_id,
            "critical",
            f"Server {server.get('hostname', server_id)} is offline "
            f"(no heartbeat for >{settings.health_warning_max_seconds}s)",
        )
    else:
        _resolve_alert("server_offline", server_id)

    if status == "unknown":
        return

    from datetime import timedelta

    from app.config.settings import settings

    cutoff = now() - timedelta(seconds=settings.alert_cpu_duration_seconds)
    samples = list(
        db.metrics()
        .find({"server_id": server_id, "recorded_at": {"$gte": cutoff}})
        .sort("recorded_at", -1)
    )
    if not samples:
        return

    latest = samples[0]

    # CPU high: sustained (>=3 samples) above threshold within the window
    sustained = [s for s in samples if s["cpu_percent"] >= settings.alert_cpu_threshold_percent]
    if len(sustained) >= 3 and len(samples) >= 3:
        _open_alert(
            "cpu_high",
            server_id,
            "warning",
            f"CPU at {latest['cpu_percent']:.1f}% for {settings.alert_cpu_duration_seconds}s",
            value=latest["cpu_percent"],
            threshold=settings.alert_cpu_threshold_percent,
        )
    else:
        _resolve_alert("cpu_high", server_id)

    # RAM high
    if latest["memory_percent"] >= settings.alert_ram_threshold_percent:
        _open_alert(
            "ram_high",
            server_id,
            "warning",
            f"Memory at {latest['memory_percent']:.1f}%",
            value=latest["memory_percent"],
            threshold=settings.alert_ram_threshold_percent,
        )
    else:
        _resolve_alert("ram_high", server_id)

    # Disk high
    if latest["disk_percent"] >= settings.alert_disk_threshold_percent:
        _open_alert(
            "disk_high",
            server_id,
            "warning",
            f"Disk at {latest['disk_percent']:.1f}%",
            value=latest["disk_percent"],
            threshold=settings.alert_disk_threshold_percent,
        )
    else:
        _resolve_alert("disk_high", server_id)

    # Service stopped/error
    for service in db.services().find({"server_id": server_id}):
        if service["status"] in ("stopped", "error"):
            _open_alert(
                "service_stopped",
                server_id,
                "critical",
                f"Service {service['name']} is {service['status']}",
                service_name=service["name"],
            )
        else:
            _resolve_alert("service_stopped", server_id, service_name=service["name"])