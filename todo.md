# Drone-TM overhaul backlog

Source: engineering audit, 2026-08-15 (full backlog published as an artifact —
ask for the link if needed). This file tracks execution of the Backend and
Frontend P0/P1 items only. CI/CD, Kubernetes/infra, cross-cutting security,
and observability items are catalogued in the artifact but out of scope here
until explicitly requested.

Each item gets its own commit. Checked = committed.

## Backend — P0

- [ ] Standardize trailing-slash convention across all routers (no trailing
      slash; matches `main.py`'s `redirect_slashes=False` + its own comment)
- [ ] Fail fast when `SECRET_KEY` is unset outside debug (`app/config.py`)
- [ ] Paginate `GET /users/` (`user_routes.py`, currently unbounded)
- [ ] Restore a real ruff lint config (currently `ignore`-only, falls back to
      Ruff's minimal default `select`) — scoped to what's safely fixable now;
      pre-existing debt gets documented `ignore` entries, not blind fixes

## Backend — P1

- [ ] Type the two raw-dict request bodies (`project_routes.py` regulator
      approval + tags endpoints) with real Pydantic schemas
- [ ] Widen the permission framework's adoption (`users/permissions.py`):
      replace duplicated inline ownership checks in `user_routes.py` with
      `check_permissions(...)`; implement the `HasObjectPermission` stub
- [ ] RFC 7807-style problem responses: global exception handlers for
      `HTTPException` / `RequestValidationError` / generic `Exception`; stop
      leaking raw exception text into client-facing `detail`
- [ ] One shared pagination dependency + response envelope for
      projects/tasks/users list endpoints
- [ ] Turn on mypy for the backend (pre-commit + CI), scoped to a workable
      starting baseline rather than zero-errors-or-bust

## Frontend — P0

- [ ] Stand up a test runner (Vitest + Testing Library) with a real smoke
      test — zero tests exist today
- [ ] Migrate ESLint to v9 flat config, upgrade typescript-eslint, enable
      `@typescript-eslint/recommended` + `jsx-a11y/recommended` (currently
      pinned at ESLint 8.2.0, pre-flat-config)

## Frontend — P1

- [ ] Delete the dead redux-saga stack (empty root saga, zero watchers —
      TanStack Query already owns server state)
- [ ] Add a top-level `ErrorBoundary` at the app root using the already-
      installed `react-error-boundary` package (currently unused)

## Explicitly out of scope for this pass

CI/CD & Delivery, Kubernetes & Infra, Security (cross-cutting), Observability,
and all P2/P3 items across every domain — see the full artifact backlog.
