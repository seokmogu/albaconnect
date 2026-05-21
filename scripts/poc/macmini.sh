#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
COMPOSE_FILE="$ROOT_DIR/docker-compose.poc.yml"
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.poc"}
EXAMPLE_ENV_FILE="$ROOT_DIR/.env.poc.example"

log() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

usage() {
  cat <<'USAGE'
Usage: sh scripts/poc/macmini.sh <command> [options]

Commands:
  setup [--host HOST] [--force]   Create .env.poc for the Mac mini LAN host
  doctor                          Validate Docker, env, compose, and port settings
  up                              Build and start the internal POC stack
  down                            Stop the stack
  restart                         Restart the stack
  ps                              Show compose service status
  logs [service]                  Follow logs, optionally for api/web/db/redis
  health                          Check API and web health URLs
  backup [file]                   Dump the POC database to backups/
  restore <file>                  Restore a SQL dump into the POC database
  reset-data                      Stop the stack and delete POC volumes

Environment:
  ENV_FILE=/path/to/.env.poc      Override the env file path
  POC_HOST=macmini.local          Host used by setup when --host is omitted
  ALLOW_LOCALHOST=true            Permit localhost URLs during doctor
  ALLOW_INSECURE_POC=true         Permit template/default POC secrets during doctor
USAGE
}

detect_host() {
  if [ "${POC_HOST:-}" ]; then
    printf '%s\n' "$POC_HOST"
    return
  fi

  if has_cmd scutil; then
    local_name=$(scutil --get LocalHostName 2>/dev/null || true)
    if [ "$local_name" ]; then
      printf '%s.local\n' "$local_name"
      return
    fi
  fi

  host_name=$(hostname 2>/dev/null || true)
  if [ "$host_name" ]; then
    printf '%s\n' "$host_name"
    return
  fi

  printf '%s\n' "macmini.local"
}

rand_hex() {
  bytes=$1
  if has_cmd openssl; then
    openssl rand -hex "$bytes"
    return
  fi
  if has_cmd uuidgen; then
    uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]'
    return
  fi
  printf 'change-this-generated-secret-%s\n' "$(date +%s)"
}

load_env() {
  [ -f "$ENV_FILE" ] || fail "Missing $ENV_FILE. Run: pnpm poc:setup"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

check_secret() {
  name=$1
  value=$2
  min_length=$3

  [ "$value" ] || fail "$name is required in $ENV_FILE"
  case "$value" in
    change-this*|postgres|poc-webhook-secret)
      fail "$name still uses a template value. Run: pnpm poc:setup -- --force"
      ;;
  esac

  if [ "${#value}" -lt "$min_length" ]; then
    fail "$name must be at least $min_length characters"
  fi
}

cmd_setup() {
  host=""
  force=false

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --)
        ;;
      --host)
        shift
        [ "$#" -gt 0 ] || fail "--host requires a value"
        host=$1
        ;;
      --force)
        force=true
        ;;
      *)
        fail "Unknown setup option: $1"
        ;;
    esac
    shift
  done

  [ -f "$EXAMPLE_ENV_FILE" ] || fail "Missing $EXAMPLE_ENV_FILE"
  if [ -f "$ENV_FILE" ] && [ "$force" != "true" ]; then
    log "$ENV_FILE already exists. Use --force to regenerate it."
    return
  fi

  host=${host:-$(detect_host)}
  web_port=${WEB_PORT:-3000}
  api_port=${API_PORT:-3001}
  pg_password=$(rand_hex 16)
  jwt_secret=$(rand_hex 32)
  jwt_refresh_secret=$(rand_hex 32)
  admin_token=$(rand_hex 24)
  toss_webhook_secret=$(rand_hex 24)

  tmp_file="$ENV_FILE.tmp"
  awk \
    -v web_url="http://$host:$web_port" \
    -v api_url="http://$host:$api_port" \
    -v pg_password="$pg_password" \
    -v jwt_secret="$jwt_secret" \
    -v jwt_refresh_secret="$jwt_refresh_secret" \
    -v admin_token="$admin_token" \
    -v toss_webhook_secret="$toss_webhook_secret" '
      /^POC_WEB_PUBLIC_URL=/ { print "POC_WEB_PUBLIC_URL=" web_url; next }
      /^POC_API_PUBLIC_URL=/ { print "POC_API_PUBLIC_URL=" api_url; next }
      /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" pg_password; next }
      /^JWT_SECRET=/ { print "JWT_SECRET=" jwt_secret; next }
      /^JWT_REFRESH_SECRET=/ { print "JWT_REFRESH_SECRET=" jwt_refresh_secret; next }
      /^ADMIN_TOKEN=/ { print "ADMIN_TOKEN=" admin_token; next }
      /^TOSS_WEBHOOK_SECRET=/ { print "TOSS_WEBHOOK_SECRET=" toss_webhook_secret; next }
      { print }
    ' "$EXAMPLE_ENV_FILE" > "$tmp_file"

  mv "$tmp_file" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  log "Created $ENV_FILE"
  log "Web: http://$host:$web_port"
  log "API: http://$host:$api_port"
  log "Next: pnpm poc:doctor && pnpm poc:up"
}

cmd_doctor() {
  has_cmd docker || fail "Docker CLI is not installed. Install Docker Desktop, OrbStack, or Colima on the Mac mini."
  docker compose version >/dev/null || fail "Docker Compose plugin is unavailable."
  docker info >/dev/null || fail "Docker daemon is not running."

  load_env

  [ -f "$COMPOSE_FILE" ] || fail "Missing $COMPOSE_FILE"
  [ "${POC_WEB_PUBLIC_URL:-}" ] || fail "POC_WEB_PUBLIC_URL is required in $ENV_FILE"
  [ "${POC_API_PUBLIC_URL:-}" ] || fail "POC_API_PUBLIC_URL is required in $ENV_FILE"

  case "$POC_WEB_PUBLIC_URL $POC_API_PUBLIC_URL" in
    *localhost*|*127.0.0.1*)
      if [ "${ALLOW_LOCALHOST:-false}" != "true" ]; then
        fail "POC URLs contain localhost/127.0.0.1. Use the Mac mini LAN hostname or set ALLOW_LOCALHOST=true for local-only testing."
      fi
      ;;
  esac

  if [ "${POSTGRES_BIND:-127.0.0.1}" != "127.0.0.1" ]; then
    warn "POSTGRES_BIND is not 127.0.0.1; database may be reachable from the LAN."
  fi
  if [ "${REDIS_BIND:-127.0.0.1}" != "127.0.0.1" ]; then
    warn "REDIS_BIND is not 127.0.0.1; Redis may be reachable from the LAN."
  fi

  if [ "${ALLOW_INSECURE_POC:-false}" != "true" ]; then
    check_secret "POSTGRES_PASSWORD" "${POSTGRES_PASSWORD:-}" 12
    check_secret "JWT_SECRET" "${JWT_SECRET:-}" 32
    check_secret "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET:-}" 32
    check_secret "ADMIN_TOKEN" "${ADMIN_TOKEN:-}" 24
    check_secret "TOSS_WEBHOOK_SECRET" "${TOSS_WEBHOOK_SECRET:-}" 24
  fi

  for port in "${WEB_PORT:-3000}" "${API_PORT:-3001}" "${POSTGRES_PORT:-5432}" "${REDIS_PORT:-6379}"; do
    if has_cmd lsof && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      warn "Port $port already has a listener. If the POC stack is not already running, change the port in $ENV_FILE."
    fi
  done

  compose config >/dev/null
  log "Mac mini POC preflight passed."
}

cmd_up() {
  if [ ! -f "$ENV_FILE" ]; then
    cmd_setup
  fi
  cmd_doctor
  compose up -d --build
  compose ps
  log "Started. Run: pnpm poc:health"
}

cmd_down() {
  load_env
  compose down
}

cmd_restart() {
  load_env
  compose up -d --build
  compose restart
  compose ps
}

cmd_ps() {
  load_env
  compose ps
}

cmd_logs() {
  load_env
  if [ "$#" -gt 0 ]; then
    compose logs -f "$1"
  else
    compose logs -f
  fi
}

cmd_health() {
  load_env
  has_cmd curl || fail "curl is required for health checks."

  log "API: $POC_API_PUBLIC_URL/health"
  curl -fsS "$POC_API_PUBLIC_URL/health" >/dev/null
  log "API health OK"

  log "Web: $POC_WEB_PUBLIC_URL/"
  curl -fsS "$POC_WEB_PUBLIC_URL/" >/dev/null
  log "Web health OK"
}

cmd_backup() {
  load_env
  output=${1:-"$ROOT_DIR/backups/albaconnect-poc-$(date +%Y%m%d-%H%M%S).sql"}
  mkdir -p "$(dirname "$output")"
  compose exec -T db pg_dump -U postgres -d albaconnect > "$output"
  log "Backup written: $output"
}

cmd_restore() {
  load_env
  [ "$#" -gt 0 ] || fail "restore requires a SQL file path"
  input=$1
  [ -f "$input" ] || fail "Missing restore file: $input"
  compose exec -T db psql -U postgres -d albaconnect < "$input"
  log "Restore completed from: $input"
}

cmd_reset_data() {
  load_env
  compose down -v
  log "POC containers stopped and volumes removed."
}

command_name=${1:-help}
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command_name" in
  setup) cmd_setup "$@" ;;
  doctor) cmd_doctor ;;
  up) cmd_up ;;
  down) cmd_down ;;
  restart) cmd_restart ;;
  ps) cmd_ps ;;
  logs) cmd_logs "$@" ;;
  health) cmd_health ;;
  backup) cmd_backup "$@" ;;
  restore) cmd_restore "$@" ;;
  reset-data) cmd_reset_data ;;
  help|-h|--help) usage ;;
  *) usage; fail "Unknown command: $command_name" ;;
esac
