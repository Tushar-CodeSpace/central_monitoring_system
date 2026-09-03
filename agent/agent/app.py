"""Octyn Watcher agent.

Collects system metrics (psutil) and service status, then pushes them to the
central API. Runs forever on MONITORING_INTERVAL seconds.

Run: uv run python agent/app.py
"""

import logging
import hashlib
import socket
import threading
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit

import psutil
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore

try:
    from pymongo import MongoClient
except ImportError:  # pragma: no cover
    MongoClient = None  # type: ignore


class AgentSettings(BaseSettings):
    """Agent settings from agent/.env or environment."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    server_id: str
    api_url: str
    api_key: str
    monitoring_interval: int = 60
    monitored_services: str = ""
    http_timeout_seconds: int = 10
    http_retry_count: int = 3
    config_poll_interval_seconds: int = 5
    log_level: str = "INFO"

    # Site MongoDB config backup (schedule/collections dictated by the central server)
    mongo_config_enabled: bool = True
    mongo_uri: str = "mongodb://nido:nido@123@localhost:27017"
    mongo_auth_source: str = "admin"


settings = AgentSettings()

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("agent")


def _primary_ipv4() -> str:
    """First non-loopback IPv4 address, or empty string."""
    try:
        for addrs in psutil.net_if_addrs().values():
            for addr in addrs:
                if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                    return addr.address
    except Exception:  # pragma: no cover
        pass
    return ""


def collect_system_metrics() -> dict:
    """Return a metric sample compatible with the central API."""
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    return {
        "server_id": settings.server_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "hostname": socket.gethostname(),
        "ip_address": _primary_ipv4(),
        "cpu_percent": round(cpu, 2),
        "memory_percent": round(mem.percent, 2),
        "memory_total": mem.total,
        "memory_available": mem.available,
        "disk_percent": round(disk.percent, 2),
        "disk_total": disk.total,
        "disk_free": disk.free,
        "network_bytes_sent": net.bytes_sent,
        "network_bytes_received": net.bytes_recv,
        "uptime_seconds": int(time.time() - psutil.boot_time()),
    }


def collect_services(api: ApiClient) -> list[dict]:
    """Report status of monitored services (name[:port]).

    Status is running if a TCP connection to the port succeeds, else stopped.
    """
    reports = []
    raw = api.monitored_services
    for entry in [s.strip() for s in raw.split(",") if s.strip()]:
        if ":" in entry:
            name, port = entry.rsplit(":", 1)
            port = int(port)
        else:
            name, port = entry, None
        status = "running"
        if port:
            status = "stopped" if not _port_open(port) else "running"
        reports.append(
            {
                "server_id": settings.server_id,
                "name": name,
                "status": status,
                "port": port,
            }
        )
    return reports


def _port_open(port: int, host: str = "127.0.0.1", timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


class ApiClient:
    def __init__(self) -> None:
        self.client = httpx.Client(
            base_url=settings.api_url,
            headers={"X-API-Key": settings.api_key},
            timeout=settings.http_timeout_seconds,
        )
        # Agent runtime config, dictated by the central server on every beat.
        self.agent_config: dict = {}

    def apply_config(self, config: dict) -> None:
        """Merge a config payload from the hub into the agent's live settings.

        Assigns a fresh dict (copy-on-write) so a background config poller can
        update config while the main metrics loop reads it without locking.
        """
        if not isinstance(config, dict):
            return
        merged = dict(self.agent_config)
        if isinstance(config.get("config_sync_enabled"), bool):
            merged["config_sync_enabled"] = config["config_sync_enabled"]
        if isinstance(config.get("config_sync_hour"), int) and 0 <= config["config_sync_hour"] <= 23:
            merged["config_sync_hour"] = config["config_sync_hour"]
        if isinstance(config.get("monitored_services"), list):
            merged["monitored_services"] = [
                str(s) for s in config["monitored_services"] if str(s).strip()
            ]
        if isinstance(config.get("config_collections"), list):
            merged["config_collections"] = config["config_collections"]
        self.agent_config = merged

    def fetch_config(self) -> dict:
        """GET the effective agent config from the hub ({} on failure)."""
        for attempt in range(1, settings.http_retry_count + 1):
            try:
                resp = self.client.get("/agent/config")
                if resp.status_code == 200:
                    try:
                        return resp.json()
                    except ValueError:
                        return {}
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
            time.sleep(min(2 * attempt, 5))
        logger.warning("config fetch failed: %s", last_error)
        return {}

    @property
    def config_sync_enabled(self) -> bool:
        return bool(self.agent_config.get("config_sync_enabled", True))

    @property
    def config_sync_hour(self) -> int:
        hour = self.agent_config.get("config_sync_hour", 0)
        try:
            return max(0, min(23, int(hour)))
        except (TypeError, ValueError):
            return 0

    @property
    def config_collections(self) -> dict[str, list[str]]:
        raw = self.agent_config.get("config_collections")
        if not isinstance(raw, list):
            return dict(CONFIG_COLLECTION_MAP)
        out: dict[str, list[str]] = {}
        for item in raw:
            if not isinstance(item, dict):
                continue
            database = str(item.get("database", "")).strip()
            collections = item.get("collections", [])
            if not database or not isinstance(collections, list):
                continue
            out[database] = [str(c).strip() for c in collections if str(c).strip()]
        return out or dict(CONFIG_COLLECTION_MAP)

    @property
    def monitored_services(self) -> str:
        services = self.agent_config.get("monitored_services")
        if isinstance(services, list) and services:
            return ",".join(str(s) for s in services)
        return settings.monitored_services

    def push(self, path: str, payload) -> bool:
        last_error = None
        for attempt in range(1, settings.http_retry_count + 1):
            try:
                resp = self.client.post(path, json=payload)
                if resp.status_code in (200, 201):
                    return True
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
            logger.warning("push failed (attempt %s/%s): %s", attempt, settings.http_retry_count, last_error)
            time.sleep(2 * attempt)
        return False

    def push_metrics(self, sample: dict) -> dict:
        """Send one metric sample; returns the parsed response ({} on failure)."""
        last_error = None
        for attempt in range(1, settings.http_retry_count + 1):
            try:
                resp = self.client.post("/metrics", json=sample)
                if resp.status_code in (200, 201):
                    try:
                        return resp.json()
                    except ValueError:
                        return {}
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
            logger.warning(
                "push failed (attempt %s/%s): %s",
                attempt,
                settings.http_retry_count,
                last_error,
            )
            time.sleep(2 * attempt)
        return {}

    def push_services(self, reports: list[dict]) -> bool:
        return self.push("/services", reports)

    def start_config_poller(self) -> None:
        """Poll the hub for config changes in a background thread.

        Keeps the agent's live config fresh the moment an admin changes it in
        the dashboard — no per-site redeploy and no waiting for the next metrics
        beat. Falls back silently on network errors.
        """

        def _poll():
            last = None
            while True:
                try:
                    new_cfg = self.fetch_config()
                    if new_cfg and new_cfg != last:
                        last = new_cfg
                        self.apply_config(new_cfg)
                        logger.info("agent config updated from hub: %r", new_cfg)
                except Exception:  # noqa: BLE001 - keep the poller alive
                    logger.exception("config poll error")
                time.sleep(max(1, settings.config_poll_interval_seconds))

        threading.Thread(target=_poll, name="config-poller", daemon=True).start()


# --- Site MongoDB config backup -------------------------------------------

CONFIG_COLLECTION_MAP: dict[str, list[str]] = {
    "analytic_service": ["analytic_config"],
    "data_uploader_service": ["integration_config"],
    "identity_service": [
        "UIControls",
        "client_setup",
        "features_code",
        "formcode_mappings",
        "monitoring_configurations",
        "notifiers",
        "pages_code",
        "products",
        "products_category",
        "roles",
        "users",
    ],
    "incoming_service": ["incoming_config"],
    "machine_configurations": ["machines"],
    "sorting_service": ["business_logic", "rejection_codes", "sorting_config"],
    "bagging": ["active_bags", "bagging_config", "ptl_users"],
    "calibration_service": ["calibration_boxes", "calibration_process", "calibration_results"],
    "cyclic_data_service": ["active_location_statuses", "alarms"],
    "notification_service": ["notifiers"],
}

MAX_DOCS_PER_SNAPSHOT = 50_000


def _jsonable(value):
    """Recursively convert BSON-only types into JSON-safe equivalents."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "binary"):  # bson.Binary
        return value.binary.hex()
    return str(value)


def _encode_uri_password(uri: str) -> str:
    """Percent-encode the password in a mongodb URI if it isn't already."""
    try:
        parts = urlsplit(uri)
        if "@" not in parts.netloc:
            return uri
        userinfo, host = parts.netloc.rsplit("@", 1)
        user, _, pwd = userinfo.partition(":")
        netloc = f"{quote(user, safe='')}:{quote(pwd, safe='')}@{host}"
        return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:  # noqa: BLE001 - fall back to raw URI
        return uri


def sync_configs(api: ApiClient) -> None:
    """Snapshot mapped collections from the site MongoDB and push changes."""
    if MongoClient is None:
        logger.info("config sync skipped: pymongo not installed")
        return
    uri = _encode_uri_password(settings.mongo_uri)
    if not uri or not settings.mongo_config_enabled:
        return

    client = None
    connected = False
    for src in filter(None, [settings.mongo_auth_source, "admin", "test"]):
        try:
            temp_client = MongoClient(uri, authSource=src, serverSelectionTimeoutMS=5000)
            temp_client[src].command("ping")
            client = temp_client
            connected = True
            break
        except Exception:
            try:
                temp_client.close()
            except Exception:
                pass

    if not connected or not client:
        try:
            client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
            connected = True
        except Exception as exc:
            logger.warning("config sync skipped: cannot reach site mongodb: %r", exc)
            if client:
                client.close()
            return

    captured_at = datetime.now(timezone.utc).isoformat()
    sent = skipped = missing = 0
    collection_map = api.config_collections

    try:
        for database, collections in collection_map.items():
            db_names = set(client.list_database_names())
            for name in collections:
                if database not in db_names or name not in client[database].list_collection_names():
                    missing += 1
                    continue
                coll = client[database][name]
                docs = [_jsonable(d) for d in coll.find({}).limit(MAX_DOCS_PER_SNAPSHOT + 1)]
                truncated = len(docs) > MAX_DOCS_PER_SNAPSHOT
                docs = docs[:MAX_DOCS_PER_SNAPSHOT]
                payload_hash = hashlib.sha256(
                    repr(sorted(docs, key=lambda d: repr(d))).encode()
                ).hexdigest()[:32]
                result = api.client.post(
                    "/configs/ingest",
                    json={
                        "database": database,
                        "collection": name,
                        "captured_at": captured_at,
                        "count": len(docs),
                        "content_hash": payload_hash,
                        "documents": docs,
                        "truncated": truncated,
                    },
                )
                if result.status_code in (200, 201):
                    body = result.json() if result.content else {}
                    if body.get("stored"):
                        sent += 1
                    else:
                        skipped += 1
                else:
                    logger.warning(
                        "config upload %s.%s failed: HTTP %s",
                        database,
                        name,
                        result.status_code,
                    )
    finally:
        client.close()
    logger.info("config sync done: pushed=%s unchanged=%s missing=%s", sent, skipped, missing)


def db_missing(client, database: str) -> bool:
    return database not in client.list_database_names()


def main() -> None:
    logger.info(
        "agent starting host=%s server_id=%s api_url=%s",
        socket.gethostname(),
        settings.server_id,
        settings.api_url,
    )
    api = ApiClient()
    api.start_config_poller()
    last_config_sync_day = None
    while True:
        try:
            sample = collect_system_metrics()
            body = api.push_metrics(sample)
            if isinstance(body, dict):
                api.apply_config(body)
            reports = collect_services(api)
            ok_services = api.push_services(reports)
            if body:
                logger.info(
                    "pushed metrics cpu=%s%% mem=%s%% disk=%s%% services=%s",
                    sample["cpu_percent"],
                    sample["memory_percent"],
                    sample["disk_percent"],
                    len(reports),
                )
            else:
                logger.error("metric push failed")

            now_local = datetime.now()
            if (
                settings.mongo_config_enabled
                and api.config_sync_enabled
                and now_local.date() != last_config_sync_day
                and now_local.hour == api.config_sync_hour
                and body
            ):
                try:
                    sync_configs(api)
                except Exception:
                    logger.exception("config sync error")
                last_config_sync_day = now_local.date()
        except Exception:
            logger.exception("collection error")
        time.sleep(settings.monitoring_interval)


if __name__ == "__main__":
    main()