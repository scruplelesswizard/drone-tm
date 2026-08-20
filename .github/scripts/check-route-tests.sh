#!/bin/bash
# Governance gate: a PR that adds/changes a FastAPI route file must also
# touch at least one backend test file. Deliberately coarse (repo-wide,
# not a per-route mapping) - the goal is "did you even open a test file",
# not perfect route->test traceability.
set -euo pipefail

base_ref="$1"

routes_changed=$(git diff --name-only "origin/$base_ref...HEAD" -- 'src/backend/app/**_routes.py')
tests_changed=$(git diff --name-only "origin/$base_ref...HEAD" -- 'src/backend/tests/**')

if [ -n "$routes_changed" ] && [ -z "$tests_changed" ]; then
  echo "::error::Route file(s) changed with no test file changes in this PR:"
  echo "$routes_changed"
  echo
  echo "Add/update a test under src/backend/tests/ covering the change, or"
  echo "explain in the PR description why no test applies."
  exit 1
fi

echo "OK - route changes: $(echo "$routes_changed" | grep -c . || true), test changes: $(echo "$tests_changed" | grep -c . || true)"
