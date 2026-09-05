# Final Project Checklist

**Project:** SurakshaPath AI  
**Tagline:** Surakshit Raasta, Smart Faisla  
**Hackathon:** BGI Hackathon 2026

## Release Checklist

| Item | Status | Notes |
|---|---|---|
| Backend running | ☐ | FastAPI server starts successfully |
| Frontend running | ☐ | Vite dev server or production build works |
| MySQL connected | ☐ | Database credentials loaded from `backend/.env` |
| Models loaded | ☐ | Random Forest models available on startup |
| Demo simulation working | ☐ | Demo flow triggers route, alerts, and reroute |
| Admin dashboard working | ☐ | Analytics and heatmap data visible |
| Incident reporting working | ☐ | Incident form saves data and updates feed |

## Quick Verification

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Functional Checks

- [ ] `/predict` returns a safety score and explanation
- [ ] `/incidents/report` stores a new incident
- [ ] `/admin/dashboard` returns analytics data
- [ ] `Demo Simulation` runs from the home page
- [ ] Live navigation updates ETA, progress, and alerts
- [ ] WebSocket SOS stream connects successfully

## Presentation Readiness

- [ ] Project banner is visible on GitHub
- [ ] README includes setup instructions and demo flow
- [ ] Screenshots are added to `docs/screenshots/`
- [ ] Deployment guide is included
- [ ] Judge demo script is ready

## Final Sign-Off

Once every box is checked, the repository is ready for submission and judge review.
