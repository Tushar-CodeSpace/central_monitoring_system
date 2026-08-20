"""Structured (JSON) logging setup for the backend.

Emits one JSON object per line to stdout and a rotating file under LOG_DIR.
"""

import json
import logging
import logging.handlers
import sys
from datetime import datetime, timezone
from pathlib import Path


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        for key, value in getattr(record, "extra_fields", {}).items():
            payload[key] = value
        return json.dumps(payload, default=str)


def setup_logging(level: str = "INFO", log_dir: str = "logs") -> None:
    """Configure root logger: JSON to stdout + rotating file handler."""
    root = logging.getLogger()
    root.setLevel(level.upper())
    for handler in list(root.handlers):
        root.removeHandler(handler)

    stdout = logging.StreamHandler(sys.stdout)
    stdout.setFormatter(JsonFormatter())
    root.addHandler(stdout)

    if log_dir:
        directory = Path(log_dir)
        directory.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            directory / "backend.log", maxBytes=5_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setFormatter(JsonFormatter())
        root.addHandler(file_handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)