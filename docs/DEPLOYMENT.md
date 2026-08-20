# Deployment Guide (Ubuntu VPS)

Target layout: everything runs in Docker Compose under `/opt/monitoring`.
nginx inside the `frontend` container serves the SPA and proxies `/api` to
the backend. A host-level nginx terminates TLS with Let's Encrypt.

## 1. Prerequisites

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"          # log out/in afterwards
```

## 2. Install the project

```bash
sudo mkdir -p /opt/monitoring
sudo chown -R "$USER":"$USER" /opt/monitoring
# Copy the repository (rsync/scp/git clone — the .env files are NOT committed)
rsync -av --exclude '.env' --exclude 'backend/.env' --exclude 'agent/.env' \
      --exclude 'node_modules' --exclude '.venv' ./ /opt/monitoring/
```

## 3. Environment

```bash
cd /opt/monitoring
cp .env.example .env
# set strong MONGO_INITDB_ROOT_PASSWORD, MONGO_APP_PASSWORD, JWT_SECRET, DOMAIN
cp agent/.env.example agent/.env        # fill SERVER_ID/API_KEY after onboarding
```

Then start MongoDB first so the init scripts + seed run once:

```bash
docker compose up -d mongodb
docker compose exec mongodb mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval "db.adminCommand('ping').ok"
uv run --project backend scripts/seed.py   # optional demo data; or onboard via API
```

## 4. Bring up the stack

```bash
docker compose up -d --build          # backend on 127.0.0.1:8000, frontend on 8080
docker compose ps
```

Verify from the VPS:

```bash
curl -s http://127.0.0.1:8080/api/v1/health
```

## 5. TLS with Let's Encrypt

```bash
sudo cp nginx/central-monitoring.conf /etc/nginx/sites-available/central-monitoring
sudo sed -i 's/monitoring.example.com/YOUR_DOMAIN/g' \
  /etc/nginx/sites-available/central-monitoring
sudo ln -s /etc/nginx/sites-available/central-monitoring /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN     # issues cert + wires 443 redirect
```

Renew automatically: `certbot renew` runs via systemd timer by default.

## 6. Onboarding a new site/server + agent

1. Create the site: `POST /api/v1/sites` `{client, code, location, status}`.
2. Create the server: `POST /api/v1/servers` `{site_id, name, hostname, ip_address}` → note `server_id`.
3. Issue an agent key: `POST /api/v1/servers/{server_id}/api-keys` → **raw key shown once**.
4. On the target server (or via the agent image):
   ```bash
   cd /opt/monitoring && cp agent/.env.example agent/.env
   # SERVER_ID=…, API_URL=https://YOUR_DOMAIN/api/v1, API_KEY=…
   uv run --project agent agent/app.py      # standalone
   # or containerized: add a second `agent` service in compose with its own env_file
   ```

## 7. Operations

| Task                     | Command                                                |
| ------------------------ | ------------------------------------------------------ |
| Logs (JSON)              | `docker compose logs -f backend` / `tail -f logs/backend.log` |
| Restart backend          | `docker compose restart backend`                       |
| Update                   | `git pull && docker compose up -d --build`             |
| Backup Mongo             | `docker compose exec -T mongodb mongosh ...` or `mongodump` |
| Manual retention sweep   | `uv run --project backend scripts/cleanup.py`          |

## Security notes

- Mongo binds to `127.0.0.1` only (never expose 27017).
- Dashboard sessions: bcrypt password hashes, short-lived JWTs.
- Agent keys: SHA-256 hashes only; revoke via `DELETE /api/v1/api-keys/{id}`.
- Keep `JWT_SECRET` and all `.env` values out of the repository.
- Use a reverse proxy with TLS in front (this repo's `nginx/` template).
