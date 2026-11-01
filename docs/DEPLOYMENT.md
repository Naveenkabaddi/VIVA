# Deployment Guide

This guide describes a production deployment of the FastAPI backend and the
React frontend. Commands are shown for Linux because that is the common target;
the same steps work on Windows with the equivalent PowerShell commands.

## 1. Recommended topology

```text
Internet
  |
  v
Nginx / managed load balancer (HTTPS, static files, /api proxy)
  |                                   |
  v                                   v
frontend/dist                    FastAPI (uvicorn workers)
                                      |
                    +-----------------+------------------+
                    |                                    |
                    v                                    v
             PostgreSQL                         Persistent storage
             (users, sessions,                  (uploads + vector indexes)
              evaluations, ...)
                                      |
                                      v
                              Google Gemini (optional)
```

For a single small deployment, Nginx, one or two API workers and PostgreSQL on
one host are sufficient. Keep uploads and vector indexes on a persistent volume
or object-backed filesystem; do not deploy them inside an ephemeral container
layer.

## 2. Production environment

Create `/srv/viva/.env` (never commit it):

```dotenv
ENVIRONMENT=production
SECRET_KEY=<long random value>
ACCESS_TOKEN_EXPIRE_MINUTES=10080

DATABASE_URL=postgresql+psycopg://viva:STRONG_PASSWORD@127.0.0.1:5432/viva
AUTO_MIGRATE=false

CORS_ORIGINS=https://viva.example.com

GEMINI_API_KEY=<optional>
GEMINI_MODEL=gemini-2.5-flash
LLM_TIMEOUT_SECONDS=45

EMBEDDING_BACKEND=auto
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

UPLOAD_DIR=/var/lib/viva/uploads
VECTOR_DIR=/var/lib/viva/vectors
MAX_UPLOAD_MB=20

RATE_LIMIT_PER_MINUTE=120
```

Generate a secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Checklist:

- Use a real PostgreSQL password and restrict network access to the database.
- Set `CORS_ORIGINS` to the exact public frontend origin(s), not `*`.
- Set `AUTO_MIGRATE=false` when running more than one API worker and apply
  migrations as a separate step (see section 5). This avoids concurrent startup
  migration attempts.
- Keep `SECRET_KEY` stable across workers and restarts; rotating it invalidates
  all existing tokens.
- Use absolute paths for `UPLOAD_DIR` and `VECTOR_DIR` in production.
- Do not expose the storage directories through the web server.

## 3. PostgreSQL

Create a database and user:

```sql
CREATE USER viva WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE viva OWNER viva;
```

`psycopg` is pinned in `backend/requirements.txt`. The schema uses portable
SQLAlchemy types; the same migration runs on SQLite and PostgreSQL.

Back up before schema changes:

```bash
pg_dump --format=custom --file=/backups/viva-$(date +%F).dump "$DATABASE_URL"
```

Restore:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" /backups/viva-2026-10-31.dump
```

## 4. Backend installation

```bash
sudo mkdir -p /srv/viva /var/lib/viva/uploads /var/lib/viva/vectors
sudo chown -R viva:viva /srv/viva /var/lib/viva

cd /srv/viva
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

# Optional: better embeddings, vector search, local speech
# pip install sentence-transformers faiss-cpu faster-whisper gTTS
```

Run migrations from the backend directory:

```bash
cd /srv/viva/backend
PYTHONPATH=. ../.venv/bin/alembic upgrade head
PYTHONPATH=. ../.venv/bin/alembic current
PYTHONPATH=. ../.venv/bin/alembic check
```

`alembic check` should report no new upgrade operations.

Start the API manually once to validate configuration:

```bash
cd /srv/viva/backend
PYTHONPATH=. ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then verify:

```bash
curl -fsS http://127.0.0.1:8000/api/health | python -m json.tool
```

The health response reports the active LLM mode, embedding backend, voice
providers, scoring weights and whether the weights sum to 1.0.

## 5. Migrations during deployment

Use a controlled migration step rather than relying on application startup:

1. Put the application in maintenance mode or drain traffic.
2. Back up PostgreSQL and the storage directories.
3. Install the new release.
4. Run `alembic upgrade head` from `backend/` with the production `.env`.
5. Start or restart the API with `AUTO_MIGRATE=false`.
6. Run the health check and a smoke request.
7. Restore traffic.

For SQLite deployments, stop the API before migrating. SQLite is appropriate for
local/single-user use; use PostgreSQL for concurrent production traffic.

## 6. Process supervision (systemd)

```ini
# /etc/systemd/system/viva-api.service
[Unit]
Description=VivaForge API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=viva
Group=viva
WorkingDirectory=/srv/viva/backend
Environment=PATH=/srv/viva/.venv/bin
EnvironmentFile=/srv/viva/.env
Environment=PYTHONPATH=/srv/viva/backend
ExecStart=/srv/viva/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/viva
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now viva-api
sudo systemctl status viva-api
sudo journalctl -u viva-api -f
```

Notes:

- `--proxy-headers` trusts forwarded headers only from the listed proxy address.
- The in-memory rate limiter is per worker. Two workers allow roughly twice the
  configured request rate across the process pool. For strict global limits,
  replace it with a Redis-backed limiter or enforce limits at the proxy.
- With `AUTO_MIGRATE=false`, no worker attempts schema changes at startup.
- Running multiple workers with SQLite is not recommended; use PostgreSQL.

## 7. Frontend build

On a build machine or in CI:

```bash
cd frontend
npm ci
npm run lint
npm run build
```

The static output is `frontend/dist/`. If the API is served from a different
origin, set `VITE_API_URL` before building:

```bash
VITE_API_URL=https://api.example.com/api npm run build
```

If Nginx proxies `/api` on the same origin, leave `VITE_API_URL=/api` (default).

Copy the build to the web root:

```bash
sudo rsync -a --delete frontend/dist/ /var/www/viva/
```

## 8. Nginx

```nginx
server {
    listen 80;
    server_name viva.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name viva.example.com;

    ssl_certificate     /etc/letsencrypt/live/viva.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/viva.example.com/privkey.pem;

    root /var/www/viva;
    index index.html;

    # Report uploads (keep above MAX_UPLOAD_MB)
    client_max_body_size 25m;

    # Security headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache hashed assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
}
```

Use `certbot` or your platform's certificate manager for TLS. Keep the API bound
to loopback so it is only reachable through the proxy.

If you run the frontend on a separate origin, add that exact origin to
`CORS_ORIGINS` and set `VITE_API_URL` accordingly.

## 9. Storage, backups and retention

Persist and back up:

- PostgreSQL database (all structured data).
- `UPLOAD_DIR` (original reports).
- `VECTOR_DIR` (project index files; rebuildable but expensive).

Example backup job:

```bash
pg_dump --format=custom --file=/backups/viva-$(date +%F).dump "$DATABASE_URL"
tar -C /var/lib/viva -czf /backups/viva-storage-$(date +%F).tar.gz uploads vectors
```

Restore order: database first, then storage, then restart the API. Vector indexes
can be regenerated from `document_chunks.embedding` if lost.

Account deletion removes the user's database rows and stored files/vector
indexes. Backups and external log systems may retain historical copies according
to your retention policy; document that policy for users.

## 10. Security hardening

- Serve only over HTTPS; set HSTS at the proxy if appropriate.
- Keep `SECRET_KEY` and `GEMINI_API_KEY` in a secret manager or root-readable
  environment file, never in source control.
- Restrict PostgreSQL to the application host.
- Set `CORS_ORIGINS` explicitly and review it when domains change.
- Keep dependencies patched and re-run the test suite after upgrades.
- Run the API as an unprivileged user with a read-only system where possible
  (the sample unit allows writes only under `/var/lib/viva`).
- Enforce request size limits at both Nginx and the application.
- Monitor `429` responses and `viva.security` log entries.
- Do not log request bodies, tokens, passwords or API keys. The application logs
  paths and status codes only.
- Configure log rotation or ship logs to a central system.

## 11. Scaling notes

- **API:** increase uvicorn workers or run multiple instances behind the proxy.
  Use PostgreSQL, not SQLite.
- **Rate limiting:** replace the in-memory limiter with a shared store for a
  global limit.
- **Document processing:** FastAPI background tasks run inside the API process.
  Move processing to Celery/RQ or a managed queue for large files or many
  concurrent uploads, and poll status as the UI already does.
- **Vector search:** FAISS is in-process; for very large corpora use a dedicated
  vector database and adapt `vector_store.py`.
- **LLM:** Gemini calls can be slow. Keep proxy timeouts at 120 seconds or more,
  set `LLM_TIMEOUT_SECONDS` deliberately, and monitor fallback rates. The offline
  engine keeps the product usable during provider outages.
- **Storage:** use a shared filesystem or object storage if multiple API hosts
  must read the same uploads and vector indexes.

## 12. Health checks and monitoring

- Liveness/readiness: `GET /api/health` on the API, `GET /` on the frontend.
- Watch for sustained `5xx`, `429`, document `failed` statuses, and report
  generation errors in logs.
- The health payload exposes `llm.enabled`, `embeddings.backend`,
  `voice.*.provider` and `weights_valid`; alert if `weights_valid` is false.
- Add external uptime checks against the public HTTPS endpoints.

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Startup fails with migration errors | Database unreachable or migrations already applied by a conflicting process | Check `DATABASE_URL`, run `alembic current`/`upgrade head` manually, keep `AUTO_MIGRATE=false` with multiple workers. |
| 401 on every request | Missing/expired token, changed `SECRET_KEY`, proxy strips `Authorization` | Log in again, verify the key is stable, check proxy header forwarding. |
| CORS error in browser | Frontend origin not in `CORS_ORIGINS` | Add the exact scheme/host/port and restart the API. |
| Upload returns 413 | Nginx or `MAX_UPLOAD_MB` limit | Raise both limits consistently. |
| Document stuck in `pending` | Background task process died or was restarted | Re-upload or call `/documents/{id}/reprocess`. |
| `alembic check` reports drift | Models changed without a migration | Generate and review a revision, test upgrade/downgrade, then deploy. |
| Gemini features silently fall back | Invalid key, quota, timeout, or invalid JSON | Check logs and `/api/ai/status`; the offline engine remains active by design. |
| Voice transcription returns 422 | No server STT provider and unsupported audio | Install `faster-whisper` or configure Gemini audio; otherwise use browser speech input. |

## 14. Release verification

Before exposing a release:

```bash
cd backend
PYTHONPATH=. ../.venv/bin/python -m pytest tests -q --tb=short

cd ../frontend
npm ci
npm run lint
npm run build
```

Then verify against the deployed environment:

1. `GET /api/health` returns `status: ok` and `weights_valid: true`.
2. Register, log in and load the dashboard.
3. Create a project, upload a report and confirm `ready` status.
4. Start a mock viva, submit an answer, finish and open the report.
5. Load analytics and generate recommendations.
6. Confirm account deletion removes the user's data (use a disposable account).
