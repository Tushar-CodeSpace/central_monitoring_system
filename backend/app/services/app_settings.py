"""Runtime-configurable application settings, stored in MongoDB.

A single document per group (e.g. ``_id: "alerts"``) overrides the static
defaults from ``app.config.settings``. Missing values fall back to defaults,
so a fresh deployment behaves exactly like the env-var configuration until
someone edits values from the Settings UI.
"""

from datetime import datetime, timezone
from typing import Optional

from app.config.settings import settings
from app.database import models as db

_ALERT_DOC = "alerts"

# field -> (type, default, min, max)
_ALERT_FIELDS: dict[str, tuple[type, float, Optional[float], Optional[float]]] = {
    "ram_threshold_percent": (float, settings.alert_ram_threshold_percent, 0.0, 100.0),
    "cpu_threshold_percent": (float, settings.alert_cpu_threshold_percent, 0.0, 100.0),
    "cpu_duration_seconds": (int, settings.alert_cpu_duration_seconds, 30.0, None),
    "disk_threshold_percent": (float, settings.alert_disk_threshold_percent, 0.0, 100.0),
}


def _doc():
    return db.settings().find_one({"_id": _ALERT_DOC}) or {}


def get_alert_config() -> dict:
    """Effective alert thresholds (DB overrides merged over defaults)."""
    stored = _doc()
    out: dict[str, float | int] = {}
    for name, (typ, default, lo, hi) in _ALERT_FIELDS.items():
        raw = stored.get(name, default)
        try:
            value = typ(raw)
        except (TypeError, ValueError):
            value = typ(default)
        if lo is not None:
            value = max(lo, value)
        if hi is not None:
            value = min(hi, value)
        out[name] = value
    return out


def update_alert_config(patch: dict) -> dict:
    """Validate and persist a partial alert-threshold update. Returns effective config."""
    clean: dict[str, float | int] = {}
    for key, raw in patch.items():
        if key not in _ALERT_FIELDS:
            raise ValueError(f"unknown setting: {key}")
        typ, _, lo, hi = _ALERT_FIELDS[key]
        try:
            value = typ(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key}: invalid number {raw!r}") from exc
        if lo is not None and value < lo:
            raise ValueError(f"{key}: must be >= {lo:g}")
        if hi is not None and value > hi:
            raise ValueError(f"{key}: must be <= {hi:g}")
        clean[key] = value

    if clean:
        db.settings().update_one(
            {"_id": _ALERT_DOC},
            {"$set": {**clean, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    return get_alert_config()
