"""Smoke test for WhatsApp settings + test endpoint plumbing."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app.database import models as db
from app.main import app

db.settings().delete_one({"_id": "notifications"})  # start from defaults

client = TestClient(app)

r = client.post("/api/v1/auth/login", json={"email": "admin@monitoring.com", "password": "admin123"})
H = {"Authorization": "Bearer " + r.json()["access_token"]}

# defaults
r = client.get("/api/v1/settings/whatsapp", headers=H)
assert r.status_code == 200, r.text
d = r.json()
assert d["whatsapp_enabled"] is False and d["whatsapp_api_key_set"] is False, d
assert d["whatsapp_base_url"] == "http://evolution-api:8080"
print("defaults ok:", d)

# patch enabled + recipients + key
r = client.patch(
    "/api/v1/settings/whatsapp",
    json={"whatsapp_enabled": True, "whatsapp_recipients": "919999999999",
          "whatsapp_api_key": "secret123"},
    headers=H,
)
assert r.status_code == 200 and r.json()["whatsapp_enabled"] is True, r.text
assert r.json()["whatsapp_api_key_set"] is True
assert "secret123" not in r.text, "api key leaked!"
print("patch ok; api key never returned")

# empty api_key keeps existing
r = client.patch("/api/v1/settings/whatsapp", json={"whatsapp_api_key": ""}, headers=H)
assert r.status_code == 200 and r.json()["whatsapp_api_key_set"] is True
print("empty key keeps existing")

# bad url -> 422
assert client.patch("/api/v1/settings/whatsapp", json={"whatsapp_base_url": "ftp://x"}, headers=H).status_code == 422
# unknown key -> 422
assert client.patch("/api/v1/settings/whatsapp", json={"nope": 1}, headers=H).status_code == 422
print("validation ok")

# test endpoint with no reachable gateway -> graceful per-recipient failure
r = client.post("/api/v1/settings/whatsapp/test", headers=H)
assert r.status_code == 200, r.text
res = r.json()
assert res[0]["number"] == "919999999999" and res[0]["ok"] is False
print("test endpoint graceful without gateway:", res[0]["detail"])

# disable -> notifier becomes no-op (no crash path)
assert client.patch("/api/v1/settings/whatsapp", json={"whatsapp_enabled": False}, headers=H).json()["whatsapp_enabled"] is False

# cleanup DB overrides so prod starts fresh
from app.database import models as db
db.settings().delete_one({"_id": "notifications"})
print("ALL WHATSAPP SETTINGS TESTS PASSED")
