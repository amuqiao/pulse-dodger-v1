#!/usr/bin/env bash

section() {
  printf '\n%s\n' "$1"
  printf '%*s\n' "${#1}" '' | tr ' ' '-'
}

event() {
  local level="$1"
  local subject="$2"
  local message="$3"
  printf '[%s] %-12s %s\n' "$level" "$subject" "$message"
}

die() {
  local message="$1"
  local code="${2:-1}"
  printf 'ERROR: %s\n' "$message" >&2
  exit "$code"
}

args_include_help() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      -h|--help|help) return 0 ;;
    esac
  done
  return 1
}
