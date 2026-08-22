"""CI init: prepare a fresh MongoDB for the smoke-test scripts.

Equivalent to docker-entrypoint-initdb.d, but runs as a normal step so no
workspace paths need mounting into the service container (root-owned dirs
from service mounts break later checkouts with EACCES).

Creates collections/indexes via the backend's own ensure_indexes().
Run: MONGO_URL=mongodb://... python scripts/init_ci_mongo.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.indexes import ensure_indexes

if __name__ == "__main__":
    ensure_indexes()
    print("collections + indexes ready")
