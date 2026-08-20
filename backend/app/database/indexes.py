"""Ensure all required MongoDB indexes exist (idempotent, run at startup).

An index is only created when no existing index shares the same key pattern,
so this is safe against indexes created by the init script or earlier runs.
"""

from pymongo.collection import Collection

from app.database import models as db


def _ensure_index(collection: Collection, keys, **options) -> None:
    for info in collection.index_information().values():
        if list(info["key"]) == list(keys):
            return
    collection.create_index(keys, **options)


def ensure_indexes() -> None:
    _ensure_index(db.metrics(), [("server_id", 1), ("recorded_at", 1)])
    _ensure_index(db.metrics(), [("recorded_at", 1)])
    _ensure_index(db.api_keys(), [("key_hash", 1)], unique=True)
    _ensure_index(db.api_keys(), [("server_id", 1)])
    _ensure_index(db.users(), [("email", 1)], unique=True)
    _ensure_index(db.services(), [("server_id", 1), ("name", 1)], unique=True)
    _ensure_index(db.alerts(), [("status", 1), ("created_at", -1)])
    _ensure_index(db.alerts(), [("server_id", 1), ("status", 1)])
    _ensure_index(
        db.alerts(),
        [("type", 1), ("server_id", 1), ("service_name", 1)],
        partialFilterExpression={"status": "active"},
        unique=True,
    )