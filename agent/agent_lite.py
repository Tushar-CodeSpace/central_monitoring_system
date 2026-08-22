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

import json
import os
import socket
import sys
import time
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


def log(msg):
    sys.stderr.write("%s %s\n" % (datetime.now(timezone.utc).strftime("%H:%M:%S"), msg))
    sys.stderr.flush()


def read_proc(path):
    with open(path) as f:
        return f.read()


# --- collectors (Linux /proc) -------------------------------------------------

_cpu_prev = None  # (total, idle) snapshot for delta computation


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
    return int(float(read_proc("/proc/uptime").split()[0]))


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
    while True:
        try:
            cycle()
        except Exception as exc:  # never die mid-cycle
            log("cycle error: %r" % exc)
        try:
            time.sleep(max(1, INTERVAL))
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
