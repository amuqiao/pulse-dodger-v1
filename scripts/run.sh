#!/usr/bin/env bash
# run.sh - 日常快捷 recipe 入口。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/common.sh"

usage() {
  cat <<'EOF'
用法：
  ./scripts/run.sh up dev
  ./scripts/run.sh status dev
  ./scripts/run.sh down dev
  ./scripts/run.sh restart dev
  ./scripts/run.sh logs dev
  ./scripts/run.sh -h|--help

作用域：
  日常快捷 recipe 入口。只编排 scripts/dev.sh 的稳定命令。

命令：
  up dev        启动本项目 Vite dev server。
  status dev    查看本项目 Vite dev server 状态。
  down dev      停止本项目 Vite dev server。
  restart dev   重启本项目 Vite dev server。
  logs dev      跟随查看本项目 Vite dev server 日志。
  help          显示帮助。

运行态文件：
  .run/dev.pid
  .run/dev.log
  .run/dev.port

常用示例：
  ./scripts/run.sh up dev
  ./scripts/run.sh status dev
  ./scripts/run.sh down dev
  ./scripts/run.sh restart dev
  ./scripts/run.sh logs dev

Exit Codes:
  0  成功
  2  参数、命令或 recipe 错误
  其他非 0 由 dev.sh 透传
EOF
}

command_usage() {
  local name="$1"
  case "$name" in
    up|status|down|restart|logs)
      cat <<EOF
用法：
  ./scripts/run.sh ${name} dev
  ./scripts/run.sh ${name} -h|--help

作用域：
  执行日常快捷 recipe ${name}。查看顶层 help 获取完整配置、输出和退出码合同。

Exit Codes:
  0  成功
  2  参数或 recipe 错误
  其他非 0 由 dev.sh 透传
EOF
      ;;
    *)
      usage >&2
      return 2
      ;;
  esac
}

run_dev_up() {
  event "RUN" "dev" "start"
  "$ROOT_DIR/scripts/dev.sh" start dev
}

run_dev_status() {
  event "CHECK" "dev" "status"
  "$ROOT_DIR/scripts/dev.sh" status dev
}

run_dev_down() {
  event "RUN" "dev" "stop"
  "$ROOT_DIR/scripts/dev.sh" stop dev
}

run_dev_restart() {
  run_dev_down
  run_dev_up
}

run_dev_logs() {
  event "TAIL" "dev" "logs"
  "$ROOT_DIR/scripts/dev.sh" logs dev
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
  up|down|status|restart|logs)
    action="$command"
    shift
    if args_include_help "$@"; then command_usage "$action"; exit $?; fi
    recipe="${1:-}"
    [[ -n "$recipe" ]] || die "usage: ./scripts/run.sh $action dev" 2
    shift
    [[ "$#" -eq 0 ]] || die "usage: ./scripts/run.sh $action $recipe" 2
    case "$action:$recipe" in
      up:dev) run_dev_up ;;
      down:dev) run_dev_down ;;
      status:dev) run_dev_status ;;
      restart:dev) run_dev_restart ;;
      logs:dev) run_dev_logs ;;
      *) die "unknown run recipe for $action: $recipe" 2 ;;
    esac
    ;;
  *)
    usage >&2
    die "unknown command: $command" 2
    ;;
esac
