"""Central Monitoring agent.

Collects system metrics (psutil) and service status, then pushes them to the
central API. Runs forever on MONITORING_INTERVAL seconds.

Run: uv run python agent/app.py
"""

import logging
import socket
import time
from datetime import datetime, timezone

import psutil
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore


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
    log_level: str = "INFO"


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


def collect_services() -> list[dict]:
    """Report status of MONITORED_SERVICES (name[:port]).

    Status is running if a TCP connection to the port succeeds, else stopped.
    """
    reports = []
    for entry in [s.strip() for s in settings.monitored_services.split(",") if s.strip()]:
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

    def push_metrics(self, sample: dict) -> bool:
        return self.push("/metrics", sample)

    def push_services(self, reports: list[dict]) -> bool:
        return self.push("/services", reports)


def main() -> None:
    logger.info(
        "agent starting host=%s server_id=%s api_url=%s",
        socket.gethostname(),
        settings.server_id,
        settings.api_url,
    )
    api = ApiClient()
    while True:
        try:
            sample = collect_system_metrics()
            ok_metrics = api.push_metrics(sample)
            reports = collect_services()
            ok_services = api.push_services(reports)
            if ok_metrics:
                logger.info(
                    "pushed metrics cpu=%s%% mem=%s%% disk=%s%% services=%s",
                    sample["cpu_percent"],
                    sample["memory_percent"],
                    sample["disk_percent"],
                    len(reports),
                )
            else:
                logger.error("metric push failed")
        except Exception:
            logger.exception("collection error")
        time.sleep(settings.monitoring_interval)


if __name__ == "__main__":
    main()