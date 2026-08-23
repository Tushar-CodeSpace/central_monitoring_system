"""Site MongoDB config snapshot routes (agent ingest + dashboard queries)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import models as db
from app.database.connection import new_id, parse_id
from app.schemas.configs import ConfigIngest, ConfigSnapshotFull, ConfigSnapshotMeta
from app.services import authentication as auth
from app.services.monitoring import authenticate_agent

router = APIRouter(prefix="/api/v1/configs", tags=["configs"])

MAX_DOCUMENTS = 50_000


def _meta(doc: dict) -> ConfigSnapshotMeta:
    return ConfigSnapshotMeta(
        id=str(doc["_id"]),
        server_id=str(doc["server_id"]),
        database=doc["database"],
        collection=doc["collection"],
        captured_at=doc["captured_at"],
        received_at=doc["received_at"],
        count=doc["count"],
        content_hash=doc["content_hash"],
        truncated=doc.get("truncated", False),
    )


@router.post("/ingest")
async def ingest_config_snapshot(
    payload: ConfigIngest,
    agent: dict = Depends(authenticate_agent),
) -> dict:
    """Agent endpoint: store one config-collection snapshot (history on change)."""
    server = agent["server"]
    documents = payload.documents[:MAX_DOCUMENTS]
    truncated = payload.truncated or len(payload.documents) > MAX_DOCUMENTS

    latest = (
        db.site_configs()
        .find_one(
            {
                "server_id": server["_id"],
                "database": payload.database,
                "collection": payload.collection,
            },
            sort=[("received_at", -1)],
        )
    )
    if latest and latest["content_hash"] == payload.content_hash:
        return {"success": True, "stored": False, "reason": "unchanged"}

    now = datetime.now(timezone.utc)
    db.site_configs().insert_one(
        {
            "_id": new_id(),
            "server_id": server["_id"],
            "database": payload.database,
            "collection": payload.collection,
            "captured_at": payload.captured_at,
            "received_at": now,
            "count": len(documents),
            "content_hash": payload.content_hash,
            "truncated": truncated,
            "documents": documents,
        }
    )
    return {"success": True, "stored": True}


@router.get("/servers/{server_id}", response_model=list[ConfigSnapshotMeta])
async def list_latest_snapshots(
    server_id: str,
    _: dict = Depends(auth.get_current_user),
) -> list[ConfigSnapshotMeta]:
    """Latest stored snapshot metadata per (database, collection) for a server."""
    sid = parse_id(server_id)
    if sid is None or db.servers().find_one({"_id": sid}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")

    seen: set[tuple[str, str]] = set()
    out: list[ConfigSnapshotMeta] = []
    for doc in db.site_configs().find(
        {"server_id": sid}, {"documents": 0}
    ).sort("received_at", -1):
        key = (doc["database"], doc["collection"])
        if key in seen:
            continue
        seen.add(key)
        out.append(_meta(doc))
    return out


@router.get("/snapshots/{snapshot_id}", response_model=ConfigSnapshotFull)
async def get_snapshot(
    snapshot_id: str,
    _: dict = Depends(auth.get_current_user),
) -> ConfigSnapshotFull:
    snap_id = parse_id(snapshot_id)
    doc = db.site_configs().find_one({"_id": snap_id}) if snap_id else None
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    meta = _meta(doc)
    return ConfigSnapshotFull(**meta.model_dump(), documents=doc.get("documents", []))
