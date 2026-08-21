"""Dashboard route: one call with everything the overview page needs."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends

from app.database import models as db
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardServer,
    LatestMetric,
    DashboardTotals,
)
from app.services import authentication as auth

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

_LOOKBACK_MINUTES = 30


def now() -> datetime:
    return datetime.now(timezone.utc)


def latest_metric_map(server_ids: list) -> dict[str, dict]:
    if not server_ids:
        return {}
    cutoff = now() - timedelta(minutes=_LOOKBACK_MINUTES)
    pipeline = [
        {"$match": {"server_id": {"$in": server_ids}, "recorded_at": {"$gte": cutoff}}},
        {"$sort": {"recorded_at": -1}},
        {"$group": {"_id": "$server_id", "doc": {"$first": "$$ROOT"}}},
    ]
    return {doc["_id"]: doc["doc"] for doc in db.metrics().aggregate(pipeline)}


def metric_to_latest(doc: Optional[dict]) -> Optional[LatestMetric]:
    if doc is None:
        return None
    return LatestMetric(
        recorded_at=doc["recorded_at"],
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
    )


@router.get("", response_model=DashboardResponse)
async def dashboard(_: dict = Depends(auth.get_current_user)) -> DashboardResponse:
    sites = list(db.sites().find().sort("created_at", 1))
    servers = list(db.servers().find().sort("created_at", 1))
    latest = latest_metric_map([s["_id"] for s in servers])

    server_reads = []
    for server in servers:
        server_reads.append(
            DashboardServer(
                id=server["_id"],
                site_id=server["site_id"],
                name=server["name"],
                hostname=server["hostname"],
                ip_address=server.get("ip_address"),
                status=server.get("status", "unknown"),
                last_seen_at=server.get("last_seen_at"),
                created_at=server["created_at"],
                updated_at=server["updated_at"],
                latest=metric_to_latest(latest.get(server["_id"])),
            )
        )

    statuses = [s.get("status", "unknown") for s in servers]
    totals = DashboardTotals(
        online=statuses.count("online"),
        warning=statuses.count("warning"),
        offline=statuses.count("offline"),
        unknown=statuses.count("unknown"),
        servers=len(servers),
        sites=len(sites),
        active_alerts=db.alerts().count_documents({"status": "active"}),
    )

    return DashboardResponse(
        sites=[
            {
                "id": s["_id"],
                "client": s["client"],
                "code": s["code"],
                "location": s["location"],
                "status": s["status"],
                "created_at": s["created_at"],
                "updated_at": s["updated_at"],
            }
            for s in sites
        ],
        servers=server_reads,
        totals=totals,
    )