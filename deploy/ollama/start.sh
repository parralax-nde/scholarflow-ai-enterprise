#!/bin/sh
set -eu

export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
MODEL="${OLLAMA_MODEL:-gemma4:e2b}"

ollama serve &
OLLAMA_PID=$!

trap 'kill "$OLLAMA_PID" 2>/dev/null || true' INT TERM

until ollama list >/dev/null 2>&1; do
  echo "Waiting for Ollama API..."
  sleep 2
done

echo "Pulling model ${MODEL}"
ollama pull "${MODEL}"

wait "$OLLAMA_PID"
