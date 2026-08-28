#!/usr/bin/env python3
"""agent_lite.py - zero-dependency monitoring agent (Python 3.8+, Linux).

Single-file alternative to the Docker agent. Collects metrics from /proc
(no psutil) and pushes them to the central API with urllib (no httpx).
Run it on any monitored server with the system python3 - nothing to install.

Usage:
    python3 agent_lite.py          # loop
    python3 agent_lite.py --once   # single push (cron/timer)

Configure either by filling the CONFIG dict below, or via environment
variables (env vars win if both are set).
"""

import hashlib
import json
import os
import socket
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ============================== CONFIGURATION ================================
# Fill in your server's values here and run the script directly - no env vars
# needed. Environment variables take precedence when they are set.
CONFIG = {
    # --- required ---
    "SERVER_ID": "",            # UUID shown in the dashboard / add-agent dialog
    "API_URL": "",              # e.g. http://central-host:8000/api/v1
    "API_KEY": "",              # per-agent key, starts with "cm-"
    # --- optional ---
    "MONITORING_INTERVAL": 10,          # seconds between pushes
    "MONITORED_SERVICES": "",           # comma list name[:port], e.g. nginx:80,postgresql:5432
    "HTTP_TIMEOUT_SECONDS": 10,
    "HTTP_RETRY_COUNT": 3,

    # --- optional: site MongoDB config backup (needs pymongo on the host) ---
    "MONGO_CONFIG_ENABLED": False,       # requires pymongo
    "MONGO_URI": "",                     # e.g. mongodb://nido:nido%40123@localhost:27017
    "MONGO_AUTH_SOURCE": "admin",
    "MONGO_CONFIG_INTERVAL": 86400,      # seconds; overridden by central server
}
# =============================================================================


def _cfg(key):
    """Value from the environment if set, else from the CONFIG dict above."""
    return os.environ.get(key) or str(CONFIG.get(key, ""))


INTERVAL = int(_cfg("MONITORING_INTERVAL") or 10)
TIMEOUT = int(_cfg("HTTP_TIMEOUT_SECONDS") or 10)
RETRIES = int(_cfg("HTTP_RETRY_COUNT") or 3)
SERVICES = [s.strip() for s in _cfg("MONITORED_SERVICES").split(",") if s.strip()]

SERVER_ID = _cfg("SERVER_ID")
API_URL = _cfg("API_URL").rstrip("/")
API_KEY = _cfg("API_KEY")

MONGO_CONFIG_ENABLED = _cfg("MONGO_CONFIG_ENABLED").lower() in {"1", "true", "yes", "on"}
MONGO_URI = _cfg("MONGO_URI")
MONGO_AUTH_SOURCE = _cfg("MONGO_AUTH_SOURCE") or "admin"
MONGO_CONFIG_INTERVAL = int(_cfg("MONGO_CONFIG_INTERVAL") or 86400)


def log(msg):
    sys.stderr.write("%s %s\n" % (datetime.now(timezone.utc).strftime("%H:%M:%S"), msg))
    sys.stderr.flush()


def _encode_uri_password(uri: str) -> str:
    """Safely URL-encode password in MongoDB connection URI if it contains special chars like '@'."""
    if not uri or "://" not in uri:
        return uri
    try:
        from pymongo.uri_parser import parse_uri
        parse_uri(uri)
        return uri  # URI is already valid and properly percent-encoded!
    except Exception:
        pass

    try:
        import urllib.parse
        prefix, rest = uri.split("://", 1)
        if "@" in rest:
            user_info, host_info = rest.rsplit("@", 1)
            if ":" in user_info:
                user, password = user_info.split(":", 1)
                encoded_pass = urllib.parse.quote(password, safe="")
                return f"{prefix}://{user}:{encoded_pass}@{host_info}"
    except Exception:
        pass
    return uri


def read_proc(path):
    with open(path) as f:
        return f.read()


# --- collectors (Linux /proc) -------------------------------------------------

_cpu_prev = None  # (total, idle) snapshot for delta computation


# --- optional: site MongoDB config backup (needs `pip3 install pymongo`) ---
try:
    from pymongo import MongoClient

    HAS_PYMONGO = True
except ImportError:
    MongoClient = None
    HAS_PYMONGO = False

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
    if hasattr(value, "binary"):
        return value.binary.hex()
    return str(value)


def _encode_uri_password(uri: str) -> str:
    """Percent-encode the password in a mongodb URI when needed."""
    try:
        parts = uri.split("://", 1)
        scheme, rest = parts[0], parts[1]
        if "@" not in rest:
            return uri
        userinfo, tail = rest.rsplit("@", 1)
        user, _, pwd = userinfo.partition(":")
        from urllib.parse import quote

        return f"{scheme}://{quote(user, safe='')}:{quote(pwd, safe='')}@{tail}"
    except Exception:
        return uri


def _proc_stat():
    """(total, idle) jiffies from the aggregate CPU line of /proc/stat."""
    parts = read_proc("/proc/stat").splitlines()[0].split()[1:]
    vals = [float(v) for v in parts]
    return sum(vals), vals[3] + (vals[4] if len(vals) > 4 else 0.0)


def cpu_percent():
    """CPU utilisation % from /proc/stat deltas."""
    global _cpu_prev
    if _cpu_prev is None:
        cpu_snapshot()
        time.sleep(0.5)  # brief window so the first delta is meaningful
    total, idle = _proc_stat()
    d_total, d_idle = total - _cpu_prev[0], idle - _cpu_prev[1]
    pct = 100.0 * (d_total - d_idle) / d_total if d_total > 0 else 0.0
    return round(min(max(pct, 0.0), 100.0), 2)


def cpu_snapshot():
    """Record the /proc/stat baseline used by the next cpu_percent() call."""
    global _cpu_prev
    _cpu_prev = _proc_stat()


def memory():
    info = {}
    for line in read_proc("/proc/meminfo").splitlines():
        k, v = line.split(":", 1)
        info[k] = float(v.split()[0]) * 1024.0  # kB -> bytes
    total = info["MemTotal"]
    avail = info.get("MemAvailable", info.get("MemFree", 0.0))
    return {
        "memory_percent": round(100.0 * (total - avail) / total, 2),
        "memory_total": total,
        "memory_available": avail,
    }


def disk(path="/"):
    st = os.statvfs(path)
    total = float(st.f_blocks * st.f_frsize)
    free = float(st.f_bavail * st.f_frsize)
    return {
        "disk_percent": round(100.0 * (total - free) / total, 2),
        "disk_total": total,
        "disk_free": free,
    }


def network():
    sent = recv = 0.0
    for line in read_proc("/proc/net/dev").splitlines()[2:]:
        iface, data = line.split(":", 1)
        if iface.strip() == "lo":
            continue
        fields = data.split()
        recv += float(fields[0])
        sent += float(fields[8])
    return {"network_bytes_sent": sent, "network_bytes_received": recv}


def uptime():
    try:
        return int(float(read_proc("/proc/uptime").split()[0]))
    except Exception:
        return 0


_io_prev = None  # (timestamp, read_bytes, write_bytes, reads_count, writes_count)


def disk_io():
    """Reads disk I/O metrics from /proc/diskstats (Linux) or returns defaults."""
    global _io_prev
    read_bytes = 0.0
    write_bytes = 0.0
    reads_cnt = 0.0
    writes_cnt = 0.0
    now_ts = time.time()

    if os.path.exists("/proc/diskstats"):
        try:
            with open("/proc/diskstats") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 14:
                        dev = parts[2]
                        if dev.startswith(("loop", "ram", "sr")):
                            continue
                        if dev.startswith(("sd", "vd", "xvd", "nvme", "mmcblk")):
                            r_completed = float(parts[3])
                            r_sectors = float(parts[5])
                            w_completed = float(parts[7])
                            w_sectors = float(parts[9])
                            reads_cnt += r_completed
                            writes_cnt += w_completed
                            read_bytes += r_sectors * 512.0
                            write_bytes += w_sectors * 512.0
        except Exception:
            pass

    r_rate = 0.0
    w_rate = 0.0
    iops = 0.0

    if _io_prev is not None:
        prev_ts, prev_r_b, prev_w_b, prev_r_c, prev_w_c = _io_prev
        dt = max(now_ts - prev_ts, 0.001)
        r_rate = round(max(read_bytes - prev_r_b, 0.0) / (1024.0 * 1024.0 * dt), 2)
        w_rate = round(max(write_bytes - prev_w_b, 0.0) / (1024.0 * 1024.0 * dt), 2)
        iops = round(max((reads_cnt - prev_r_c) + (writes_cnt - prev_w_c), 0.0) / dt, 1)

    _io_prev = (now_ts, read_bytes, write_bytes, reads_cnt, writes_cnt)

    status_str = "normal"
    if r_rate > 50.0 or w_rate > 50.0:
        status_str = "heavy_io"

    return {
        "disk_read_bytes": read_bytes,
        "disk_write_bytes": write_bytes,
        "disk_read_rate_mb": r_rate,
        "disk_write_rate_mb": w_rate,
        "disk_iops": iops,
        "io_status": {
            "status": status_str,
            "read_rate_mb": r_rate,
            "write_rate_mb": w_rate,
            "iops": iops,
            "read_bytes": read_bytes,
            "write_bytes": write_bytes,
        },
    }


def primary_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packets sent; just picks a route
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


def port_open(port, timeout=2.0):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def collect_services():
    reports = []
    for entry in SERVICES:
        name, _, p = entry.rpartition(":")
        port = int(p) if p.isdigit() and name else None
        if not name:
            name, port = entry, None
        reports.append({
            "server_id": SERVER_ID,
            "name": name,
            "status": "running" if (port is None or port_open(port)) else "stopped",
            "port": port,
        })
    return reports


def collect_metrics():
    sample = {
        "server_id": SERVER_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "hostname": socket.gethostname(),
        "ip_address": primary_ip(),
        "cpu_percent": cpu_percent(),
        "network_bytes_sent": 0.0,
        "network_bytes_received": 0.0,
        "uptime_seconds": uptime(),
    }
    sample.update(memory())
    sample.update(disk())
    sample.update(network())
    sample.update(disk_io())
    cpu_snapshot()  # baseline for the next cycle
    return sample


# --- transport (urllib) -------------------------------------------------------

def push(path, payload):
    from urllib.error import URLError
    from urllib.request import Request, urlopen

    req = Request(
        "%s/%s" % (API_URL, path.lstrip("/")),
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
        method="POST",
    )
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urlopen(req, timeout=TIMEOUT) as resp:
                if resp.status in (200, 201):
                    return True
                last_err = "HTTP %s" % resp.status
        except (URLError, OSError) as exc:
            last_err = str(exc.reason) if isinstance(exc, URLError) else str(exc)
        except Exception as exc:  # unexpected but keep the agent alive
            last_err = str(exc)
        if attempt < RETRIES:
            time.sleep(2 * attempt)
    log("push failed (%s): %s" % (path, last_err))
    return False


def cycle():
    m = collect_metrics()
    ok = push("/metrics", m)
    reports = collect_services()
    if reports:
        push("/services", reports)
    if ok:
        log("pushed cpu=%.1f%% mem=%.1f%% disk=%.1f%% services=%d"
            % (m["cpu_percent"], m["memory_percent"], m["disk_percent"], len(reports)))
    return ok


def sync_configs():
    """Snapshot mapped collections from the site MongoDB and push changes."""
    if not HAS_PYMONGO:
        log("config sync skipped: pymongo not installed (pip3 install pymongo)")
        return
    from pymongo import MongoClient

    uri = _encode_uri_password(os.environ.get("MONGO_URI", str(CONFIG.get("MONGO_URI", ""))))
    if not uri:
        return
    auth_source = os.environ.get(
        "MONGO_AUTH_SOURCE", str(CONFIG.get("MONGO_AUTH_SOURCE", "admin"))
    )

    client = None
    connected = False
    # Attempt ping using configured authSource, then fallback to test/default
    for src in filter(None, [auth_source, "admin", "test"]):
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
            log("config sync skipped: cannot reach site mongodb: %r" % (exc,))
            if client:
                client.close()
            return

    captured_at = datetime.now(timezone.utc).isoformat()
    db_names = set()
    try:
        db_names = set(client.list_database_names())
    except Exception:
        pass

    sent = skipped = missing = 0
    for database, collections in CONFIG_COLLECTION_MAP.items():
        if db_names and database not in db_names:
            missing += len(collections)
            continue
        try:
            coll_names = set(client[database].list_collection_names())
        except Exception:
            missing += len(collections)
            continue

        for name in collections:
            if name not in coll_names:
                missing += 1
                continue
            docs = [_jsonable(d) for d in client[database][name].find({}).limit(MAX_DOCS_PER_SNAPSHOT + 1)]
            truncated = len(docs) > MAX_DOCS_PER_SNAPSHOT
            docs = docs[:MAX_DOCS_PER_SNAPSHOT]
            payload_hash = hashlib.sha256(repr(sorted(docs, key=repr)).encode()).hexdigest()[:32]
            req = urllib.request.Request(
                "%s/configs/ingest" % API_URL,
                data=json.dumps({
                    "database": database,
                    "collection": name,
                    "captured_at": captured_at,
                    "count": len(docs),
                    "content_hash": payload_hash,
                    "documents": docs,
                    "truncated": truncated,
                }).encode(),
                headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                    body = json.loads(resp.read(500) or b"{}")
                    if body.get("stored"):
                        sent += 1
                    else:
                        skipped += 1
            except Exception as exc:
                log("config upload %s.%s failed: %r" % (database, name, exc))
    client.close()
    log("config sync done: pushed=%d unchanged=%d missing=%d" % (sent, skipped, missing))


def main():
    if not (SERVER_ID and API_URL and API_KEY):
        sys.exit(
            "error: SERVER_ID, API_URL and API_KEY are not set - "
            "fill the CONFIG dict at the top of this file or export them as env vars"
        )
    log("lite agent starting host=%s server_id=%s api_url=%s"
        % (socket.gethostname(), SERVER_ID, API_URL))
    if "--once" in sys.argv:
        sys.exit(0 if cycle() else 1)

    # Config-backup cadence is dictated by the central server on every beat.
    config_sync_enabled = True
    config_sync_interval = int(
        os.environ.get("MONGO_CONFIG_INTERVAL", str(CONFIG.get("MONGO_CONFIG_INTERVAL", 86400)))
    )
    last_config_sync = 0.0
    while True:
        try:
            cycle()
        except Exception as exc:  # never die mid-cycle
            log("cycle error: %r" % exc)

        now = time.time()
        if (
            MONGO_CONFIG_ENABLED
            and config_sync_enabled
            and HAS_PYMONGO
            and now - last_config_sync >= max(60, config_sync_interval)
        ):
            try:
                sync_configs()
            except Exception as exc:
                log("config sync error: %r" % exc)
            last_config_sync = now

        try:
            time.sleep(max(1, INTERVAL))
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
