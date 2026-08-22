# Central Monitoring System

A centralized **continuous monitoring (CM) platform** for tracking multiple
client sites, servers, services and alerts from one dashboard. Lightweight
Python agents run on each monitored server and push system metrics to a
central FastAPI backend, which stores everything in **MongoDB**. A React
dashboard (shadcn/ui style, Recharts) visualizes live status, historical
charts, services and alerts in real time.

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────────────────────┐
│ Monitored server(s) │        │            Central server                │
│                     │  HTTP  │ ┌────────┐   ┌──────────┐   ┌─────────┐  │
│  ┌──────────────┐   │ ─────► │ │  nginx │──►│  FastAPI │──►│ MongoDB │  │
│  │ cm-agent     │──┼─X-API-Key│ │ (SPA)  │   │  backend │   │   7.0   │  │
│  │ (Python,     │   │        │ └────────┘   │ /api/v1  │   └─────────┘  │
│  │  psutil)     │   │        │  React SPA   │          │   JSON logs   │
│  └──────────────┘   │        │  (Recharts)  └──────────┘   └─────────┘  │
└─────────────────────┘        └──────────────────────────────────────────┘
```

**Data flow:** agent collects CPU/memory/disk/network/uptime + service
status every `MONITORING_INTERVAL` seconds → `POST /api/v1/metrics` and
`POST /api/v1/services` (authenticated with a per-server API key) → backend
stores the sample, updates `last_seen_at`/health status, and the background
evaluator derives health + raises alerts → dashboard polls and renders.

## Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Backend    | Python 3.14, FastAPI, uvicorn, PyMongo, bcrypt + PyJWT (sessions)  |
| Database   | MongoDB 7.0 (Docker), collections: `sites, servers, metrics, services, alerts, users, api_keys` |
| Frontend   | React 19 + Vite + TypeScript, Tailwind CSS 4, shadcn-style UI, Recharts, react-router |
| Agents     | Python + psutil + httpx (packaged as a Docker image or run standalone) |
| Proxy      | nginx: serves the SPA and reverse-proxies `/api` to the backend   |
| Runtime    | Docker Compose (full stack), systemd not required                 |

## Key design decisions

- **Sites are client locations**, e.g. `samsonite` / `samsonite_nashik_conveyor_01` / `Nashik`.
- **Two auth layers:**
  - *Dashboard users* — email/password (bcrypt), JWT sessions issued by the backend (`/api/v1/auth/login`).
  - *Agents* — per-server API keys sent in the `X-API-Key` header. Only the
    SHA-256 **hash** is stored; the raw key is shown exactly once at creation.
- **Health detection** — heartbeat-based: `last_seen_at` age < 120s → `online`,
  < 300s → `warning`, otherwise `offline` (configurable).
- **Alert engine** (background evaluator, every 30s) — CPU > 90% sustained 5 min,
  RAM > 90%, disk > 85%, server offline, service stopped/error. Alerts are
  deduplicated while active and auto-resolved when conditions clear.
- **Retention** — raw metrics kept 30 days (daily automatic cleanup);
  resolved alerts older than 90 days are purged.
- **Structured logging** — JSON lines to stdout + rotating `logs/backend.log`.

## Project layout

```
central_monitoring_system/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── config/          # settings (pydantic-settings)
│   │   ├── database/        # pymongo client, models, indexes
│   │   ├── routes/          # health, auth, sites, servers, metrics,
│   │   │                    # services, api_keys, alerts
│   │   ├── schemas/         # pydantic request/response models
│   │   └── services/        # authentication, monitoring, alerts,
│   │                        # background loop, JSON logging
│   └── scripts/             # smoke tests (uv run python scripts/…)
├── agent/                   # monitoring agent (psutil collector)
├── frontend/                # React SPA (Vite + Tailwind + Recharts)
├── database/init/mongo/     # first-boot Mongo init (user + indexes)
├── nginx/                   # VPS reverse-proxy template (TLS)
├── scripts/                 # seed, cleanup
├── logs/                    # backend JSON logs (gitignored except .gitkeep)
├── docker-compose.yml       # full stack: mongodb, backend, frontend, agent
├── .env / .env.example      # root environment (never commit .env)
└── README.md
```

## API surface

| Method | Path                                   | Auth          | Purpose                          |
| ------ | -------------------------------------- | ------------- | -------------------------------- |
| GET    | `/health`                              | —             | liveness probe                   |
| POST   | `/api/v1/auth/login`                   | —             | dashboard login → JWT            |
| GET    | `/api/v1/auth/me`                      | JWT           | current user                     |
| GET/POST | `/api/v1/sites` … `/{id}` PATCH/DELETE | JWT           | site CRUD                        |
| GET/POST | `/api/v1/servers` … `/{id}` PATCH/DELETE | JWT         | server CRUD (delete cascades)    |
| POST   | `/api/v1/metrics`                      | API key       | agent metric ingestion           |
| GET    | `/api/v1/metrics/servers/{id}`         | JWT           | recent metrics (`?minutes=&limit=`) |
| POST   | `/api/v1/services`                     | API key       | agent service reports (list)     |
| GET    | `/api/v1/servers/{id}/services`        | JWT           | service statuses                 |
| GET    | `/api/v1/alerts`                       | JWT           | alert history (`?status=&server_id=`) |
| POST   | `/api/v1/alerts/{id}/resolve`          | JWT           | manual resolve                   |
| DELETE | `/api/v1/alerts/{id}`                  | JWT           | delete alert                     |
| POST/GET | `/api/v1/servers/{id}/api-keys`      | JWT           | create (raw key shown once) / list keys |
| DELETE | `/api/v1/api-keys/{id}`                | JWT           | revoke agent key                 |

Interactive docs at `http://localhost:8000/docs` (OpenAPI).

## Quick start (local)

Prerequisites: Docker Desktop, Python 3.14+ (with `uv`), Node 20+.

```bash
# 1. Environment
cp .env.example .env                    # fill in Mongo + JWT secrets
cp backend/.env.example backend/.env    # set MONGO_URL + JWT_SECRET
cp agent/.env.example agent/.env        # set SERVER_ID + API_KEY after onboarding

# 2. Start MongoDB and seed demo data
docker compose up -d mongodb
uv run --project backend scripts/seed.py          # 2 sites, 1 server, demo user, demo API key

# 3. Backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000   # from backend/

# 4. Frontend (dev server with /api proxy)
npm install && npm run dev                          # from frontend/

# 5. Agent (against a real server)
uv run python agent/app.py                          # from agent/
```

**Demo credentials** (created by `seed.py`):

| Role        | Email                | Password   |
| ----------- | -------------------- | ---------- |
| Frontend / dashboard login | `admin@monitoring.com` | `admin123` |

Change this password immediately in production (it is stored as a bcrypt
hash in the `users` collection).

## Full stack with Docker Compose

```bash
cp .env.example .env && cp agent/.env.example agent/.env   # fill values
docker compose up -d --build
```

- Frontend/nginx on `http://localhost:${FRONTEND_PORT:-80}` (VPS: `80`, local: `8080`)
- Backend directly on `127.0.0.1:8000` (dev only; nginx is the public entrypoint)
- MongoDB bound to `127.0.0.1:27017` only — never exposed publicly
- `docker compose logs -f backend` → structured JSON logs

## Deploying to a VPS (central server)

### 1. Prerequisites (Ubuntu)

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"          # log out/in afterwards
```

### 2. Install the project

```bash
sudo mkdir -p /opt/monitoring
sudo chown -R "$USER":"$USER" /opt/monitoring
# Copy the repository (rsync/scp/git clone — .env files are NOT committed)
rsync -av --exclude '.env' --exclude 'backend/.env' --exclude 'agent/.env' \
      --exclude 'node_modules' --exclude '.venv' ./ /opt/monitoring/
```

### 3. Environment

```bash
cd /opt/monitoring
cp .env.example .env
# set strong MONGO_INITDB_ROOT_PASSWORD, MONGO_APP_PASSWORD, JWT_SECRET, DOMAIN
cp agent/.env.example agent/.env         # fill SERVER_ID/API_KEY after onboarding
```

Start MongoDB **first** so the init scripts and seed run once on the fresh volume:

```bash
docker compose up -d mongodb
uv run --project backend scripts/seed.py   # optional demo data; or onboard via API
```

**Default dashboard login** (created by `seed.py`): email
`admin@monitoring.com`, password `admin123` — change it after first login.

### 4. Bring up the stack

```bash
docker compose up -d --build    # backend on 127.0.0.1:8000, frontend on port 80
docker compose ps
curl -s http://127.0.0.1:8080/api/v1/auth/me    # 401 = reachable and working
```

### 5. TLS with Let's Encrypt

```bash
sudo cp nginx/central-monitoring.conf /etc/nginx/sites-available/central-monitoring
sudo sed -i 's/monitoring.example.com/YOUR_DOMAIN/g' \
  /etc/nginx/sites-available/central-monitoring
sudo ln -s /etc/nginx/sites-available/central-monitoring /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN     # issues cert + wires 443 redirect
# renewal is automatic via systemd timer
```

**Firewall:** allow only 22, 80, 443. `27017` (Mongo) and `8000` (backend) stay on loopback.

## Onboarding a site/server (via API)

```bash
# create site
curl -H "Authorization: Bearer $TOKEN" -X POST https://YOUR_DOMAIN/api/v1/sites \
  -H "Content-Type: application/json" \
  -d '{"client":"samsonite","code":"samsonite_kolkata_conveyor_01","location":"Kolkata","status":"active"}'

# create server → note server_id
curl -H "Authorization: Bearer $TOKEN" -X POST https://YOUR_DOMAIN/api/v1/servers \
  -H "Content-Type: application/json" \
  -d '{"site_id":"<site_id>","name":"Kolkata Conveyor 01","hostname":"kolkata-c1","ip_address":"10.0.3.15"}'

# issue an agent key → COPY THE RAW KEY NOW (shown exactly once)
curl -H "Authorization: Bearer $TOKEN" -X POST \
  https://YOUR_DOMAIN/api/v1/servers/<server_id>/api-keys \
  -H "Content-Type: application/json" -d '{"name":"prod-agent"}'
```

(On the dashboard you can also manage sites and keys in the UI.)

## Deploying the agent (client server)

### Option A — standalone (recommended for a few servers)

```bash
# needs Python + uv on the client server
cp agent/.env.example agent/.env
# edit agent/.env:
#   SERVER_ID=<server_id from onboarding>
#   API_URL=https://YOUR_DOMAIN/api/v1
#   API_KEY=<raw key copied during onboarding>
#   MONITORED_SERVICES=nginx:80,mongodb:27017,...
uv run --project agent agent/app.py            # test once, watch it push

# run forever via systemd — create /etc/systemd/system/cm-agent.service:
# [Unit]
# Description=Central Monitoring Agent
# After=network-online.target
# [Service]
# WorkingDirectory=/opt/monitoring-agent/agent
# ExecStart=/opt/monitoring-agent/agent/.venv/bin/python agent/app.py
# Restart=always
# RestartSec=10
# [Install]
# WantedBy=multi-user.target

sudo systemctl daemon-reload && sudo systemctl enable --now cm-agent
journalctl -u cm-agent -f                     # verify pushes
```

### Option B — containerized

Copy the project to the client server, add an `agent` service to
`docker-compose.yml` with its own `env_file` (see the included `agent`
service), then `docker compose up -d agent`.

## Verify the deployment

- Dashboard: `https://YOUR_DOMAIN` → server card turns **online** within ~2 min, charts populate.
- `docker compose logs -f backend` → JSON logs, `alert opened`/`resolved` entries.
- `journalctl -u cm-agent -f` → `pushed metrics cpu=…% mem=…% disk=…%`.

**Gotcha:** `MONITORED_SERVICES` must list ports that actually exist on the
client server — otherwise every service is reported `stopped` and the alert
engine fires `service_stopped` alerts.

## Operations (VPS)

| Task                     | Command                                                |
| ------------------------ | ------------------------------------------------------ |
| Logs (JSON)              | `docker compose logs -f backend` / `tail -f logs/backend.log` |
| Restart backend          | `docker compose restart backend`                       |
| Update                   | `git pull && docker compose up -d --build`             |
| Backup Mongo             | `docker compose exec -T mongodb mongosh …` or `mongodump` |
| Manual retention sweep   | `uv run --project backend scripts/cleanup.py`          |

## Security notes

- MongoDB binds to `127.0.0.1` only — never expose port 27017 publicly.
- Dashboard sessions: bcrypt password hashes + short-lived JWTs.
- Agent keys: only SHA-256 hashes stored; raw key shown once; revoke via `DELETE /api/v1/api-keys/{id}`.
- Keep `JWT_SECRET` and all `.env` values out of the repository.
- Always terminate TLS in front (see the nginx template in `nginx/`).

## Tests

Smoke tests run against the running Mongo (dev) and use FastAPI TestClient:

```bash
uv run python scripts/test_auth.py      # login / token / 401s
uv run python scripts/test_crud.py      # sites + servers CRUD, guards, cascade
uv run python scripts/test_metrics.py   # agent key auth, ingestion, query, revoke
```

## Configuration reference

| Variable                     | Default    | Description                              |
| ---------------------------- | ---------- | ---------------------------------------- |
| `MONGO_INITDB_ROOT_USERNAME/PASSWORD` | —   | Mongo admin (first boot)          |
| `MONGO_APP_USER/PASSWORD`    | —          | least-privilege backend DB user          |
| `MONGO_INITDB_DATABASE`      | `central_monitoring` | DB name                    |
| `JWT_SECRET`                 | `change-me`| HS256 signing secret (≥ 32 bytes)        |
| `JWT_EXPIRE_MINUTES`         | `1440`     | dashboard session lifetime               |
| `API_KEY_HEADER`             | `X-API-Key`| agent auth header                        |
| `HEALTH_ONLINE_MAX_SECONDS`  | `12`       | heartbeat age → online                   |
| `HEALTH_WARNING_MAX_SECONDS` | `22`       | heartbeat age → warning (else offline)   |
| `ALERT_CPU_THRESHOLD_PERCENT`| `90`       | CPU alert threshold                      |
| `ALERT_CPU_DURATION_SECONDS` | `300`      | sustained window for CPU alerts          |
| `ALERT_RAM_THRESHOLD_PERCENT`| `90`       | RAM alert threshold                      |
| `ALERT_DISK_THRESHOLD_PERCENT`| `85`      | disk alert threshold                     |
| `EVALUATOR_INTERVAL_SECONDS` | `5`        | background evaluator cadence             |
| `METRICS_RETENTION_DAYS`     | `30`       | raw metric retention                     |
| `CORS_ORIGINS`               | `*`        | comma-separated origins (`*` dev only)   |
| `LOG_LEVEL` / `LOG_DIR`      | `INFO` / `logs` | logging                          |
| Agent: `MONITORING_INTERVAL` | `10`       | collection cadence (s)                   |
| Agent: `MONITORED_SERVICES`  | —          | `name:port,name2:port2` to watch         |

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/cicd.yml`):

| Job | Runs | What it does |
|---|---|---|
| `backend-tests` | every PR + push | mongo:7 service container (root auth), `uv sync`, init + seed via `scripts/init_ci_mongo.py` / `scripts/seed_ci.py`, then smoke scripts (`test_auth`, `test_crud`, `test_metrics`) |
| `frontend` | every PR + push | `npm ci` + typecheck/build |
| `agent` | every PR + push | syntax check both agents |
| `images` | push to `main` only | buildx builds 3 images → pushes `ghcr.io/tushar-codespace/central-monitoring-{backend,frontend,agent}:latest` and `:sha-<8char>` |
| `deploy` | after images | SSH to VPS, sync repo, compose pull + up with `docker-compose.prod.yml`, healthcheck `/health` |

### One-time setup

#### Step 1 — Deploy key pair (on your machine)

```bash
ssh-keygen -t ed25519 -f ./deploy_key -N "" -C "central-monitoring-ci"
```

#### Step 2 — Authorize the key on the VPS

```bash
# on the VPS, as the deploy user
mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys   # paste deploy_key.pub, then Ctrl-D
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

The user must be able to run Docker (`root`, or a user in the `docker` group).

#### Step 3 — GHCR read token

GitHub → Settings → Developer settings → Personal access tokens (classic) →
Generate new token with **`read:packages`** scope only.
(GHCR images are private by default; the VPS uses this token for
`docker login ghcr.io`. Alternatively make the packages public and drop the login.)

#### Step 4 — Add repository secrets

Repo → Settings → Secrets and variables → Actions → *New repository secret*:

| Secret | Example |
|---|---|
| `VPS_HOST` | `203.0.113.10` |
| `VPS_PORT` | `22` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | contents of `deploy_key` (**private** key) |
| `VPS_DEPLOY_PATH` | `/opt/central_monitoring` |
| `GHCR_USER` | `Tushar-CodeSpace` |
| `GHCR_TOKEN` | PAT from step 3 |

#### Step 5 — Prepare `/opt/central_monitoring` on the VPS

```bash
# Docker + compose plugin installed, then:
git clone https://github.com/Tushar-CodeSpace/central_monitoring_system.git /opt/central_monitoring
cd /opt/central_monitoring

# own it as the deploy user (avoids git dubious-ownership / write errors)
sudo chown -R "$(id -un)":"$(id -gn)" /opt/central_monitoring

cp .env.example .env            # fill MONGO_APP_PASSWORD, JWT_SECRET, FRONTEND_PORT=8080, ...
mkdir -p agent && cp agent/.env.example agent/.env   # agent credentials for this server
```

Env files are gitignored — deploys never overwrite them.

#### Step 6 — First deploy

Push to `main` (or Actions → CI/CD → Run workflow), then **Re-run failed jobs**
if only `deploy` needs a retry after fixing secrets.

### Troubleshooting deploys

| Error | Fix |
|---|---|
| `missing server host` | secrets not set (step 4) |
| `Permission denied (publickey)` | wrong private key / not in `authorized_keys` (steps 1–2) |
| `detected dubious ownership` | `chown -R` the repo dir as the SSH user (step 5); workflow also sets `safe.directory` |
| `denied` pulling from ghcr.io | bad/expired `GHCR_TOKEN`, missing `read:packages` scope |
| healthcheck fails after deploy | check `docker compose logs backend`; previous containers stay up unless `up -d` replaced them |

### Rollback

Every push to `main` runs: tests → images → automatic VPS deploy. To roll back to an older build (tags live in GHCR):

```bash
cd /opt/central_monitoring
IMAGE_TAG=sha-abc12345 docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
