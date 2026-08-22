# Monitoring Agent

Two flavors, same API contract — both push metrics to `POST /api/v1/metrics`
and service reports to `/api/v1/services` using a per-agent `X-API-Key`.

## 1. Docker agent (`agent/`, deployed via docker-compose)

Full-featured agent (psutil + httpx + pydantic-settings) that runs as the
`agent` service in `docker-compose.yml`. Configure it through `agent/.env`
(see `.env.example`). Prefer this wherever Docker is already available.

## 2. Lite agent (`agent_lite.py`) - zero dependencies, single file

For bare servers where you want nothing installed: one ~200-line Python file,
pure stdlib, reads metrics from `/proc`. **Linux only** (Python 3.8+).

### Deploy

```bash
# copy agent_lite.py to the server, then:
SERVER_ID=<uuid> \
API_URL=https://monitoring.example.com/api/v1 \
API_KEY=cm-... \
MONITORING_INTERVAL=10 \
MONITORED_SERVICES=nginx:80,postgresql:5432 \
nohup python3 agent_lite.py >/var/log/agent_lite.log 2>&1 &
```

Env vars are identical to the Docker agent's `.env`, so the block printed by
the dashboard's "Add agent" dialog works verbatim.

### systemd (recommended)

```ini
# /etc/systemd/system/agent-lite.service
[Unit]
Description=Central Monitor lite agent
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/agent_lite.py
Environment=SERVER_ID=<uuid>
Environment=API_URL=https://monitoring.example.com/api/v1
Environment=API_KEY=cm-...
Environment=MONITORING_INTERVAL=10
Environment=MONITORED_SERVICES=nginx:80,postgresql:5432
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now agent-lite
```

### cron alternative

```cron
* * * * * SERVER_ID=... API_KEY=... python3 /opt/agent_lite.py --once
```

(`--once` pushes a single sample and exits; run it every minute or use a
systemd timer for tighter cadence.)

### Notes

- CPU% comes from `/proc/stat` deltas between cycles - no blocking sampling.
- Service entries without a port always report `running`; with `name:port`
  the status is a TCP connect check against 127.0.0.1.
- Failed pushes retry up to `HTTP_RETRY_COUNT` times with linear backoff;
  the process never exits mid-cycle.
