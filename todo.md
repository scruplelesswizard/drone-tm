# Drone-TM overhaul backlog

Source: engineering audit, 2026-08-15 (full backlog published as an artifact —
ask for the link if needed). This file tracks execution of the Backend and
Frontend P0/P1 items only. CI/CD, Kubernetes/infra, cross-cutting security,
and observability items are catalogued in the artifact but out of scope here
until explicitly requested.

Each item gets its own commit (and, on the `scruplelesswizard/drone-tm` fork,
its own stacked PR). Checked = committed. Follow-ups discovered while
executing an item are filed as new entries below, not noted inline on the
original item.

## Backend — P0

- [x] Standardize trailing-slash convention across all routers (no trailing
      slash; matches `main.py`'s `redirect_slashes=False` + its own comment)
- [x] Fail fast when `SECRET_KEY` is unset outside debug (`app/config.py`)
- [x] Paginate `GET /users/` (`user_routes.py`, currently unbounded)
- [x] Restore a real ruff lint config (`pyproject.toml`) — was `ignore`-only
      with no `select`, silently falling back to Ruff's minimal defaults

## Backend — P1

- [x] Type the two raw-dict request bodies (`project_routes.py` regulator
      approval + tags endpoints) with real Pydantic schemas
- [x] Widen the permission framework's adoption (`users/permissions.py`):
      replaced duplicated inline ownership checks in `user_routes.py` with
      `check_permissions(...)`. Removed `HasObjectPermission`/`PermissionType`
      instead of implementing the stub — it's unused anywhere and there's no
      permissions/roles table backing it.
- [x] RFC 7807-style problem responses: global exception handlers
      (`app/problem_details.py`) for `HTTPException` / `RequestValidationError`
      / generic `Exception`. Fixed the 3 sites the audit named for leaking
      raw exception text into `detail`.
- [x] One shared pagination dependency + response envelope (`app/pagination.py`)
      for projects/tasks/users list endpoints.
- [x] Turn on mypy for the backend (`pyproject.toml` + pre-commit), as a
      gradual-typing baseline rather than zero-errors-or-bust.

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

## Follow-ups discovered while executing the above

New items surfaced during backend work, filed separately rather than as
inline notes on the item that found them:

- [ ] Fix the ~30 remaining `detail=f"...{e}"` sites in
      `classification_routes.py`/`project_routes.py` that leak raw exception
      text into the client-facing response (all already `log.error(...)` the
      real error first, so not urgent — found while adding the RFC 7807
      handlers, which only fixed the 3 sites the original audit named).
- [ ] Regenerate `uv.lock` (run `uv lock` from `src/backend` in a real dev
      environment or container — this sandbox lacks `libpq-dev`/GDAL headers
      needed to resolve `psycopg[c]`) now that mypy was added as a dev
      dependency; the `uv-lock` pre-commit hook will fail until then.
- [ ] Incrementally clear the debt the restored ruff config now tracks in
      documented `ignore` entries: `B904` (51 sites, exception chaining),
      `N805`/`N806` (43 sites, naming), `ASYNC240` (11 sites, blocking calls
      in async functions). Each needs individual review, not a blind fix.
- [ ] Give `GET /users` a real paged UI/UX instead of the large
      default/max page size (200/500) it currently uses to avoid breaking
      the user-mention picker, which expects "all users" back in one page.

## Explicitly out of scope for this pass

CI/CD & Delivery, Kubernetes & Infra, Security (cross-cutting), Observability,
and all P2/P3 items across every domain — see the full artifact backlog.
