#!/bin/bash
#
# Builds `--binding NAME=value` arguments for `wrangler pages dev`.
#
#   ./bindings.sh -- <command> [args...]
#       Runs <command> with the bindings appended as separate, verbatim arguments.
#       Use this form: values may contain spaces, quotes or `*` (AWS_BEDROCK_CONFIG is
#       JSON with spaces) and still arrive intact.
#
#   ./bindings.sh
#       Legacy: prints the arguments space-separated for `$(./bindings.sh)`. The
#       caller's word splitting breaks any value that contains whitespace.
#
# Values come from .env.local when it exists, otherwise from the environment for
# every name declared in worker-configuration.d.ts.

args=()

add_binding() {
  args+=(--binding "$1=$2")
}

# Names declared in the Env interface, e.g. "  OPENAI_API_KEY: string;". Names may be
# mixed case (HuggingFace_API_KEY), so match whole identifiers at the start of a line.
extract_env_vars() {
  grep -oE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*:' worker-configuration.d.ts | tr -d ' \t:'
}

if [ -f ".env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"

    # Skip blank lines, comments, and anything that is not NAME=value.
    if [[ "$line" =~ ^[[:space:]]*(#|$) ]] || [[ "$line" != *=* ]]; then
      continue
    fi

    name="${line%%=*}"
    name="${name#export }"
    name="${name//[[:space:]]/}"
    value="${line#*=}"

    # Strip one pair of matching surrounding quotes; keep the inside verbatim.
    if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    add_binding "$name" "$value"
  done < .env.local
else
  while IFS= read -r var; do
    if [ -n "$var" ] && [ -n "${!var:-}" ]; then
      add_binding "$var" "${!var}"
    fi
  done < <(extract_env_vars)
fi

if [ "${1:-}" = "--" ]; then
  shift

  if [ $# -eq 0 ]; then
    echo "bindings.sh: missing command after --" >&2
    exit 2
  fi

  exec "$@" "${args[@]}"
fi

echo "${args[*]}"
