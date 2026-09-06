# Deployment Guide

**Project:** SurakshaPath AI  
**Tagline:** Surakshit Raasta, Smart Faisla  
**Hackathon:** BGI Hackathon 2026

## Overview

This guide covers realistic deployment for the backend, frontend, and database layers. The stack is intentionally simple and production-friendly:

- Backend: FastAPI + Python
- Frontend: React + Vite + Tailwind
- Database: MySQL only
- Maps: OpenStreetMap only
- ML: Random Forest only

---

## Backend Deployment

### Recommended Platforms

- Railway
- Render

### Deployment Steps

1. Push the repository to GitHub.
2. In Render, choose **New Blueprint** and select the repository. Keep the root directory at the repository root because `render.yaml` uses `backend/...` paths.
3. Add the environment variables marked `sync: false` in Render.
4. Connect the backend to a production MySQL-compatible database.

### Environment Variables

Use values matching your production MySQL instance:

```env
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SSL=true
JWT_SECRET=
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24
CORS_ORIGINS=https://your-frontend.vercel.app
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=
SMTP_PASSWORD=
```

### Production Start Command

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### Notes

- Use a managed MySQL instance for production.
- Ensure the backend service can reach the database over the network.
- Keep the `.env` values private and never commit real credentials.
- The backend initializes tables through SQLAlchemy metadata on startup.

---

## Frontend Deployment

### Recommended Platform

- Vercel

### Deployment Steps

1. Create a new Vercel project from the GitHub repository.
2. Set the root directory to `frontend`.
3. Use `npm run build` as the build command and `dist` as the output directory.
4. Set `VITE_API_BASE_URL` to the public Render backend URL, for example `https://surakshapath-api.onrender.com`.
5. Redeploy after setting the environment variable. `frontend/vercel.json` preserves React routes such as `/auth` on refresh.

### Build Settings

```bash
npm install
npm run build
```

### API Base URL Configuration

If the frontend uses environment-based configuration, set the production API URL in Vercel environment variables.

Example:

```env
VITE_API_BASE_URL=https://your-backend-domain.com
```

### Notes

- Make sure the frontend points to the deployed backend, not localhost.
- Set Render `CORS_ORIGINS` to the exact Vercel URL without a trailing slash. Multiple origins can be comma-separated.

---

## Database

### MySQL Production Configuration

Use one of the following production options:

- Managed MySQL on Railway
- Managed MySQL on Render
- Cloud-hosted MySQL service

### Minimum Configuration

- Host
- Port 3306 or provider-specific port
- Username
- Password
- Database name

### Operational Notes

- MySQL is the only database used in SurakshaPath AI.
- Create regular backups.
- Use SSL/TLS if your provider supports it.
- Run schema migrations before public launch.

---

## Post-Deployment Checklist

- Backend health endpoint returns success.
- `/predict` returns a valid route safety response.
- `/admin/dashboard` returns analytics data.
- `/ws/sos` accepts WebSocket connections.
- Frontend loads the deployed backend API correctly.
- Route search, incident reporting, and demo simulation work end to end.
