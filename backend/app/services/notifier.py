"""Outbound WhatsApp notifications via a self-hosted Evolution API gateway.

Fire-and-forget: every send runs on a daemon thread with a hard timeout so a
slow or dead gateway can never stall the alert engine or health sweep.
"""

import json
import threading
from typing import Optional

import urllib.request

from app.services.logging_setup import get_logger

logger = get_logger(__name__)

TIMEOUT_S = 10


def _post_send(cfg: dict, number: str, text: str) -> tuple[bool, str]:
    """Blocking POST to Evolution API. Returns (ok, detail)."""
    url = f"{cfg['whatsapp_base_url'].rstrip('/')}/message/sendText/{cfg['whatsapp_instance']}"
    req = urllib.request.Request(
        url,
        data=json.dumps({"number": number, "text": text}).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": cfg["whatsapp_api_key"],
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            body = resp.read(200).decode(errors="replace")
            ok = 200 <= resp.status < 300
            return ok, f"HTTP {resp.status}" if ok else f"HTTP {resp.status}: {body}"
    except Exception as exc:  # noqa: BLE001 - report any gateway failure
        return False, repr(exc)


def _recipients(cfg: dict) -> list[str]:
    return [n.strip() for n in cfg.get("whatsapp_recipients", "").split(",") if n.strip()]


def notify_alert(severity: str, hostname: Optional[str], message: str) -> None:
    """Queue a WhatsApp message for every recipient. Non-blocking."""
    from app.services import app_settings

    cfg = app_settings.get_notification_config()
    if not cfg["whatsapp_enabled"]:
        return
    numbers = _recipients(cfg)
    if not numbers:
        logger.warning("whatsapp enabled but no recipients configured")
        return

    text = (
        f"⚠️ CentralMonitor [{severity}] "
        f"{hostname or 'server'}: {message}"
    )
    for number in numbers:
        threading.Thread(
            target=_deliver,
            args=(dict(cfg), number, text),
            daemon=True,
            name=f"wa-{number}",
        ).start()


def _deliver(cfg: dict, number: str, text: str) -> None:
    ok, detail = _post_send(cfg, number, text)
    if ok:
        logger.info("whatsapp sent to %s (%s)", number, detail)
    else:
        logger.warning("whatsapp send to %s failed: %s", number, detail)


def send_test(number: Optional[str] = None) -> list[dict]:
    """Synchronously send a test message; returns per-recipient results."""
    from app.services import app_settings

    cfg = app_settings.get_notification_config()
    numbers = [number.strip()] if number else _recipients(cfg)
    if not numbers:
        return [{"number": "-", "ok": False, "detail": "no recipients configured"}]

    text = "✅ Test message from CentralMonitor — WhatsApp alerts are wired up."
    results = []
    for n in numbers:
        ok, detail = _post_send(cfg, n, text)
        results.append({"number": n, "ok": ok, "detail": detail})
    return results
