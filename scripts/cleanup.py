"""Manual retention cleanup (run from repo root: uv run --project backend scripts/cleanup.py).

Deletes raw metrics older than METRICS_RETENTION_DAYS and resolved alerts
older than 90 days. The background loop also runs this daily.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.services.background import cleanup_expired_data

if __name__ == "__main__":
    result = cleanup_expired_data()
    print(f"cleanup done: {result['metrics']} metrics, {result['alerts']} alerts removed")