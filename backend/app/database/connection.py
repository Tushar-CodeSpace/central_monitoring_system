"""MongoDB connection management."""

import uuid
from functools import lru_cache
from typing import Optional
from uuid import UUID

from pymongo import MongoClient
from pymongo.database import Database

from app.config.settings import settings


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    """Return a shared MongoClient (created once per process)."""
    return MongoClient(settings.mongo_url, serverSelectionTimeoutMS=5000, tz_aware=True)


def get_db() -> Database:
    """Return the monitoring database handle."""
    return get_client()[settings.mongo_db]


def close_client() -> None:
    """Close the shared client (call on application shutdown)."""
    get_client().close()


def new_id() -> str:
    """Generate a new UUIDv4 string id (used for every document _id)."""
    return str(uuid.uuid4())


def parse_id(value: str) -> Optional[str]:
    """Return the value if it is a valid UUID string, else None."""
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        return None