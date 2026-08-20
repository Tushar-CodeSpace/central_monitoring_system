"""Smoke test for sites/servers CRUD (run: uv run python scripts/test_crud.py)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# --- login ---
r = client.post(
    "/api/v1/auth/login",
    json={"email": "admin@monitoring.com", "password": "admin123"},
)
assert r.status_code == 200, r.text
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

# --- unauthenticated -> 401 ---
assert client.get("/api/v1/sites").status_code == 401
assert client.get("/api/v1/servers").status_code == 401
print("401 without token ok")

# --- create site ---
r = client.post(
    "/api/v1/sites",
    json={"client": "samsonite", "code": "samsonite_kolkata_conveyor_01", "location": "Kolkata", "status": "active"},
    headers=H,
)
assert r.status_code == 201, r.text
site = r.json()
print("created site:", site["code"], site["id"])

# --- duplicate code -> 409 ---
r = client.post(
    "/api/v1/sites",
    json={"client": "samsonite", "code": "samsonite_kolkata_conveyor_01", "location": "Kolkata", "status": "active"},
    headers=H,
)
assert r.status_code == 409, r.status_code
print("duplicate code 409 ok")

# --- list sites ---
r = client.get("/api/v1/sites", headers=H)
assert r.status_code == 200
codes = {s["code"] for s in r.json()}
assert "samsonite_nashik_conveyor_01" in codes and "meesho_faridhabad" in codes
print("list sites ok:", len(codes), "sites")

# --- get + patch site ---
r = client.patch(f"/api/v1/sites/{site['id']}", json={"location": "Kolkata, WB"}, headers=H)
assert r.status_code == 200 and r.json()["location"] == "Kolkata, WB"
print("patch site ok")

# --- create server under seed site (meesho_faridhabad) ---
r = client.get("/api/v1/sites", headers=H)
meesho = next(s for s in r.json() if s["code"] == "meesho_faridhabad")
r = client.post(
    "/api/v1/servers",
    json={"site_id": meesho["id"], "name": "Faridhabad Server 01", "hostname": "meesho-fbd-01", "ip_address": "10.0.2.20"},
    headers=H,
)
assert r.status_code == 201, r.text
server = r.json()
print("created server:", server["hostname"], server["id"])

# --- duplicate hostname -> 409 ---
r = client.post(
    "/api/v1/servers",
    json={"site_id": meesho["id"], "name": "Dup", "hostname": "meesho-fbd-01"},
    headers=H,
)
assert r.status_code == 409, r.status_code
print("duplicate hostname 409 ok")

# --- list servers filtered by site ---
r = client.get(f"/api/v1/servers?site_id={meesho['id']}", headers=H)
assert r.status_code == 200 and all(s["site_id"] == meesho["id"] for s in r.json())
print("filter by site ok")

# --- patch server (move to new site) ---
r = client.patch(f"/api/v1/servers/{server['id']}", json={"site_id": site["id"]}, headers=H)
assert r.status_code == 200 and r.json()["site_id"] == site["id"]
print("patch server ok")

# --- get 404s ---
assert client.get("/api/v1/sites/000000000000000000000000", headers=H).status_code == 404
assert client.get("/api/v1/servers/000000000000000000000000", headers=H).status_code == 404
print("404 ok")

# --- delete site with server -> 409; delete server; delete site -> 204 ---
assert client.delete(f"/api/v1/sites/{site['id']}", headers=H).status_code == 409
assert client.delete(f"/api/v1/servers/{server['id']}", headers=H).status_code == 204
assert client.delete(f"/api/v1/sites/{site['id']}", headers=H).status_code == 204
assert client.get(f"/api/v1/sites/{site['id']}", headers=H).status_code == 404
print("delete cascade + guards ok")

print("ALL CRUD TESTS PASSED")