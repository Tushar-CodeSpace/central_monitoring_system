"""Server CRUD routes (dashboard users only)."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import models as db
from app.database.connection import new_id, parse_id
from app.realtime import emit
from app.schemas.server import ServerCreate, ServerRead, ServerUpdate
from app.services import authentication as auth

router = APIRouter(
    prefix="/api/v1/servers",
    tags=["servers"],
    dependencies=[Depends(auth.get_current_user)],
)


def now() -> datetime:
    return datetime.now(timezone.utc)


def server_doc_to_read(doc: dict) -> ServerRead:
    return ServerRead(
        id=doc["_id"],
        site_id=doc["site_id"],
        name=doc["name"],
        hostname=doc["hostname"],
        ip_address=doc.get("ip_address"),
        status=doc.get("status", "unknown"),
        last_seen_at=doc.get("last_seen_at"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def find_server_or_404(server_id: str) -> dict:
    sid = parse_id(server_id)
    doc = db.servers().find_one({"_id": sid}) if sid else None
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
    return doc


def verify_site_exists(site_id: str) -> None:
    sid = parse_id(site_id)
    if sid is None or db.sites().find_one({"_id": sid}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")


@router.get("", response_model=list[ServerRead])
async def list_servers(
    site_id: Optional[str] = Query(default=None, description="Filter by site"),
) -> list[ServerRead]:
    query: dict = {}
    if site_id:
        sid = parse_id(site_id)
        if sid is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
        query["site_id"] = sid
    docs = list(db.servers().find(query).sort("created_at", 1))
    return [server_doc_to_read(d) for d in docs]


@router.post(
    "",
    response_model=ServerRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth.require_admin)],
)
async def create_server(body: ServerCreate) -> ServerRead:
    verify_site_exists(body.site_id)
    if db.servers().find_one({"hostname": body.hostname}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Hostname already exists"
        )
    sid = parse_id(body.site_id)
    doc = (
        body.model_dump(exclude={"site_id"})
        | {"_id": new_id(), "site_id": sid, "status": "unknown", "last_seen_at": None, "created_at": now(), "updated_at": now()}
    )
    db.servers().insert_one(doc)
    created = server_doc_to_read(doc)
    emit("server_created", created.model_dump(mode="json"))
    return created


@router.get("/{server_id}", response_model=ServerRead)
async def get_server(server_id: str) -> ServerRead:
    return server_doc_to_read(find_server_or_404(server_id))


@router.patch(
    "/{server_id}",
    response_model=ServerRead,
    dependencies=[Depends(auth.require_admin)],
)
async def update_server(server_id: str, body: ServerUpdate) -> ServerRead:
    doc = find_server_or_404(server_id)
    updates: dict = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "site_id" in updates:
        verify_site_exists(updates["site_id"])
        updates["site_id"] = parse_id(updates["site_id"])
    if "hostname" in updates and updates["hostname"] != doc["hostname"]:
        if db.servers().find_one({"hostname": updates["hostname"]}):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Hostname already exists"
            )
    if updates:
        updates["updated_at"] = now()
        db.servers().update_one({"_id": doc["_id"]}, {"$set": updates})
    updated = server_doc_to_read(db.servers().find_one({"_id": doc["_id"]}))
    emit("server_updated", updated.model_dump(mode="json"))
    return updated


@router.delete(
    "/{server_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(auth.require_admin)],
)
async def delete_server(server_id: str) -> None:
    doc = find_server_or_404(server_id)
    # Cascade: agent credentials, services, metrics and alerts for this server
    db.api_keys().delete_many({"server_id": doc["_id"]})
    db.services().delete_many({"server_id": doc["_id"]})
    db.metrics().delete_many({"server_id": doc["_id"]})
    db.alerts().delete_many({"server_id": doc["_id"]})
    db.servers().delete_one({"_id": doc["_id"]})
    emit("server_deleted", {"server_id": str(doc["_id"])})