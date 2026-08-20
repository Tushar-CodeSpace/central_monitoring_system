# Central Monitoring System

A centralized continuous monitoring (CM) platform. Multiple servers/sites push
metrics to a single central dashboard.

## Architecture

```
Internet
   │
   ▼
Nginx :443
   ├── /api  → FastAPI Backend → MongoDB
   └── /     → React Dashboard (Vite + TS + Tailwind + shadcn/ui)

Python Agent (psutil) on each remote server ── HTTPS ──► API
```

Dashboard users authenticate with JWT tokens issued by the backend
(email/password, bcrypt-hashed, stored in MongoDB). Monitoring agents
authenticate with per-server API keys.

## Components

| Directory   | Purpose                                        |
|-------------|------------------------------------------------|
| `backend/`  | FastAPI API — metrics ingestion, alerts, auth, CRUD |
| `frontend/` | React dashboard                                |
| `agent/`    | Lightweight Python agent (psutil) per server   |
| `database/` | MongoDB init scripts (collections + indexes)   |
| `nginx/`    | Public entry point (TLS, /api + static files)  |
| `scripts/`  | Deploy, backup, restore, key generation        |
| `logs/`     | Local log files                                |

## Stack

- Ubuntu VPS · Docker · Docker Compose · Nginx
- MongoDB 7 in Docker
- FastAPI · Python · uv
- React · Vite · TypeScript · Tailwind CSS · shadcn/ui
- Python agent · uv · psutil

## Development status

Built step by step. See step log below as work progresses.

- [x] Step 1: project structure + git init
- [x] Step 2: env templates + baseline commit
- [x] Step 3: MongoDB in Docker (collections + indexes provisioned)
- [ ] Steps 4+: see execution plan
