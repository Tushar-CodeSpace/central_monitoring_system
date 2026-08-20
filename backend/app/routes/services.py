"""Service routes: agent reports services, dashboard views them."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import models as db
from app.database.connection import to_object_id
from app.realtime import emit
from app.schemas.service import ServiceRead, ServiceReport
from app.services import authentication as auth
from app.services.monitoring import authenticate_agent

router = APIRouter(prefix="/api/v1", tags=["services"])


def now() -> datetime:
    return datetime.now(timezone.utc)


def service_doc_to_read(doc: dict) -> ServiceRead:
    return ServiceRead(
        id=str(doc["_id"]),
        server_id=str(doc["server_id"]),
        name=doc["name"],
        status=doc["status"],
        port=doc.get("port"),
        last_checked_at=doc["last_checked_at"],
    )


@router.post("/services", status_code=status.HTTP_200_OK)
async def report_services(
    reports: list[ServiceReport],
    agent: dict = Depends(authenticate_agent),
) -> dict:
    """Agent endpoint: upsert the reported service statuses for its server."""
    server = agent["server"]
    timestamp = now()
    for report in reports:
        if report.server_id != str(server["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key does not match server_id",
            )
        db.services().update_one(
            {"server_id": server["_id"], "name": report.name},
            {
                "$set": {
                    "status": report.status,
                    "port": report.port,
                    "last_checked_at": timestamp,
                }
            },
            upsert=True,
        )
    emit("service_update", {"server_id": str(server["_id"])}, room=f"server:{server['_id']}")
    return {"success": True, "reported": len(reports)}


@router.get("/servers/{server_id}/services", response_model=list[ServiceRead])
async def list_services(
    server_id: str,
    _: dict = Depends(auth.get_current_user),
) -> list[ServiceRead]:
    """Dashboard endpoint: current service statuses for a server."""
    oid = to_object_id(server_id)
    if oid is None or db.servers().find_one({"_id": oid}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
    docs = list(db.services().find({"server_id": oid}).sort("name", 1))
    return [service_doc_to_read(d) for d in docs]