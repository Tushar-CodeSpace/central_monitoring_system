FROM python:3.14-slim

WORKDIR /app

RUN pip install --no-cache-dir psutil httpx pydantic-settings pymongo

COPY agent ./agent

ENV PYTHONUNBUFFERED=1

CMD ["python", "agent/app.py"]