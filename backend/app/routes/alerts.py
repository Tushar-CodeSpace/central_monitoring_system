"""Alert routes (dashboard users only)."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import models as db
from app.database.connection import to_object_id
from app.schemas.alert import AlertRead
from app.services import authentication as auth

router = APIRouter(
    prefix="/api/v1/alerts",
    tags=["alerts"],
    dependencies=[Depends(auth.get_current_user)],
)


def now() -> datetime:
    return datetime.now(timezone.utc)


def alert_doc_to_read(doc: dict) -> AlertRead:
    return AlertRead(
        id=str(doc["_id"]),
        server_id=str(doc["server_id"]),
        type=doc["type"],
        severity=doc["severity"],
        message=doc["message"],
        value=doc.get("value"),
        threshold=doc.get("threshold"),
        status=doc.get("status", "active"),
        created_at=doc["created_at"],
        resolved_at=doc.get("resolved_at"),
    )


def find_alert_or_404(alert_id: str) -> dict:
    oid = to_object_id(alert_id)
    doc = db.alerts().find_one({"_id": oid}) if oid else None
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return doc


@router.get("", response_model=list[AlertRead])
async def list_alerts(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    server_id: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[AlertRead]:
    """Dashboard endpoint: alert history, optionally filtered."""
    query: dict = {}
    if status_filter in ("active", "resolved"):
        query["status"] = status_filter
    if server_id:
        oid = to_object_id(server_id)
        if oid is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
        query["server_id"] = oid
    docs = list(db.alerts().find(query).sort("created_at", -1).limit(limit))
    return [alert_doc_to_read(d) for d in docs]


@router.post("/{alert_id}/resolve", response_model=AlertRead)
async def resolve_alert(alert_id: str) -> AlertRead:
    """Mark an active alert as resolved manually."""
    doc = find_alert_or_404(alert_id)
    db.alerts().update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "resolved", "resolved_at": now(), "message": "Resolved manually"}},
    )
    return alert_doc_to_read(db.alerts().find_one({"_id": doc["_id"]}))


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(alert_id: str) -> None:
    doc = find_alert_or_404(alert_id)
    db.alerts().delete_one({"_id": doc["_id"]})