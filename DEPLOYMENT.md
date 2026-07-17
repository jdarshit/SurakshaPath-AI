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
2. Create a new backend service on Railway or Render.
3. Set the root directory to `backend`.
4. Install dependencies from `requirements.txt`.
5. Set the start command.
6. Add the required environment variables.
7. Connect the backend to a production MySQL database.

### Environment Variables

Use values matching your production MySQL instance:

```env
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
SECRET_KEY=
```

### Production Start Command

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
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
3. Use the default Vite build command.
4. Set the output directory to `dist`.
5. Configure the API base URL for the deployed backend.

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
- Update CORS settings in the backend to allow the deployed frontend domain.

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
