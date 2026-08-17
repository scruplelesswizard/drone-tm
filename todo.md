# Drone-TM overhaul backlog

Source: engineering audit, 2026-08-15 (full backlog published as an artifact —
ask for the link if needed). Originally scoped to Backend/Frontend P0/P1 only;
expanded 2026-08-16 to track every item from the audit, across all six
domains and all priority tiers.

Each item gets its own commit (and, on the `scruplelesswizard/drone-tm` fork,
its own stacked PR, except where noted). Checked = committed. Follow-ups
discovered while executing an item are filed as new entries below, not noted
inline on the original item.

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

## Backend — P2

- [ ] Set `response_model` + `summary` consistently across routes (only ~3 of
      35 routes in `project_routes.py` set `response_model`; no route
      anywhere sets `summary`)
- [ ] Introduce `/api/v1` path versioning ahead of the next breaking change —
      no versioning mechanism exists at all today

## CI/CD & Delivery — P0

- [x] Fix backend test workflow silently skipping stacked-branch PRs —
      `test.yml`'s `pull_request` trigger was scoped to `branches: [main,
      dev]`, but every PR in this stack targets an intermediate `todo/*`
      branch, so the filter never matched and the job never ran, on any PR,
      ever. Dropped the branch filter (path filters still apply). Landed
      directly on `dev` (PR #18), not part of the stack, then restacked every
      open `todo/*` branch on top so existing PRs pick it up too.
- [ ] Add a frontend CI job (lint + typecheck + build gate on PRs — today
      only exercised inside the release Docker build)
- [ ] Turn on dependency vulnerability scanning (no Renovate/Dependabot,
      no CodeQL, on either the Python or JS dependency graph)
- [ ] Turn on container image scanning (`tag_build.yml:19` explicitly sets
      `scan_image: false` for the backend image)

## CI/CD & Delivery — P1

- [ ] Add a secret-scanning CI gate (today: local pre-commit only)
- [ ] Confirm/enable branch protection on `main`/`dev` (branch-protection API
      returned 404 for both — status unconfirmed, likely absent)
- [ ] Build & push images on every merge to `dev`, not just on release —
      tag by git-sha, keep semver tagging for releases

## CI/CD & Delivery — P2

- [ ] Enforce a coverage threshold in backend CI (`coverage`/`coverage-badge`
      installed but unconfigured; `pytest` invocation has no `--cov`)
- [ ] Wire up the dormant `lint-staged` config (declared in `package.json`,
      but no `husky`/`.husky/` exists to invoke it)

## CI/CD & Delivery — P3

- [ ] Add OCI image labels + re-enable OpenAPI doc generation
      (`build_openapi_json` in `docs.yml` is fully commented out)

## Kubernetes & Infra — P0

- [ ] Set default resource requests/limits (`chart/values.yaml` ships
      `backend.resources: {}`, `worker.resources: {}`, `qgis.resources: {}`)
- [ ] Harden container `securityContext` — add `readOnlyRootFilesystem`,
      `capabilities.drop:[ALL]`, `allowPrivilegeEscalation:false` (only
      `runAsNonRoot`/`runAsUser` are set today)

## Kubernetes & Infra — P1

- [ ] Default HPA and PDB to enabled (`autoscaling.enabled` and
      `podDisruptionBudget.*.enabled` default to `false`)
- [ ] Add default-deny `NetworkPolicy` (none exists despite Postgres,
      Dragonfly, RustFS all running in-cluster)
- [ ] Add `startupProbe` to backend/worker (liveness/readiness are solid but
      nothing covers slow startup — migrations, DB pool warm-up)

## Kubernetes & Infra — P2

- [ ] Pin images by digest, not mutable tag
- [ ] Add `values.schema.json` to validate `helm install`/`template` inputs

## Kubernetes & Infra — P3

- [ ] SBOM generation + image signing (`cosign`/`syft`/`trivy`)

## Security — P1

- [ ] Add rate limiting (no `slowapi`, middleware, or ingress-level
      throttling on login, the presigned-URL endpoint, or the ScaleODM
      webhook)

## Security — P2

- [ ] Scope CORS methods/headers (`main.py:195-202` pairs
      `allow_methods=["*"]`/`allow_headers=["*"]` with
      `allow_credentials=True`)
- [ ] Codify the column-name f-string SQL pattern as a lint rule (currently
      safe via an `assert column in ALLOWLIST`, but relies on discipline)

## Observability — P1

- [ ] Request/correlation-ID propagation (no request-ID middleware anywhere)
- [ ] Expose a Prometheus `/metrics` endpoint

## Observability — P2

- [ ] Instrument the arq worker, not just the API (`app/arq/*.py` has zero
      OTel/Sentry references)

## Frontend — P0

- [x] Stand up a test runner (Vitest + Testing Library), with one real
      smoke test (`components/common/Icon`) — zero tests existed before this
- [x] Migrate ESLint to v9 flat config (`eslint.config.js`, bridging
      eslint-config-airbnb via FlatCompat), upgrade typescript-eslint to v8
      and enable it for real. jsx-a11y turned out to already be active
      (bundled inside `eslint-config-airbnb`, not `-base`).

## Frontend — P1

- [x] Delete the dead redux-saga stack (empty root saga, zero watchers —
      TanStack Query already owns server state). Also deleted the entirely
      unused `user-auth-module` store instance it was tangled up with.
- [x] Add a top-level `ErrorBoundary` at the app root using the already-
      installed `react-error-boundary` package (was unused before this)

## Frontend — P2

- [ ] Break up the four largest components: `ImageReview.tsx` (2334 lines),
      `ProcessingStatusDialog.tsx` (1153), `MapSection.tsx` (1072),
      `TaskVerificationModal.tsx` (832) — opportunistically, alongside
      feature work that already touches them
- [ ] Reduce `any` usage starting at the API layer (193 occurrences across
      86 files despite `strict: true`; every response handler in
      `api/tasks.ts`/`api/dashboard.ts` types the axios response as `any`)
- [ ] Finish i18n coverage (`LandingPage`/`Footer` and several cross-cutting
      `toast.error()` calls are hardcoded English)

## Frontend — P3

- [ ] Investigate dropping one of two map libraries (MapLibre GL vs
      OpenLayers) — spike first to confirm neither is load-bearing

## Follow-ups discovered while executing the above

New items surfaced during backend/frontend work, filed separately rather
than as inline notes on the item that found them:

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
- [ ] Reformat/fix `vite.config.ts` to the project's own prettier style
      (single quotes etc.) — it was in `.eslintignore` entirely before the
      ESLint v9 migration, so it was never actually linted; now it accounts
      for ~60 of the pre-existing violation count surfaced by that migration.
- [ ] Triage and fix the ~6600 pre-existing ESLint problems across the
      frontend that `eslint .` now reports for real (lint has never run in
      CI — see the ESLint v9 migration item above). This needs its own
      deliberate, reviewed pass (almost 6000 are auto-fixable, but running
      `--fix` across the whole tree in one shot is exactly what went wrong
      mid-session here — do it in reviewable batches, not one commit).
