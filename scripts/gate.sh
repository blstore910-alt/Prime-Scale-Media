#!/usr/bin/env bash
# The pre-push gate. Exactly what .github/workflows/ci.yml runs, in the
# same order, chained so the first failure stops the line.
#
# WHY THIS IS A FILE. Typing it by hand keeps going wrong in the same
# way — a pipe. `npx tsc --noEmit | head -4 && ...` reports head's exit
# code, not tsc's; `npx next lint | grep -c Error` reports grep's, and
# greps for the wrong word besides, because --max-warnings 0 fails on
# WARNINGS. Both read as green over a red build, and both have shipped a
# broken push.
#
# So: no pipes, no greps, no output massaging. Run it, read the exit
# code.
set -euo pipefail
npx tsc --noEmit
npx next lint --max-warnings 0
npm test
echo "GATE OK"
