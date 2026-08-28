"""Alert engine: evaluate thresholds, create/dedupe/resolve alerts."""

from datetime import datetime, timezone
from typing import Optional

from app.database import models as db
from app.database.connection import new_id
from app.realtime import emit
from app.config.settings import settings
from app.services import app_settings, notifier
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
    hostname: Optional[str] = None,
    machine: Optional[str] = None,
    site_id=None,
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
            "hostname": hostname,
            "machine": machine,
        },
    )
    notifier.notify_alert(
        severity=severity,
        hostname=hostname,
        machine=machine,
        message=message,
        site_id=site_id,
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
) -> None:
    """Resolve an active alert, preserving its original issue message."""
    existing = _active_alert(alert_type, server_id, service_name)
    if existing is None:
        return
    timestamp = now()
    db.alerts().update_one(
        {"_id": existing["_id"]},
        {"$set": {"status": "resolved", "resolved_at": timestamp}},
    )
    emit(
        "alert_resolved",
        {
            "server_id": str(server_id),
            "type": alert_type,
            "severity": existing["severity"],
            "message": existing["message"],
        },
    )
    logger.info(
        "alert resolved",
        extra={"extra_fields": {"type": alert_type, "server_id": str(server_id)}},
    )


def evaluate_server(server: dict, cfg: Optional[dict] = None) -> None:
    """Evaluate one server: health status + metric/service thresholds.

    ``cfg`` is the effective alert config (fetched once per sweep by
    :func:`evaluate_all_alerts`); fetched on demand when omitted.
    """
    from app.services.monitoring import compute_status

    if cfg is None:
        cfg = app_settings.get_alert_config()

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
            hostname=server.get("hostname"),
            machine=server.get("name"),
            site_id=server.get("site_id"),
        )
    else:
        _resolve_alert("server_offline", server_id)

    if status == "unknown":
        return

    from datetime import timedelta

    cutoff = now() - timedelta(seconds=cfg["cpu_duration_seconds"])
    samples = list(
        db.metrics()
        .find({"server_id": server_id, "recorded_at": {"$gte": cutoff}})
        .sort("recorded_at", -1)
    )
    if not samples:
        return

    latest = samples[0]

    # CPU high: sustained (>=3 samples) above threshold within the window
    sustained = [s for s in samples if s["cpu_percent"] >= cfg["cpu_threshold_percent"]]
    if len(sustained) >= 3 and len(samples) >= 3:
        _open_alert(
            "cpu_high",
            server_id,
            "warning",
            f"CPU at {latest['cpu_percent']:.1f}% for {cfg['cpu_duration_seconds']}s",
            value=latest["cpu_percent"],
            threshold=cfg["cpu_threshold_percent"],
            hostname=server.get("hostname"),
            machine=server.get("name"),
            site_id=server.get("site_id"),
        )
    else:
        _resolve_alert("cpu_high", server_id)

    # RAM high
    if latest["memory_percent"] >= cfg["ram_threshold_percent"]:
        _open_alert(
            "ram_high",
            server_id,
            "warning",
            f"Memory at {latest['memory_percent']:.1f}%",
            value=latest["memory_percent"],
            threshold=cfg["ram_threshold_percent"],
            hostname=server.get("hostname"),
            machine=server.get("name"),
            site_id=server.get("site_id"),
        )
    else:
        _resolve_alert("ram_high", server_id)

    # Disk high
    if latest["disk_percent"] >= cfg["disk_threshold_percent"]:
        _open_alert(
            "disk_high",
            server_id,
            "warning",
            f"Disk at {latest['disk_percent']:.1f}%",
            value=latest["disk_percent"],
            threshold=cfg["disk_threshold_percent"],
            hostname=server.get("hostname"),
            machine=server.get("name"),
            site_id=server.get("site_id"),
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
                hostname=server.get("hostname"),
                machine=server.get("name"),
                site_id=server.get("site_id"),
            )
        else:
            _resolve_alert("service_stopped", server_id, service_name=service["name"])

    # API / Inter-service Error Monitoring (Status 400-599)
    api_5xx = latest.get("api_requests_5xx", 0) or 0
    api_4xx = latest.get("api_requests_4xx", 0) or 0
    api_err_rate = float(latest.get("api_error_rate_percent", 0.0) or 0.0)
    thresh = float(cfg.get("api_error_threshold_percent", 5.0) or 5.0)

    if api_5xx > 0 or (api_err_rate >= thresh and (api_5xx + api_4xx) > 0):
        severity = "critical" if api_5xx > 0 or api_err_rate >= 10.0 else "warning"
        msg = f"API Error Spike: {api_err_rate:.1f}% errors (5xx: {api_5xx}, 4xx: {api_4xx})"
        _open_alert(
            "api_error_spike",
            server_id,
            severity,
            msg,
            value=api_err_rate,
            threshold=thresh,
            hostname=server.get("hostname"),
            machine=server.get("name"),
            site_id=server.get("site_id"),
        )
    else:
        _resolve_alert("api_error_spike", server_id)