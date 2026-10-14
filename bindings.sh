#!/bin/bash
# Pass only hosted infrastructure bindings; never echo secret values.
exec node "$(dirname "$0")/scripts/runtime-bindings.mjs" "$@"
