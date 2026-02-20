#!/bin/bash
# LINE message sender
# Sends a message to LINE via Matrix bridge on a remote VPS
#
# Usage:
#   line-send.sh --room-name "Name" --message "Hello"
#   line-send.sh <roomId> <message>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

: "${LINE_RELAY_HOST:?LINE_RELAY_HOST is not set. Configure it in .env}"
: "${LINE_RELAY_SCRIPT:?LINE_RELAY_SCRIPT is not set. Configure it in .env}"

SSH_OPTS="-o ConnectTimeout=15 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no"
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi
MAX_RETRIES=2

attempt=0
while [ $attempt -le $MAX_RETRIES ]; do
  if output=$(ssh $SSH_OPTS "$LINE_RELAY_HOST" "node $LINE_RELAY_SCRIPT $*" 2>&1); then
    echo "$output"
    exit 0
  else
    exit_code=$?
    if [ $exit_code -eq 255 ] && [ $attempt -lt $MAX_RETRIES ]; then
      # SSH connection failed, retry after wait
      attempt=$((attempt + 1))
      echo "SSH connection failed, retrying ($attempt/$MAX_RETRIES)..." >&2
      sleep 10
    else
      echo "$output" >&2
      exit $exit_code
    fi
  fi
done
