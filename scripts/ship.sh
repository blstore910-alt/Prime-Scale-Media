#!/usr/bin/env bash
# Gate, commit, push to the build gate, promote. One command, chained, so
# no step can be skipped or misread.
#
#   bash scripts/ship.sh "$(cat message.txt)"
#   bash scripts/ship.sh -F message.txt
#
# WHY THIS EXISTS. scripts/gate.sh already reports correctly. Twice now
# the failure was not the gate — it was reading its output and pushing
# anyway: once the tail showed an eslint notice instead of GATE OK and
# the commit went out over it. A gate you have to remember to read is a
# gate that will be forgotten at two in the morning.
#
# So the gate and the push are one command. If the gate fails, nothing is
# committed and nothing is pushed.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: ship.sh <commit message>  |  ship.sh -F <file>" >&2
  exit 2
fi

bash "$(dirname "$0")/gate.sh"

git add -A
if [ "$1" = "-F" ]; then
  git commit -q -F "$2"
else
  git commit -q -m "$1"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push origin "$BRANCH"
git push origin "$BRANCH:main"
echo "SHIPPED $(git rev-parse --short HEAD) -> main"
