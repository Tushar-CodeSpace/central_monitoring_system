"""MongoDB connection management."""

from functools import lru_cache
from typing import Optional

from bson.errors import InvalidId
from bson.objectid import ObjectId
from pymongo import MongoClient
from pymongo.database import Database

from app.config.settings import settings


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    """Return a shared MongoClient (created once per process)."""
    return MongoClient(settings.mongo_url, serverSelectionTimeoutMS=5000)


def get_db() -> Database:
    """Return the monitoring database handle."""
    return get_client()[settings.mongo_db]


def close_client() -> None:
    """Close the shared client (call on application shutdown)."""
    get_client().close()


def to_object_id(value: str) -> Optional[ObjectId]:
    """Convert a hex string to ObjectId, or None if invalid."""
    try:
        return ObjectId(value)
    except InvalidId:
        return None