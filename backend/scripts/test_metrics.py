"""Smoke test for agent auth + metrics ingestion (run: uv run python scripts/test_metrics.py)."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app.main import app
from app.database import models as db

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
# additive hints for agents (agent runtime config)
assert body["config_sync_enabled"] is True
assert 0 <= body["config_sync_hour"] <= 23
assert isinstance(body["monitored_services"], list)
assert isinstance(body["config_collections"], list)
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

# --- raw path: newest samples first-window, chronological output ---
raw = r.json()
assert all(
    raw[i]["recorded_at"] <= raw[i + 1]["recorded_at"] for i in range(len(raw) - 1)
), "not chronological"
print("chronological order ok")

# --- downsampled path: isolated temp server + 24h synthetic dataset ---
stale = next(
    (s for s in client.get("/api/v1/servers", headers=H).json()
     if s["hostname"] == "metrics-agg-test"),
    None,
)
if stale:
    client.delete(f"/api/v1/servers/{stale['id']}", headers=H)

r = client.post(
    "/api/v1/servers",
    json={"site_id": server["site_id"], "name": "metrics-agg-test", "hostname": "metrics-agg-test"},
    headers=H,
)
assert r.status_code == 201, r.text
tmp_server = r.json()
sid_oid = db.servers().find_one({"hostname": tmp_server["hostname"]})["_id"]
sid_str = tmp_server["id"]

db.metrics().delete_many({"server_id": sid_oid, "test_marker": "agg"})
base = datetime.now(timezone.utc) - timedelta(minutes=1440)
synth = []
for i in range(1440):  # 1440 samples @60s → full 24h
    ts = base + timedelta(seconds=60 * i)
    synth.append({
        "_id": f"agg-{i}",
        "server_id": sid_oid,
        "timestamp": ts,
        "recorded_at": ts,
        "cpu_percent": round(10.0 + i * 0.01, 2),   # 10 .. 24.39
        "memory_percent": 40.0,
        "memory_total": 8e9,
        "memory_available": 4e9,
        "disk_percent": 30.0,
        "disk_total": 1e11,
        "disk_free": 7e10,
        "network_bytes_sent": float(i),
        "network_bytes_received": float(i) * 2,
        "uptime_seconds": float(3600 + i),
        "test_marker": "agg",
    })
db.metrics().insert_many(synth)

r = client.get(f"/api/v1/metrics/servers/{sid_str}?minutes=1440", headers=H)
assert r.status_code == 200, r.text
buckets = r.json()
# 24h / 120s buckets → ~720 buckets (± boundary effects)
assert 700 <= len(buckets) <= 725, len(buckets)
cpus = [b["cpu_percent"] for b in buckets]
assert min(cpus) >= 10.0 - 0.01 and max(cpus) <= 24.40

# exact average of the FIRST returned bucket — derive membership from the
# bucket key embedded in the response id ("{sid}-{epoch_ms}")
bucket_key = int(buckets[0]["id"].rsplit("-", 1)[1])
members = []
for s in synth:
    s_ms = int(s["recorded_at"].timestamp() * 1000)
    if s_ms - (s_ms % 120_000) == bucket_key:
        members.append(s)
assert len(members) >= 1, (bucket_key, len(members))
expected_avg = sum(s["cpu_percent"] for s in members) / len(members)
assert abs(buckets[0]["cpu_percent"] - expected_avg) <= 0.01, (
    buckets[0]["cpu_percent"], expected_avg, len(members)
)

# network counter = LAST value inside each bucket
last_member = max(members, key=lambda s: s["recorded_at"])
assert buckets[0]["network_bytes_sent"] == float(last_member["network_bytes_sent"])

assert all(
    buckets[i]["recorded_at"] <= buckets[i + 1]["recorded_at"]
    for i in range(len(buckets) - 1)
), "aggregated not chronological"
print(f"downsampling ok: {len(buckets)} buckets from 1440 samples "
      f"(first-bucket avg verified: {buckets[0]['cpu_percent']} vs {round(expected_avg, 3)})")

# cleanup synthetic docs + temp server (cascade removes its metrics)
db.metrics().delete_many({"server_id": sid_oid})
client.delete(f"/api/v1/servers/{sid_str}", headers=H)

# --- revoke key -> subsequent ingest 401 ---
assert client.delete(f"/api/v1/api-keys/{key_id}", headers=H).status_code == 204
resp = client.post("/api/v1/metrics", json=payload, headers={"X-API-Key": key})
print("post-revoke status:", resp.status_code)
assert resp.status_code == 401, resp.text
print("revoked key 401 ok")

print("ALL METRICS TESTS PASSED")