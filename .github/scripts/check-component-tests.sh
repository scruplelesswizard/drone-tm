#!/bin/bash
# Governance gate: a new component file needs a sibling test file, matching
# this repo's existing convention (Foo/index.tsx -> Foo/index.test.tsx).
# Only checks ADDED files - renames/edits to existing untested components
# aren't blocked retroactively, only new ones.
set -euo pipefail

base_ref="$1"

added_components=$(git diff --name-only --diff-filter=A "origin/$base_ref...HEAD" -- 'src/frontend/src/components/**.tsx' \
  | grep -vE '\.(test|stories)\.tsx$' || true)

if [ -z "$added_components" ]; then
  echo "OK - no new component files"
  exit 0
fi

all_changed=$(git diff --name-only "origin/$base_ref...HEAD")

missing=""
while IFS= read -r file; do
  [ -z "$file" ] && continue
  expected="${file%.tsx}.test.tsx"
  if ! grep -qxF "$expected" <<<"$all_changed"; then
    missing="$missing$file (expected $expected)\n"
  fi
done <<<"$added_components"

if [ -n "$missing" ]; then
  echo "::error::New component(s) with no sibling test file:"
  echo -e "$missing"
  echo "Add a sibling *.test.tsx (Vitest/Testing Library), or explain in the"
  echo "PR description why no test applies."
  exit 1
fi

echo "OK - all new components have a sibling test file"
