"""Smoke test for agent auth + metrics ingestion (run: uv run python scripts/test_metrics.py)."""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# --- login as dashboard user ---
r = client.post(
    "/api/v1/auth/login",
    json={"email": "admin@monitoring.com", "password": "admin123"},
)
assert r.status_code == 200, r.text
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

# --- find seed server (samsonite-nashik-c1) ---
r = client.get("/api/v1/servers", headers=H)
assert r.status_code == 200, r.text
server = next(s for s in r.json() if s["hostname"] == "samsonite-nashik-c1")
print("server:", server["hostname"], server["id"])

# --- purge orphaned test keys from previously crashed runs ---
for k in client.get(f"/api/v1/servers/{server['id']}/api-keys", headers=H).json():
    if k["name"] == "test-agent":
        client.delete(f"/api/v1/api-keys/{k['id']}", headers=H)

# --- create a fresh agent API key ---
r = client.post(
    f"/api/v1/servers/{server['id']}/api-keys",
    json={"name": "test-agent"},
    headers=H,
)
assert r.status_code == 201, r.text
key = r.json()["raw_key"]
key_id = r.json()["id"]
print("raw key issued:", key[:12] + "...")

# --- list keys (raw key must NOT appear) ---
r = client.get(f"/api/v1/servers/{server['id']}/api-keys", headers=H)
assert r.status_code == 200
assert all("raw_key" not in k for k in r.json())
print("key list hides raw keys ok")

# --- ingest metric with valid key ---
payload = {
    "server_id": server["id"],
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "cpu_percent": 32.4, "memory_percent": 61.2, "memory_total": 4096000000,
    "memory_available": 1596000000, "disk_percent": 43.8, "disk_total": 100000000000,
    "disk_free": 56200000000, "network_bytes_sent": 123456789,
    "network_bytes_received": 987654321, "uptime_seconds": 123456,
}
r = client.post("/api/v1/metrics", json=payload, headers={"X-API-Key": key})
assert r.status_code == 200, r.text
body = r.json()
assert body["success"] is True
# additive hints for agents (config backup cadence)
assert body["config_sync_enabled"] is True
assert body["config_sync_interval_seconds"] >= 60
print("ingest ok ->", r.json())

# --- missing header -> 401 ---
assert client.post("/api/v1/metrics", json=payload).status_code == 401
print("missing key 401 ok")

# --- wrong key -> 401 ---
assert client.post("/api/v1/metrics", json=payload, headers={"X-API-Key": "cm-bogus"}).status_code == 401
print("bogus key 401 ok")

# --- server_id mismatch -> 403 ---
bad = dict(payload, server_id="00000000-0000-0000-0000-000000000000")
assert client.post("/api/v1/metrics", json=bad, headers={"X-API-Key": key}).status_code == 403
print("server_id mismatch 403 ok")

# --- invalid cpu -> 422 ---
bad2 = dict(payload, cpu_percent=150)
assert client.post("/api/v1/metrics", json=bad2, headers={"X-API-Key": key}).status_code == 422
print("invalid payload 422 ok")

# --- server now online + last_seen_at set ---
r = client.get(f"/api/v1/servers/{server['id']}", headers=H)
assert r.status_code == 200
assert r.json()["status"] == "online", r.json()
assert r.json()["last_seen_at"] is not None
print("server status after ingest:", r.json()["status"])

# --- metrics query endpoint returns the sample ---
r = client.get(f"/api/v1/metrics/servers/{server['id']}?minutes=60", headers=H)
assert r.status_code == 200, r.text
assert len(r.json()) >= 1
print("metrics query ok:", len(r.json()), "samples")

# --- revoke key -> subsequent ingest 401 ---
assert client.delete(f"/api/v1/api-keys/{key_id}", headers=H).status_code == 204
resp = client.post("/api/v1/metrics", json=payload, headers={"X-API-Key": key})
print("post-revoke status:", resp.status_code)
assert resp.status_code == 401, resp.text
print("revoked key 401 ok")

print("ALL METRICS TESTS PASSED")