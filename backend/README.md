# Octyn Watcher - Backend (FastAPI)

FastAPI API for the Octyn Watcher platform.

## Run locally (dev)

```bash
cp .env.example .env   # fill real values
uv run uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the interactive API docs.

## Structure

```
app/
├── main.py          # FastAPI app entrypoint
├── config/          # settings (pydantic-settings)
├── database/        # MongoDB connection + document helpers
├── schemas/         # request/response models
├── routes/          # API routes (health, sites, servers, metrics, ...)
└── services/        # business logic (monitoring, authentication, alerts)
```

## Health check

`GET /health` → `{"status": "ok"}`
