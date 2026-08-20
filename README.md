# Central Monitoring System

A centralized continuous monitoring (CM) platform. Multiple servers/sites push
metrics to a single central dashboard.

## Architecture

```
Internet
   │
   ▼
Nginx :443
   ├── /api  → FastAPI Backend → Supabase Local → PostgreSQL
   └── /     → React Dashboard (Vite + TS + Tailwind + shadcn/ui)

Python Agent (psutil) on each remote server ── HTTPS ──► API
```

## Components

| Directory   | Purpose                                        |
|-------------|------------------------------------------------|
| `backend/`  | FastAPI API — metrics ingestion, alerts, CRUD  |
| `frontend/` | React dashboard with Supabase Auth             |
| `agent/`    | Lightweight Python agent (psutil) per server   |
| `database/` | Schema migrations and seed data                |
| `nginx/`    | Public entry point (TLS, /api + static files)  |
| `scripts/`  | Deploy, backup, restore, key generation        |
| `logs/`     | Local log files                                |

## Stack

- Ubuntu VPS · Docker · Docker Compose · Nginx
- Supabase Local (PostgreSQL + gotrue Auth) in Docker
- FastAPI · Python · uv
- React · Vite · TypeScript · Tailwind CSS · shadcn/ui
- Python agent · uv · psutil

## Development status

Built step by step. See step log below as work progresses.

- [ ] Step 1: project structure + git init
- [ ] Steps 2+: see execution plan
