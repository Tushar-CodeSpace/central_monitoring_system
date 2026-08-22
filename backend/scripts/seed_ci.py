"""CI seed: create the data the smoke-test scripts expect.

Idempotent - safe to run on every workflow run. Seeds:
  - admin dashboard user   admin@monitoring.com / admin123
  - a site                 client=ci, code=ci_plant
  - a server               hostname=samsonite-nashik-c1

Run: MONGO_URL=mongodb://... python scripts/seed_ci.py
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import models as db
from app.database.connection import new_id
from app.services.authentication import hash_password


def now() -> datetime:
    return datetime.now(timezone.utc)


def seed_user() -> None:
    if db.users().find_one({"email": "admin@monitoring.com"}) is None:
        db.users().insert_one(
            {
                "_id": new_id(),
                "email": "admin@monitoring.com",
                "name": "CI Admin",
                "role": "admin",
                "password_hash": hash_password("admin123"),
            }
        )
        print("seeded user admin@monitoring.com")
    else:
        print("user exists")


def seed_server() -> None:
    if db.servers().find_one({"hostname": "samsonite-nashik-c1"}) is not None:
        print("server exists")
        return

    site = db.sites().find_one({"code": "ci_plant"})
    if site is None:
        site = {
            "_id": new_id(),
            "client": "ci",
            "code": "ci_plant",
            "location": "CI",
            "status": "active",
            "created_at": now(),
            "updated_at": now(),
        }
        db.sites().insert_one(site)
        print("seeded site ci_plant")

    db.servers().insert_one(
        {
            "_id": new_id(),
            "site_id": site["_id"],
            "name": "Samsonite Nashik C1",
            "hostname": "samsonite-nashik-c1",
            "ip_address": None,
            "status": "unknown",
            "last_seen_at": None,
            "created_at": now(),
            "updated_at": now(),
        }
    )
    print("seeded server samsonite-nashik-c1")


if __name__ == "__main__":
    seed_user()
    seed_server()
    print("SEED OK")
