#!/bin/bash
# Governance gate: a PR that adds/changes a FastAPI route file must also
# touch at least one backend test file. Deliberately coarse (repo-wide,
# not a per-route mapping) - the goal is "did you even open a test file",
# not perfect route->test traceability.
#
# Escape hatch: a commit whose message contains "[no-test-needed]" skips
# the check - for behavior-preserving refactors of already-tested code
# (e.g. a mechanical dict-comprehension -> dict() rewrite), where forcing
# a test-file touch just to satisfy the gate would be theater, not
# testing. Visible/auditable in the commit log, not a silent bypass.
set -euo pipefail

base_ref="$1"

if git log "origin/$base_ref..HEAD" --format=%B | grep -qF '[no-test-needed]'; then
  echo "OK - skipped via [no-test-needed] marker in a commit message"
  exit 0
fi

routes_changed=$(git diff --name-only "origin/$base_ref...HEAD" -- 'src/backend/app/**_routes.py')
tests_changed=$(git diff --name-only "origin/$base_ref...HEAD" -- 'src/backend/tests/**')

if [ -n "$routes_changed" ] && [ -z "$tests_changed" ]; then
  echo "::error::Route file(s) changed with no test file changes in this PR:"
  echo "$routes_changed"
  echo
  echo "Add/update a test under src/backend/tests/ covering the change, or"
  echo "add [no-test-needed] to a commit message with an explanation of why"
  echo "(e.g. a behavior-preserving refactor of already-tested code)."
  exit 1
fi

echo "OK - route changes: $(echo "$routes_changed" | grep -c . || true), test changes: $(echo "$tests_changed" | grep -c . || true)"
