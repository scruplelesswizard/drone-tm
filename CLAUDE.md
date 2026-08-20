# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working style

- Be brief. Minimize input and output tokens.
- Skip explanations of basics — assume expert-level knowledge.
- No trailing summaries after completing work.
- Communicate in point form only, not prose.
- Operate as a highly skilled developer and designer treating this as a
  full overhaul — favor decisive, high-quality changes over incremental
  caution.

## Project overview

DroneTM (Drone Tasking Manager) is HOTOSM's platform for coordinating community
drone mapping: pilots fly assigned task areas, upload imagery, and the
platform processes it (via ODM/ScaleODM) into georeferenced orthophotos
published to OpenAerialMap. It has three main runtime pieces:

- **Backend**: FastAPI app in `src/backend/app/`
- **Frontend**: React 19 + Vite SPA in `src/frontend/src/`
- **drone-flightplan**: standalone Python package (uv workspace member) in
  `src/backend/packages/drone-flightplan/` that generates waypoint flight
  plans; also published to PyPI independently
- **Secondary/legacy**: `src/qfield-plugin/` (QGIS/QField plugin for offline
  flightplan generation — edit only when a task specifically requires it),
  `src/gcp-editor/`, `src/drone-mesh/`

## Commands

All commands are run via `just` (see `Justfile` + `tasks/*` modules) from the
repo root unless noted. Requires Docker (or `nerdctl`, auto-detected).

```bash
just help                 # list all available commands (grouped by module)
just start all            # start full docker stack (backend, frontend, db, arq-worker, etc.)
just start backend        # start backend service only
just start frontend       # start frontend service only
just build all            # build backend & frontend containers
just lint                 # run all pre-commit hooks (ruff, ruff-format, oxfmt, actionlint, etc.)
just migrate              # run alembic migrations (docker compose run migrations)
just db-revision "msg"    # autogenerate an alembic migration from SQLAlchemy model diffs
just test backend         # run backend pytest suite against dockerized stack (compose.test.yaml)
just docs                 # serve mkdocs site locally at :3000
just bump                 # bump version via commitizen (updates pyproject, __version__.py,
                           #   frontend package.json, chart/Chart.yaml) + changelog
```

Backend (Python, `src/backend/`, managed with `uv`):

```bash
cd src/backend && uv sync            # install deps (incl. drone-flightplan workspace member)
cd src/backend && uv run pytest -v   # run tests locally (requires DB/Redis reachable — usually run via `just test backend` instead)
cd src/backend && uv run pytest tests/test_projects_routes.py -v          # single file
cd src/backend && uv run pytest tests/test_projects_routes.py::test_name -v  # single test
cd src/backend && uv run pre-commit run --all-files   # what `just lint` runs
```

Frontend (`src/frontend/`, pnpm workspace rooted at `src/`):

```bash
cd src && pnpm install               # install deps for the whole workspace (frontend + gcp-editor)
cd src/frontend && pnpm dev          # vite dev server
cd src/frontend && pnpm build        # tsc + vite build (runs paraglide-js i18n compile via prebuild)
cd src/frontend && pnpm lint         # eslint --fix
```

Notes:

- `just test backend` is the canonical way to run the backend suite — it
  builds/starts the test compose stack (`compose.test.yaml`), including
  `arq-worker` and an `s3-init` step, then execs `pytest` inside the
  `backend` container and tears the stack down afterward (even on failure).
- Real end-to-end imagery processing depends on ScaleODM running on the host
  (outside this repo's compose stack) — `just start all` only soft-warns if
  it isn't reachable at `SCALEODM_PROBE_URL` (default
  `http://localhost:31100/info`). The bundled NodeODM service is a
  placeholder and can't complete a ScaleODM-flow run. See `docs/dev/setup.md`.
- `just process import-imagery ...` bulk-copies external S3 imagery into a
  project's `user-uploads/` dir via a throwaway rclone container.

## Architecture

### Backend module pattern

Each backend domain lives under `src/backend/app/<domain>/` and generally
follows a 3-file split — keep new code consistent with this:

- `*_routes.py` — FastAPI route handlers. Keep these thin (HTTP concerns
  only: parsing, auth deps, calling logic, shaping the response).
- `*_logic.py` / `*_deps.py` — domain/business logic and FastAPI
  dependencies. This is where DB queries and processing logic belong.
- `*_schemas.py` — Pydantic request/response schemas.

Domains: `drones/`, `gcp/`, `projects/` (also has `classification_routes.py`,
`oam.py` for OpenAerialMap upload, `s3_paths.py`), `tasks/` (also
`task_splitter.py` for splitting project AOIs into task areas), `users/`,
`waypoints/`, `arq/` (background job task definitions —
`arq/tasks.py`, `arq/cloudnative.py`), `jaxa/` (elevation/DEM data), `images/`.

Cross-cutting:

- `app/db/db_models.py` — all SQLAlchemy models live in one file (not split
  per-domain). `app/db/database.py` — connection pool / `get_db` dependency.
- `app/models/enums.py` — shared enums (e.g. `HTTPStatus`, `UserRole`) used
  across domains.
- `app/config.py` — `pydantic-settings`-based settings (env-driven), single
  `settings` singleton.
- `app/migrations/versions/` — Alembic migrations. Generate with
  `just db-revision "message"` (autogenerates from `db_models.py` diffs
  against a running DB), then review/edit the generated script before
  committing — don't hand-write migrations as the primary path.
- `app/main.py` — app assembly: router registration, CORS, logging
  (loguru, with a `SIGUSR1` handler to toggle DEBUG at runtime), optional
  Sentry/OTel monitoring, Hanko SSO wiring, and serving the built frontend's
  static assets when present (the backend container can serve the SPA).
- Auth: `hotosm_auth` / `hotosm_auth_fastapi` package (HOTOSM's shared auth
  lib) provides Hanko SSO integration and OSM OAuth account linking;
  conditionally mounted when `settings.AUTH_PROVIDER == "hanko"`.
- Background jobs: `arq` (Redis/Dragonfly-backed task queue) runs as a
  separate `arq-worker` service — used for imagery processing pipelines and
  other long-running work. Test fixtures for this use a dedicated Dragonfly
  DB index (see `tests/conftest.py`: `arq_test_redis`, `arq_test_ctx`).

### drone-flightplan package

Independent `uv` workspace package (`src/backend/packages/drone-flightplan/`,
its own `pyproject.toml`, own PyPI release cadence — `just bump-drone-flightplan`
is separate from the main app bump). Provides flight-plan generation used by
the backend and exposes CLI scripts (`waypoints`, `flightplan`, `addelev`,
etc.). Treat it as a library boundary: changes here should stay generically
useful, not DroneTM-specific.

### Frontend

- `src/routes/` — route definitions (`appRoutes.ts`, `generateRoutes.tsx`,
  `ProtectedRoute.tsx` for auth-gated routes).
- `src/store/` — Redux Toolkit + redux-saga + redux-persist:
  `slices/`, `reducers/`, `actions/`, `sagas/`, `selector/`, `hooks/`.
- `src/api/` — API client functions (paired with TanStack Query for
  server-state fetching/caching, used alongside the Redux store for
  client/UI state).
- `src/views/`, `src/components/`, `src/modules/` — UI layers.
- `src/i18n/`, `messages/`, `project.inlang/` — Paraglide-JS i18n; message
  catalogs compile to `src/paraglide` via the `prebuild` script before every
  build/dev run.
- Mapping stack: MapLibre GL (+ Mapbox GL Draw for AOI/task drawing),
  OpenLayers (`ol`), Turf.js for geospatial calcs, `three` /
  `3d-tiles-renderer` for the in-browser 3D mesh viewer (ODM output).
- `@yume-chan/adb*` — WebUSB/WebADB support for copying flight plans to
  Android-based drone controllers directly from the browser.
- `@hotosm/gcp-editor` is a workspace-linked sibling package (`src/gcp-editor/`)
  for Ground Control Point placement/editing.
- Uses React 19, react-hook-form, react-router-dom v7, Tailwind CSS.

### Infra / deployment

- `compose.yaml` — full local dev stack (backend, frontend, db (Postgres +
  PostGIS via GeoAlchemy2), migrations, arq-worker, dragonfly (Redis-compatible
  queue), rustfs (S3-compatible storage), qgis-packager, nodeodm placeholder).
- `compose.test.yaml` — stack used by `just test backend`.
- `compose.sub.yaml` — used for production deploys from tagged releases
  (`just start prod`), with envsubst-based variable substitution.
- `chart/` — Helm chart for Kubernetes deployment. Don't modify unless asked.
- `docs/decisions/` — Architectural Decision Records (ADRs). Read the
  relevant ones before non-trivial architectural changes (e.g. flightplan
  upload, storage/processing choices, mobile QField plugin, processing
  status reconciliation, 3D viewer). Start at `docs/decisions/README.md`.
- `docs/` (mkdocs site, `mkdocs.yml`) is the published docs source
  (`docs.drone.hotosm.org`), separate from the ADRs.

## Coding standards

- Prefer explicit, simple, readable code; avoid unnecessary abstractions.
- Keep API route handlers thin — HTTP concerns only; put domain/data logic
  in `*_logic.py` / `*_deps.py`, matching existing per-domain patterns.
- Reuse existing schema/route/crud patterns rather than inventing new ones.
- Comment only where intent is genuinely non-obvious.

## Testing standards

- All new backend behavior should be tested: cover success and failure
  paths; favor route/integration tests for HTTP flows, add focused unit
  tests for isolated logic.
- Don't weaken or delete tests just to make CI pass.
- If environment constraints block running tests, state the exact blocker
  rather than skipping silently.
- Frontend UI verification: `src/frontend/e2e/` holds Playwright
  (`pnpm test:e2e`) headless-Chromium end-to-end tests, distinct from
  `src/frontend/src/**/*.test.tsx` (Vitest/Testing Library, jsdom-based
  component tests). When a manual browser session isn't available, a
  passing headless Playwright run against the real rendered app (routing,
  redirects, DOM assertions — not just jsdom) is sufficient UI
  verification; state that's what was used, don't claim manual browser
  testing you didn't do. Prefer adding/extending a Playwright spec over
  skipping verification for any UI change reachable from a public route;
  authenticated/data-dependent flows still need a note on what wasn't
  verified end-to-end.

## Database & migrations

1. Update SQLAlchemy models in `app/db/db_models.py` (and related modules).
2. Generate a revision with `just db-revision "message"` (autogenerate, diffed
   against a running DB via `just migrate` first).
3. Review and hand-adjust the generated migration script before committing —
   autogenerate is a starting point, not the final artifact.

## Security & change boundaries

Never commit `.env`/credentials, hardcode secrets, bypass auth/permission
checks, or introduce unparameterized SQL.

Ask before: adding new dependencies, changing the auth model, DB schema
changes that don't fit the migration flow above, or touching deployment/CI
infrastructure.

Default edit scope is `src/backend/**`, `src/frontend/**`, `docs/**`,
`tasks/**`/`Justfile` (only when the task needs it). Avoid touching
`.env`, `chart/`, or `.github/workflows/` unless explicitly requested.

## Commits & dependencies

- Conventional Commits are enforced via commitizen (`commit-msg` pre-commit
  hook) and drive versioning/changelog generation (`just bump`).
- Use `uv` for backend Python dependencies, `pnpm` for frontend/JS
  dependencies. Keep dependency diffs minimal and justified; avoid
  opportunistic unrelated upgrades (Renovate handles routine bumps).
