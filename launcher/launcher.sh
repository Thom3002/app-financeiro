#!/bin/bash
# App Financeiro Launcher
# Usage: ./launcher.sh [start|stop|open|status]

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

case "$1" in
  start)
    echo "🚀 Iniciando App Financeiro..."
    cd "$PROJECT_DIR" && docker compose up -d --build
    echo "✅ App iniciado! Acesse: http://localhost:5173"
    ;;
  stop)
    echo "⏹ Parando App Financeiro..."
    cd "$PROJECT_DIR" && docker compose down
    echo "✅ App parado."
    ;;
  open)
    open "http://localhost:5173"
    ;;
  status)
    cd "$PROJECT_DIR" && docker compose ps
    ;;
  *)
    echo "Uso: $0 {start|stop|open|status}"
    exit 1
    ;;
esac
