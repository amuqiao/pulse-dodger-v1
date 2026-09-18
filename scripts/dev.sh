#!/usr/bin/env bash
# dev.sh - 管理本项目单个 Vite 开发服务。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/common.sh"

RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/dev.pid"
LOG_FILE="$RUN_DIR/dev.log"
PORT_FILE="$RUN_DIR/dev.port"
VITE_BIN="$ROOT_DIR/node_modules/vite/bin/vite.js"
VITE_CONFIG="$ROOT_DIR/vite/config.dev.mjs"
HOST="127.0.0.1"
PORT="8080"
URL="http://$HOST:$PORT/"
PORT_PID_RESULT=""

usage() {
  cat <<'EOF'
用法：
  ./scripts/dev.sh start dev
  ./scripts/dev.sh status dev
  ./scripts/dev.sh stop dev
  ./scripts/dev.sh restart dev
  ./scripts/dev.sh logs dev
  ./scripts/dev.sh -h|--help

作用域：
  只管理本项目单个 Vite dev server。

运行态文件：
  .run/dev.pid
  .run/dev.log
  .run/dev.port

保护边界：
  固定监听 127.0.0.1:8080，并使用 --strictPort。
  8080 被占用时直接失败，不自动改用 8081。
  stop 只关闭 pid 文件记录且命令形态匹配本项目 Vite 的进程。

Exit Codes:
  0  成功
  2  参数、recipe 或运行态错误
  其他非 0 由底层命令透传
EOF
}

ensure_run_dir() {
  mkdir -p "$RUN_DIR"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少依赖命令: $1" 2
}

write_port_file() {
  printf '%s\n' "$PORT" > "$PORT_FILE"
}

read_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(<"$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] || die "pid 文件内容非法: $PID_FILE" 2
  printf '%s' "$pid"
}

is_running() {
  kill -0 "$1" 2>/dev/null
}

command_for_pid() {
  ps -p "$1" -o command= 2>/dev/null || true
}

is_managed_command() {
  local command="$1"
  [[ "$command" == *"$VITE_BIN"* && "$command" == *"$VITE_CONFIG"* ]]
}

load_port_pid() {
  require_command lsof

  local output=""
  local status=0
  set +e
  output="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    PORT_PID_RESULT="${output%%$'\n'*}"
    return 0
  fi

  if [[ "$status" -eq 1 && -z "$output" ]]; then
    PORT_PID_RESULT=""
    return 0
  fi

  die "lsof 查询端口 $PORT 失败: $output" 2
}

assert_managed_pid() {
  local pid="$1"
  local command
  command="$(command_for_pid "$pid")"
  is_managed_command "$command" || die "pid $pid 不是本项目 Vite dev server: $command" 2
}

start_dev() {
  section "Dev Server"
  ensure_run_dir
  write_port_file

  local existing_pid=""
  if existing_pid="$(read_pid)"; then
    if is_running "$existing_pid"; then
      assert_managed_pid "$existing_pid"
      event "OK" "dev" "already running: $URL (pid $existing_pid)"
      event "LOG" "dev" "$LOG_FILE"
      return 0
    fi
    event "CLEAN" "dev" "removing stale pid file: $PID_FILE"
    rm -f "$PID_FILE"
  fi

  local listener
  load_port_pid
  listener="$PORT_PID_RESULT"
  [[ -z "$listener" ]] || die "port $PORT 已被 pid $listener 占用，未启动新服务" 2

  : > "$LOG_FILE"
  nohup bash -c 'cd "$1" && exec node "$2" --config "$3" --host "$4" --port "$5" --strictPort' \
    bash "$ROOT_DIR" "$VITE_BIN" "$VITE_CONFIG" "$HOST" "$PORT" > "$LOG_FILE" 2>&1 < /dev/null &
  printf '%s' "$!" > "$PID_FILE"

  local pid
  local stable_checks=0
  pid="$(read_pid)"
  for _ in {1..30}; do
    if ! is_running "$pid"; then
      event "FAIL" "dev" "process exited during startup"
      rm -f "$PID_FILE"
      tail -n 40 "$LOG_FILE" >&2
      exit 1
    fi
    load_port_pid
    if [[ "$PORT_PID_RESULT" == "$pid" ]]; then
      stable_checks=$((stable_checks + 1))
      if [[ "$stable_checks" -ge 3 ]]; then
        event "OK" "dev" "running: $URL (pid $pid)"
        event "LOG" "dev" "$LOG_FILE"
        return 0
      fi
    else
      stable_checks=0
    fi
    sleep 0.2
  done

  event "FAIL" "dev" "startup timed out"
  if is_running "$pid"; then
    assert_managed_pid "$pid"
    kill "$pid"
  fi
  rm -f "$PID_FILE"
  tail -n 40 "$LOG_FILE" >&2
  exit 1
}

status_dev() {
  section "Dev Server"
  event "RUN" "dir" "$RUN_DIR"
  event "PORT" "dev" "$PORT"
  event "LOG" "dev" "$LOG_FILE"

  local pid=""
  if ! pid="$(read_pid)"; then
    event "STOPPED" "dev" "no pid file"
    return 0
  fi

  if ! is_running "$pid"; then
    event "STALE" "dev" "pid file exists but process is not running: $pid"
    return 0
  fi

  assert_managed_pid "$pid"
  event "OK" "dev" "running: $URL (pid $pid)"
}

stop_dev() {
  section "Dev Server"

  local pid=""
  if ! pid="$(read_pid)"; then
    event "STOPPED" "dev" "already stopped"
    return 0
  fi

  if ! is_running "$pid"; then
    event "CLEAN" "dev" "removing stale pid file: $PID_FILE"
    rm -f "$PID_FILE"
    return 0
  fi

  assert_managed_pid "$pid"
  event "RUN" "dev" "stopping pid $pid"
  kill "$pid"

  for _ in {1..50}; do
    if ! is_running "$pid"; then
      rm -f "$PID_FILE"
      event "OK" "dev" "stopped"
      return 0
    fi
    sleep 0.1
  done

  die "pid $pid 未在超时时间内退出，请手动检查: $LOG_FILE" 1
}

restart_dev() {
  stop_dev
  start_dev
}

logs_dev() {
  section "Dev Server"
  [[ -f "$LOG_FILE" ]] || die "log 文件不存在: $LOG_FILE" 2
  tail -f "$LOG_FILE"
}

command="${1:-}"
case "$command" in
  --help|-h|help)
    usage
    ;;
  "")
    usage >&2
    exit 2
    ;;
  start|status|stop|restart|logs)
    action="$command"
    shift
    if args_include_help "$@"; then usage; exit 0; fi
    service="${1:-}"
    [[ "$service" == "dev" ]] || die "usage: ./scripts/dev.sh $action dev" 2
    shift
    [[ "$#" -eq 0 ]] || die "usage: ./scripts/dev.sh $action dev" 2
    case "$action" in
      start) start_dev ;;
      status) status_dev ;;
      stop) stop_dev ;;
      restart) restart_dev ;;
      logs) logs_dev ;;
    esac
    ;;
  *)
    usage >&2
    die "unknown command: $command" 2
    ;;
esac
