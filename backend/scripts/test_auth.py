"""Quick smoke test for the auth flow (run: uv run python scripts/test_auth.py)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

print("--- login ok ---")
r = client.post(
    "/api/v1/auth/login",
    json={"email": "admin@monitoring.com", "password": "admin123"},
)
assert r.status_code == 200, r.text
token = r.json()["access_token"]
print("token:", token[:30] + "...")

print("--- me with token ---")
r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
assert r.status_code == 200, r.text
print("me:", r.json())

print("--- me without token ---")
r = client.get("/api/v1/auth/me")
assert r.status_code == 401, r.status_code
print("401 ok")

print("--- wrong password ---")
r = client.post(
    "/api/v1/auth/login",
    json={"email": "admin@monitoring.com", "password": "wrong"},
)
assert r.status_code == 401, r.status_code
print("401 ok")

print("--- garbage token ---")
r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})
assert r.status_code == 401, r.status_code
print("401 ok")

print("ALL AUTH TESTS PASSED")