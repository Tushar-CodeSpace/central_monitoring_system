"""Smoke test for site-config snapshot ingestion + versioning."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app.database import models as db
from app.main import app

# clean slate
db.site_configs().delete_many({})
db.settings().delete_one({"_id": "sync"})
db.settings().delete_one({"_id": "alerts"})

client = TestClient(app)

r = client.post("/api/v1/auth/login", json={"email": "admin@monitoring.com", "password": "admin123"})
assert r.status_code == 200, r.text
H = {"Authorization": f"Bearer {r.json()['access_token']}"}

server = next(
    s for s in client.get("/api/v1/servers", headers=H).json()
    if s["hostname"] == "samsonite-nashik-c1"
)
sid = server["id"]

key = client.post(f"/api/v1/servers/{sid}/api-keys", json={"name": "cfg-e2e"}, headers=H).json()["raw_key"]
KH = {"X-API-Key": key}


def snap(content_hash, count=2):
    return {
        "database": "identity_service",
        "collection": "roles",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "count": count,
        "content_hash": content_hash,
        "documents": [{"role": "viewer"}, {"role": "operator"}][:count],
    }


# unauthenticated -> 401
assert client.post("/api/v1/configs/ingest", json=snap("h0")).status_code == 401
print("401 without key ok")

# v1 stored
r = client.post("/api/v1/configs/ingest", json=snap("hash-v0001"), headers=KH)
assert r.status_code == 200 and r.json() == {"success": True, "stored": True}, r.text
print("v1 stored")

# identical hash -> skipped (no new history doc)
r = client.post("/api/v1/configs/ingest", json=snap("hash-v0001"), headers=KH)
assert r.json()["stored"] is False and r.json()["reason"] == "unchanged"
print("duplicate skipped")

# changed hash -> new history version
r = client.post("/api/v1/configs/ingest", json=snap("hash-v0002"), headers=KH)
assert r.json()["stored"] is True

# other collection isolated from first triple
r = client.post(
    "/api/v1/configs/ingest",
    json={**snap("hash-aaaa"), "database": "bagging", "collection": "bagging_config"},
    headers=KH,
)
assert r.json()["stored"] is True
print("second collection isolated")

# latest-list endpoint (JWT): newest per pair, no documents leaked
r = client.get(f"/api/v1/configs/servers/{sid}", headers=H)
assert r.status_code == 200, r.text
metas = r.json()
assert len(metas) == 2, metas
assert all("documents" not in m for m in metas)
roles_meta = next(m for m in metas if m["collection"] == "roles")
assert roles_meta["content_hash"] == "hash-v0002"
assert roles_meta["count"] == 2
print("latest list ok:", [(m["database"], m["collection"]) for m in metas])

# history endpoint: all versions of roles, newest first, metadata only
r = client.get(
    f"/api/v1/configs/servers/{sid}/history",
    params={"database": "identity_service", "collection": "roles"},
    headers=H,
)
assert r.status_code == 200, r.text
hist = r.json()
assert [h["content_hash"] for h in hist] == ["hash-v0002", "hash-v0001"], hist
assert len(hist[0]["received_at"]) > 0 and "documents" not in hist[0]
print("history ok:", [(h["content_hash"], h["count"]) for h in hist])

# full snapshot fetch by id
r = client.get(f"/api/v1/configs/snapshots/{roles_meta['id']}", headers=H)
assert r.status_code == 200 and len(r.json()["documents"]) == 2
print("snapshot documents ok")

# unknown key rejected -> 422
bad = snap("hash-x")
r = client.post("/api/v1/configs/ingest", json={**bad, "unknown_field": 1}, headers=KH)
assert r.status_code == 422
print("unknown field 422 ok")

# cleanup: remove test data + key
db.site_configs().delete_many({"server_id": db.servers().find_one({"hostname": "samsonite-nashik-c1"})["_id"]})
kid = next(k["id"] for k in client.get(f"/api/v1/servers/{sid}/api-keys", headers=H).json() if k["name"] == "cfg-e2e")
client.delete(f"/api/v1/api-keys/{kid}", headers=H)

print("ALL CONFIGS TESTS PASSED")
