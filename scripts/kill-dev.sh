#!/usr/bin/env bash
# Stop the Mangled Agents dev server for good.
#
# `npm run dev` runs a supervisor tree: npm -> concurrently -> nodemon + vite.
# Killing only the port listeners is useless — nodemon/concurrently respawn them.
# So we kill every dev process whose working dir is THIS repo (supervisors first),
# then sweep the dev ports for any straggler.
#
# Usage: bash scripts/kill-dev.sh   (or ./scripts/kill-dev.sh after chmod +x)

set -u

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
self=$$
parent=$PPID

# Commands that make up this project's dev session.
pattern='npm run dev|concurrently|nodemon|tsx src/server|[.]bin/vite'

# Collect matching PIDs, but only ones actually running inside this repo —
# this keeps the script from touching other projects' vite/nodemon.
mapfile -t pids < <(
  for pid in $(pgrep -f "$pattern" 2>/dev/null); do
    [[ "$pid" == "$self" || "$pid" == "$parent" ]] && continue
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || continue
    [[ "$cwd" == "$repo"* ]] && echo "$pid"
  done
)

if ((${#pids[@]})); then
  echo "Stopping dev processes: ${pids[*]}"
  kill "${pids[@]}" 2>/dev/null || true
  sleep 1
  # SIGKILL anything that ignored SIGTERM.
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  done
else
  echo "No dev session found for $repo."
fi

# Final safety net: clear any listener still on the dev ports.
for port in 4173 5173 5174 5175 5176; do
  leftovers="$(lsof -ti TCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$leftovers" ]]; then
    echo "Clearing port $port: ${leftovers//$'\n'/ }"
    # shellcheck disable=SC2086
    kill -9 $leftovers 2>/dev/null || true
  fi
done

echo "Done — dev server stopped."
