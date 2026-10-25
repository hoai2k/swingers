#!/bin/sh
# Score units against the panel with optional stat overrides, without editing files.
#   battles/dev/balance/try.sh "clubber,squire" '{"clubber":{"cost":80}}' [runs] [vs]
# Results go to $OUT (default /tmp/balance-try) under a name derived from the arguments,
# so re-running the same trial reuses finished battles.
D=$(dirname "$0")
OUT=${OUT:-/tmp/balance-try}
mkdir -p "$OUT"
UNITS=$1; OV=${2:-}; RUNS=${3:-6}; VS=${4:-}
SRCSUM=$(cat "$D"/../../src/*.js "$D"/../../src/packs/*.js | cksum | cut -d' ' -f1)
TAG=$(printf '%s|%s|%s|%s' "$UNITS" "$OV" "$VS" "$SRCSUM" | cksum | cut -d' ' -f1)
F="$OUT/$TAG.jsonl"
OVERRIDE="$OV" node "$D/run.mjs" --units "$UNITS" --runs "$RUNS" ${VS:+--vs "$VS"} --out "$F" 2>/dev/null
node "$D/report.mjs" "$F" | awk -v u=",$UNITS," -v ov="$OV" 'NR==1{print $0"  "ov; next} index(u, ","$1",")'
