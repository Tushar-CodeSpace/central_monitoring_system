"""MongoDB document collections for the monitoring platform."""

from pymongo.collection import Collection

from app.database.connection import get_db


def sites() -> Collection:
    return get_db()["sites"]


def servers() -> Collection:
    return get_db()["servers"]


def metrics() -> Collection:
    return get_db()["metrics"]


def services() -> Collection:
    return get_db()["services"]


def alerts() -> Collection:
    return get_db()["alerts"]


def users() -> Collection:
    return get_db()["users"]


def api_keys() -> Collection:
    return get_db()["api_keys"]


def settings() -> Collection:
    return get_db()["settings"]