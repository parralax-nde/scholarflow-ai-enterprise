#!/bin/sh
set -eu

export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:--1}"
KEEP_WARM_INTERVAL="${OLLAMA_KEEP_WARM_INTERVAL:-90}"
READY_FILE="/tmp/ollama-ready"

rm -f "${READY_FILE}"

ollama serve &
OLLAMA_PID=$!
KEEPER_PID=""

cleanup() {
  if [ -n "${KEEPER_PID}" ]; then
    kill "${KEEPER_PID}" 2>/dev/null || true
  fi
  kill "${OLLAMA_PID}" 2>/dev/null || true
}

trap cleanup INT TERM

until ollama list >/dev/null 2>&1; do
  echo "Waiting for Ollama API..."
  sleep 2
done

echo "Pulling model ${MODEL}"
ollama pull "${MODEL}"

echo "Warming model ${MODEL}"
ollama run "${MODEL}" warmup --keepalive "${KEEP_ALIVE}" >/dev/null 2>&1 || true

touch "${READY_FILE}"
echo "Ollama ready marker created at ${READY_FILE}"

# Keep model resident by periodically refreshing the keepalive timer via CLI.
(
  while :; do
    ollama run "${MODEL}" warmup --keepalive "${KEEP_ALIVE}" >/dev/null 2>&1 || true
    sleep "${KEEP_WARM_INTERVAL}"
  done
) &
KEEPER_PID=$!

wait "$OLLAMA_PID"
