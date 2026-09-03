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

### Step 1 — Register the site

Dashboard → **Add agent** → note the printed `SERVER_ID` and `API_KEY`.

### Step 2 — Copy the agent & configure

```bash
sudo mkdir -p /opt/monitoring
sudo cp agent_lite.py /opt/monitoring/
```

Fill the `CONFIG` dict at the top of the script (needs `sudo` if root-owned):

```bash
sudo nano /opt/monitoring/agent_lite.py
```

```python
CONFIG = {
    "SERVER_ID": "6961e46c-...",                 # from Add-agent dialog
    "API_URL": "https://appstore.nidoworld.com/api/v1",
    "API_KEY": "cm-...",
    # Optional — other knobs (monitoring interval, services, mongo backup,
    # timeouts) are pulled from the central "Agent config" dashboard, so you
    # only set them here as local bootstrap defaults if you want to.
}
```

Alternatively keep the dict empty and export the same keys as environment
variables — env vars take precedence.

### Step 3 — Test run manually first

```bash
python3 /opt/monitoring/agent_lite.py
# expect: "lite agent starting ..." then "pushed cpu=… mem=…" every ~60s
# Ctrl-C to stop; the dashboard should already show the server online
```

### Step 4 — systemd service

```bash
sudo tee /etc/systemd/system/agent-lite.service >/dev/null <<'EOF'
[Unit]
Description=Octyn Watcher lite agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=REPLACE_WITH_LOCAL_USER
ExecStart=/usr/bin/python3 /opt/monitoring/agent_lite.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

- `User=` must be an account that **exists on this machine** (e.g. the user
  you're logged in as). Copy-pasting a unit from another site with its user is
  the #1 setup mistake — see troubleshooting below.
- If you kept secrets out of the script, add
  `EnvironmentFile=/opt/monitoring/agent.env` with the same key=value lines.
- `which python3` must return an absolute path (≥ 3.8) — use it in `ExecStart`.
- `ExecStart` must match your **actual deployed filename** — some sites save
  the script as `agent-lite.py`; keep file name, unit and path consistent.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agent-lite
systemctl status agent-lite --no-pager     # active (running)
journalctl -u agent-lite -n 10 --no-pager  # live push log
```

The server flips **online** in the dashboard within seconds; config lives in
the env file/script, so future script updates only need a re-copy +
`systemctl restart agent-lite`.

### systemd troubleshooting

| Log / status | Cause | Fix |
|---|---|---|
| `status=203/EXEC` | `ExecStart` uses a relative or wrong path (e.g. bare `python3`) | systemd needs absolute paths: `ExecStart=/usr/bin/python3 /opt/monitoring/agent_lite.py`. Confirm with `which python3` |
| `status=203/EXEC` persists after editing | unit still points at a stale location from another setup (e.g. `/opt/monitoring-agent/agent/.venv/...`) — `systemctl cat cm-agent` shows what systemd actually runs | Overwrite the whole unit with the tee template above so every path matches **your** deployed filename/location (`agent_lite.py` vs `agent-lite.py`), then `daemon-reload` + restart |
| `status=217/USER` — *Failed to determine user credentials* | `User=` names an account that doesn't exist on this machine (units copied between sites carry the old username) | Set `User=` to a real local user (`whoami`) and `daemon-reload` |
| Unit edited but old behavior persists | systemd still has the old definition cached | `sudo systemctl daemon-reload && sudo systemctl restart agent-lite` |
| `ModuleNotFoundError: No module named 'pymongo'` | config backup needs the driver | Ubuntu 24.04: `sudo apt install python3-pymongo`; pip fallback: `pip3 install pymongo --break-system-packages` |
| `config sync skipped: pymongo not installed` | driver missing — metrics still work, only config backup is off | install pymongo as above |
| `config sync skipped: cannot reach site mongodb: Connection refused / ServerSelectionTimeoutError` | nothing listening at the configured mongo URI — MongoDB isn't installed or isn't running on this host | Check: `systemctl status mongod` and `ss -tlnp \| grep 27017`. Install/start it and create the configured user. If this box intentionally has no DB, switch it off via the dashboard **Agent config** card (`mongo_config_enabled` = off) to silence the skip (metrics/alerts unaffected) |

### cron alternative

```cron
* * * * * python3 /opt/monitoring/agent_lite.py --once
```

(`--once` pushes a single sample and exits 0/1; use a systemd timer for
tighter cadence.)

### Notes

- Agent needs **outbound HTTPS only** — no inbound firewall rules.
- **Agent behavior is centrally managed.** Only `SERVER_ID` / `API_URL` /
  `API_KEY` are configured on the agent. Everything else — backup collections,
  daily backup hour, monitored-services list, monitoring interval, HTTP
  timeouts, and the site MongoDB connection — is pulled from the hub. On boot
  and then whenever it changes, the live agent config (including per-server
  overrides edited from the dashboard) is applied in seconds via a background
  config poller: no per-site redeploy or config edit needed.
  - Backup schedule: once per day at `config_sync_hour` (0–23, local agent
    time; default `0` = 12:00 AM).
  - Backup collections: from `config_collections` (falls back to the built-in
    list if the hub sends none).
  - Monitored services: from `monitored_services` (falls back to
    `MONITORED_SERVICES` if the hub sends none).
  - Mongo backup on/off + URI + auth source: `mongo_config_enabled` /
    `mongo_uri` / `mongo_auth_source` — if a box intentionally has no DB, set
    these via the dashboard Agent config card to silence the skip (metrics and
    alerts are unaffected).
- CPU% comes from `/proc/stat` deltas between cycles - no blocking sampling.
- Service entries without a port always report `running`; with `name:port`
  the status is a TCP connect check against 127.0.0.1 (`services=N` in logs).
- Failed pushes retry up to `HTTP_RETRY_COUNT` times with linear backoff;
  the process never exits mid-cycle.
