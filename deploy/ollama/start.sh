#!/bin/sh
set -eu

export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
MODEL="${OLLAMA_MODEL:-jaahas/qwen3.5-uncensored:2b-q6_K}"
KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:--1}"
KEEP_WARM_INTERVAL="${OLLAMA_KEEP_WARM_INTERVAL:-90}"
READY_FILE="/tmp/ollama-ready"

# Ollama CLI expects keepalive as a duration (for example 30s, 5m).
# Normalize common values so startup warmup does not fail.
if [ "${KEEP_ALIVE}" = "-1" ]; then
	KEEP_ALIVE="2562047h47m16.854775807s"
elif echo "${KEEP_ALIVE}" | grep -Eq '^-?[0-9]+$'; then
	KEEP_ALIVE="${KEEP_ALIVE}s"
fi

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
until ollama run "${MODEL}" warmup --keepalive "${KEEP_ALIVE}" >/dev/null 2>&1; do
	echo "Warmup failed, retrying in 5s..."
	sleep 5
done

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
