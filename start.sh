#!/bin/bash
# Rollout — one command to run everything.
# Backend (analysis/covers/captions/video) + frontend, then opens the app.
cd "$(dirname "$0")"

# backend
if ! curl -s -m 2 http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "starting engine (uvicorn :8000)..."
  (cd backend && ~/ear-env/bin/uvicorn server:app --host 127.0.0.1 --port 8000 >/tmp/rollout-backend.log 2>&1 &)
  sleep 2
else
  echo "engine already running"
fi

# frontend
if ! curl -s -m 2 http://localhost:5173 >/dev/null 2>&1; then
  echo "starting app (vite :5173)..."
  (npm run dev >/tmp/rollout-frontend.log 2>&1 &)
  sleep 2
else
  echo "app already running"
fi

open http://localhost:5173
echo "Rollout is up. logs: /tmp/rollout-backend.log /tmp/rollout-frontend.log"
