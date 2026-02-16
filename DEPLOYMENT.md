# Deployment & Running Guide

## Prerequisites

- **Python 3.9+** with `pip`
- **Node.js 18+** with `npm`
- **Webcam** (for the tracker)

## Quick Start (Local Development)

```bash
# 1. Install Python dependencies
pip install flask opencv-python mediapipe numpy

# 2. Install Node dependencies
cd triage-dashboard
npm install

# 3. Start all three servers (each in a separate terminal)
```

### Terminal 1 — Tracker Server (port 5050)
```bash
cd Arduino-Triage
python tracker_server.py
```
Starts the MediaPipe-based body tracker with MJPEG streaming.  
The camera initializes once and stays live — clients can connect/disconnect freely.

### Terminal 2 — Node.js API Server (port 3001)
```bash
cd Arduino-Triage/triage-dashboard
node server/index.js
```
Serves the REST API, proxies tracker requests to port 5050, and serves the production build.

### Terminal 3 — Vite Dev Server (port 5173)
```bash
cd Arduino-Triage/triage-dashboard
npm run dev
```
Hot-reloading dev server. Open **http://localhost:5173** in your browser.

## Production Build

```bash
cd triage-dashboard
npm run build          # Creates dist/ folder
node server/index.js   # Serves both API and static files
```
Open **http://localhost:3001** — no Vite needed in production.

## Vercel Deployment

The project includes `vercel.json` for static deployment on Vercel:

```bash
cd triage-dashboard
npx vercel
```

> **Note:** The tracker server (`tracker_server.py`) and hardware backend require a machine with a webcam and cannot run on Vercel. For full functionality, deploy the Node.js server on a VPS or run locally.

## Architecture

```
Browser (5173 dev / 3001 prod)
    │
    ├── /api/*  ──→  Node.js API Server (3001)
    │                    │
    │                    ├── /api/tracker/*  ──→  Tracker Server (5050)
    │                    └── /api/*          ──→  Flask Hardware Backend (5000)
    │
    └── Static files (Vite dev / dist/)
```

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/tracker/feed?mode=heart\|lung` | GET | MJPEG video stream |
| `/api/tracker/status` | GET | JSON progress (visited points) |
| `/api/tracker/reset` | POST | Reset all visited points |
| `/api/tracker/health` | GET | Tracker availability check |
| `/api/status` | GET | System status |
| `/api/sensor-data` | GET | Live sensor readings |
| `/api/exam/start` | POST | Start an examination |

## Troubleshooting

| Issue | Fix |
|---|---|
| Camera won't open | Close other apps using the webcam |
| Tracker shows "Offline" | Ensure `python tracker_server.py` is running |
| API calls fail in dev | Check that `node server/index.js` is running on port 3001 |
| Models downloading slowly | First run downloads ~10MB of MediaPipe models — wait for it |
