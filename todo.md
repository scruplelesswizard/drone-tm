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
      anywhere sets `summary`). Large mechanical sweep (~32 routes), not
      attempted this pass - safe to pick up in reviewable batches.
- [ ] **Needs interaction:** introduce `/api/v1` path versioning. This is a
      breaking-change-shaped decision (URL structure, client migration,
      whether unversioned `/api` keeps working during a transition) that
      needs a rollout plan, not a drive-by route mount.

## CI/CD & Delivery — P0

- [x] Fix backend test workflow silently skipping stacked-branch PRs —
      `test.yml`'s `pull_request` trigger was scoped to `branches: [main,
      dev]`, but every PR in this stack targets an intermediate `todo/*`
      branch, so the filter never matched and the job never ran, on any PR,
      ever. Dropped the branch filter (path filters still apply). Landed
      directly on `dev` (PR #18), not part of the stack, then restacked every
      open `todo/*` branch on top so existing PRs pick it up too.
- [x] Add a frontend test workflow (`frontend-test.yml`, runs `pnpm test` /
      Vitest on PRs touching `src/frontend`) — narrower than the item below:
      covers test execution only, not lint/typecheck/build.
- [ ] Add lint + typecheck + build gate for the frontend on PRs (today only
      exercised inside the release Docker build)
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

- [ ] **Needs interaction:** set default resource requests/limits
      (`chart/values.yaml` ships `backend.resources: {}`,
      `worker.resources: {}`, `qgis.resources: {}`). Real numbers need actual
      usage data (or at least a target cluster's node sizing) - guessed
      requests/limits are worse than none if they're wrong in either
      direction (throttling vs. no protection).
- [ ] **Needs interaction:** harden container `securityContext` —
      `readOnlyRootFilesystem`, `capabilities.drop:[ALL]`,
      `allowPrivilegeEscalation:false`. `readOnlyRootFilesystem` in
      particular risks breaking any container that writes to its own
      filesystem at runtime (temp files, caches) - needs a real deploy to
      verify before defaulting it on, not a chart-only change.

## Kubernetes & Infra — P1

- [ ] **Needs interaction:** default HPA and PDB to enabled
      (`autoscaling.enabled`/`podDisruptionBudget.*.enabled` default
      `false`). Enabling by default changes behavior for every existing
      install of the chart, not just new ones - a deploy-owner call.
- [ ] **Needs interaction:** add default-deny `NetworkPolicy`. Wrong from a
      sandbox with no real cluster to validate against - a too-strict policy
      silently breaks Postgres/Dragonfly/RustFS connectivity in a way only
      visible at runtime.
- [x] Add `startupProbe` to backend/worker — purely additive (new probe,
      existing liveness/readiness untouched); verified with `helm lint` +
      `helm template`.

## Kubernetes & Infra — P2

- [ ] **Needs interaction:** pin images by digest, not mutable tag. Needs a
      decision on the digest-refresh workflow (Renovate digest-pinning mode,
      or manual) - not just a values.yaml edit.
- [x] Add `values.schema.json` to validate `helm install`/`template` inputs
      — deliberately permissive (`additionalProperties: true` throughout,
      subchart values left untyped) so it only constrains what this chart's
      own templates consume. Verified: default `values.yaml` still renders
      unchanged, and a deliberately-wrong values file is rejected with a
      clear per-field error. Needed a `.gitignore` exception - a blanket
      `*.json` rule was silently excluding it.

## Kubernetes & Infra — P3

- [ ] **Needs interaction:** SBOM generation + image signing
      (`cosign`/`syft`/`trivy`). Needs key management / OIDC signing
      infrastructure decisions, not just a workflow step.

## Security — P1

- [ ] **Needs interaction:** add rate limiting (no `slowapi`, middleware, or
      ingress-level throttling on login, the presigned-URL endpoint, or the
      ScaleODM webhook). Needs a decision on actual thresholds per endpoint
      and whether it's enforced app-side (`slowapi`) or at the ingress —
      picking numbers without input is a guess, not a fix.

## Security — P2

- [x] Scope CORS methods/headers (`main.py`'s `allow_methods=["*"]`/
      `allow_headers=["*"]` paired with `allow_credentials=True`) — scoped
      to `GET/POST/PATCH/DELETE/OPTIONS` (no PUT route exists anywhere) and
      `Authorization`/`Access-Token`/`Content-Type`/`Accept`.
- [x] Codify the column-name/fixed-fragment SQL pattern via ruff — auditing
      actually found 10 files carrying the blanket `S608` ignore, not the
      assumed 3. Reviewed each: all but one were either a hardcoded-allowlist
      column name, a Pydantic model's own field names (no model here allows
      extra fields), or a two-way choice between fixed SQL fragments with
      values always parameterized. The one real value-interpolation site
      (`image_logic.py`'s `ST_MakePoint` call — safe today only because
      every caller happens to pass EXIF-derived floats through an untyped
      `Any` field) is fixed to use params instead of ignored. Replaced the
      blanket ignore with per-file scoping so `S608` stays live elsewhere.

## Observability — P1

- [x] Request/correlation-ID propagation — `RequestIDMiddleware` in
      `main.py`: reads/generates `X-Request-ID`, binds it to the loguru
      context (now in every log line via `req={extra[request_id]}`), and
      echoes it back on the response. Does **not** yet propagate into arq
      jobs enqueued from a request — see follow-ups.
- [ ] **Needs interaction:** expose a Prometheus `/metrics` endpoint. Needs
      a dependency choice (`prometheus-fastapi-instrumentator` vs
      `prometheus_client` vs `starlette-exporter`) — CLAUDE.md requires
      asking before adding a new dependency.

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
      feature work that already touches them. Not attempted this pass: a
      blind split risks behavior changes in components this size without
      the usual manual browser check this repo's guidelines call for.
- [ ] Reduce `any` usage starting at the API layer (193 occurrences across
      86 files despite `strict: true`) — large mechanical sweep, not
      attempted this pass.
- [ ] Finish i18n coverage (`LandingPage`/`Footer` and several cross-cutting
      `toast.error()` calls are hardcoded English) — not attempted this
      pass; translating user-facing strings is a copy/product call as much
      as a code one.

## Frontend — P3

- [ ] **Needs interaction:** investigate dropping one of two map libraries
      (MapLibre GL vs OpenLayers). Explicitly named as a spike in the
      original audit, not a direct change - needs the spike's findings
      before any removal.

## Follow-ups discovered while executing the above

New items surfaced during backend/frontend work, filed separately rather
than as inline notes on the item that found them:

- [ ] Fix the ~30 remaining `detail=f"...{e}"` sites in
      `classification_routes.py`/`project_routes.py` that leak raw exception
      text into the client-facing response (all already `log.error(...)` the
      real error first, so not urgent — found while adding the RFC 7807
      handlers, which only fixed the 3 sites the original audit named).
- [x] Regenerate `uv.lock` for the mypy dev dependency — ran `uv lock` inside
      a throwaway container built from the backend Dockerfile's build stage
      (has the `libpq-dev`/GDAL headers this sandbox itself lacks). Landed
      on `todo/08-mypy-baseline` (PR #23) and cascaded through every branch
      after it, since it was failing CI on `mypy-baseline` and every PR
      built on top of it.
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
- [ ] Propagate the new request ID (`RequestIDMiddleware`, `main.py`) into
      arq jobs enqueued from a request, so a job can be traced back to the
      HTTP request that triggered it. Needs touching every enqueue call
      site to pass the ID through job kwargs/context - not attempted as
      part of adding the middleware itself.
- [ ] Regenerate `uv.lock` again once `prometheus_client` (or whichever
      package gets picked, see the `/metrics` item above) is added as a
      dependency - same container-based process used for the mypy lockfile
      fix.
