"""Metrics routes: agent ingestion + dashboard queries."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import models as db
from app.database.connection import new_id, parse_id
from app.realtime import emit
from app.schemas.metrics import MetricCreate, MetricIngestResponse, MetricRead
from app.services import app_settings
from app.services import authentication as auth
from app.services import monitoring
from app.services.monitoring import authenticate_agent

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


def now() -> datetime:
    return datetime.now(timezone.utc)


def metric_doc_to_read(doc: dict) -> MetricRead:
    return MetricRead(
        id=doc["_id"],
        server_id=str(doc["server_id"]),
        timestamp=doc["timestamp"],
        cpu_percent=doc["cpu_percent"],
        memory_percent=doc["memory_percent"],
        memory_total=doc["memory_total"],
        memory_available=doc["memory_available"],
        disk_percent=doc["disk_percent"],
        disk_total=doc["disk_total"],
        disk_free=doc["disk_free"],
        network_bytes_sent=doc["network_bytes_sent"],
        network_bytes_received=doc["network_bytes_received"],
        uptime_seconds=doc["uptime_seconds"],
        recorded_at=doc["recorded_at"],
    )


@router.post("", response_model=MetricIngestResponse)
async def ingest_metric(
    payload: MetricCreate,
    agent: dict = Depends(authenticate_agent),
) -> MetricIngestResponse:
    """Agent endpoint: receive one metric sample for an authenticated server."""
    server = agent["server"]

    if payload.server_id != server["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not match server_id",
        )

    updates: dict = {}
    if getattr(payload, "hostname", None):
        updates["hostname"] = payload.hostname
    if getattr(payload, "ip_address", None):
        updates["ip_address"] = payload.ip_address
    if updates:
        updates["updated_at"] = now()
        db.servers().update_one({"_id": server["_id"]}, {"$set": updates})

    doc = payload.model_dump(exclude={"server_id"}) | {
        "_id": new_id(),
        "server_id": server["_id"],
        "recorded_at": now(),
    }
    db.metrics().insert_one(doc)

    emit(
        "metric",
        {
            "id": doc["_id"],
            "server_id": server["_id"],
            "timestamp": doc["timestamp"].isoformat(),
            "recorded_at": doc["recorded_at"].isoformat(),
            "cpu_percent": doc["cpu_percent"],
            "memory_percent": doc["memory_percent"],
            "memory_total": doc["memory_total"],
            "memory_available": doc["memory_available"],
            "disk_percent": doc["disk_percent"],
            "disk_total": doc["disk_total"],
            "disk_free": doc["disk_free"],
            "network_bytes_sent": doc["network_bytes_sent"],
            "network_bytes_received": doc["network_bytes_received"],
            "uptime_seconds": doc["uptime_seconds"],
        },
        room=f"server:{server['_id']}",
    )

    db.servers().update_one(
        {"_id": server["_id"]},
        {
            "$set": {
                "last_seen_at": doc["recorded_at"],
                "status": monitoring.effective_status(
                    monitoring.compute_status(doc["recorded_at"], doc["recorded_at"]),
                    monitoring.has_active_warning(server["_id"]),
                ),
                "updated_at": doc["recorded_at"],
            }
        },
    )
    sync_cfg = app_settings.get_config_sync_config()
    return MetricIngestResponse(
        success=True,
        config_sync_enabled=bool(sync_cfg["config_sync_enabled"]),
        config_sync_interval_seconds=int(sync_cfg["config_sync_interval_seconds"]),
    )


@router.get("/servers/{server_id}", response_model=list[MetricRead])
async def list_metrics(
    server_id: str,
    minutes: int = Query(default=60, ge=1, le=43200),
    limit: int = Query(default=1000, ge=1, le=10000),
    _: dict = Depends(auth.get_current_user),
) -> list[MetricRead]:
    """Dashboard endpoint: recent metrics for a server (time-series data)."""
    sid = parse_id(server_id)
    if sid is None or db.servers().find_one({"_id": sid}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
    since = now() - timedelta(minutes=minutes)
    docs = list(
        db.metrics()
        .find({"server_id": sid, "recorded_at": {"$gte": since}})
        .sort("recorded_at", 1)
        .limit(limit)
    )
    return [metric_doc_to_read(d) for d in docs]