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

_NOTIF_DOC = "notifications"

# field -> (type, default)
_NOTIFICATION_FIELDS: dict[str, tuple[type, object]] = {
    "whatsapp_enabled": (bool, False),
    "whatsapp_base_url": (str, "http://evolution-api:8080"),
    "whatsapp_instance": (str, "central-monitoring"),
    "whatsapp_api_key": (str, ""),
    "whatsapp_recipients": (str, ""),
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


def _coerce_bool(raw) -> bool:
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def get_notification_config() -> dict:
    """Effective WhatsApp notification config (DB overrides over defaults)."""
    stored = db.settings().find_one({"_id": _NOTIF_DOC}) or {}
    out: dict[str, object] = {}
    for name, (typ, default) in _NOTIFICATION_FIELDS.items():
        raw = stored.get(name)
        if raw is None or (typ is str and str(raw).strip() == "" and default == ""):
            value = default
        elif typ is bool:
            value = _coerce_bool(raw if raw != "" else default)
        else:
            value = str(raw).strip()
        out[name] = value
    return out


def update_notification_config(patch: dict) -> dict:
    """Validate and persist a partial WhatsApp config update."""
    clean: dict[str, object] = {}
    for key, raw in patch.items():
        if key not in _NOTIFICATION_FIELDS:
            raise ValueError(f"unknown setting: {key}")
        typ, _ = _NOTIFICATION_FIELDS[key]
        if typ is bool:
            clean[key] = _coerce_bool(raw)
        else:
            value = str(raw).strip()
            if key == "whatsapp_base_url" and not value.startswith(("http://", "https://")):
                raise ValueError("whatsapp_base_url must start with http:// or https://")
            clean[key] = value

    if clean:
        db.settings().update_one(
            {"_id": _NOTIF_DOC},
            {"$set": {**clean, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    return get_notification_config()
