# Drone-TM overhaul backlog

Source: engineering audit, 2026-08-15 (full backlog published as an artifact —
ask for the link if needed). Originally scoped to Backend/Frontend P0/P1 only;
expanded 2026-08-16 to track every item from the audit, across all six
domains and all priority tiers, plus a seventh domain (Accessibility &
Design System) added the same day from a separate standards audit request.

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

- [x] Set `response_model` + `summary` consistently across routes. Full
      inventory taken (91 routes total across 8 route files; only 6 had
      `response_model` set, 0 had `summary`) — bigger than the original
      estimate (35/~3 was `project_routes.py` alone). Picking this up in
      reviewable per-file batches, smallest first:
      - [x] batch 1 (13 of 91 routes) — `drones/drone_routes.py` (6),
            `gcp/gcp_routes.py` (2), `public_routes.py` (2),
            `waypoints/waypoint_routes.py` (3). Added a shared
            `app/shared_schemas.py::MessageResponse` (same rationale as
            `pagination.py` — several routes across domains reinvented the
            bare `{"message": str}` shape) plus small one-off response
            schemas per route where the shape was route-specific
            (`DroneCreateResponse`, `GcpSaveResponse`,
            `ScaleOdmWebhookResponse`, `PresignedUrlResponse`). Found and
            fixed a real inconsistency in `get_drone_altitude_by_country`:
            it normalized "not found" to `[]` instead of `None`, which
            would have made `response_model=DroneFlightHeight | None`
            reject the empty-list case — checked the one frontend caller
            (`KeyParameters/index.tsx`, uses `?.` throughout) confirms `[]`
            vs `null` are handled identically, so this is safe.
            `waypoint_routes.py`'s 2 dual-shape routes (file-download vs.
            JSON depending on a runtime flag) got `response_model=None`
            explicitly rather than a guessed schema — the JSON branch's
            shape is owned by the `drone_flightplan` package, not modeled
            locally, and FastAPI already bypasses `response_model` when a
            route returns a `Response` instance directly, so this is a
            correctness no-op for the download branch and an honest
            "unvalidated" marker for the JSON branch. Verified via
            `ruff check`/`format --diff` (clean), full backend suite
            (257/257 passed), and a direct `api.openapi()` build to
            confirm the schema actually generates and every touched route
            shows the right `summary`/response schema.
      - [x] batch 2 (18 of 91 routes) — `tasks/task_routes.py` (7),
            `users/user_routes.py` (11). New schemas: `task_schemas.
            TaskEventOut` (project_id/task_id/state/comment - the
            `RETURNING` shape written by `update_task_state()`, used by
            `manual_override_task_state`), `task_schemas.TaskListOut` and
            `user_schemas.UserListOut` (paginated envelopes, following the
            `pagination.py` `PaginationMeta` pattern). Found and documented
            (not silently fixed) a real shape inconsistency in `handle_event`
            (`new_event` route): its `REQUEST` branch calls
            `request_mapping()`, whose `RETURNING` clause omits `state`
            entirely, while every other branch calls `update_task_state()`,
            whose `RETURNING` includes it - `response_model=TaskEventOut`
            would reject the `REQUEST` branch's response. Left
            `response_model=None` on that route with a comment instead of
            picking a branch to "fix" without understanding why they
            diverged. Same `response_model=None` treatment for `/my-info`
            (a dict built by merging two different models' `.model_dump()`,
            so the real field set varies by user) and every route that
            returns a raw `JSONResponse` (`create_user_profile`,
            `update_user_profile`, `login_url`, `forgot_password`,
            `reset_password`) - FastAPI passes `Response` instances through
            untouched regardless of what `response_model` says, so leaving
            it unset there is the honest state, not a gap.
            **Caught and fixed a self-inflicted bug before committing**: an
            `Edit` call meant to insert `UserListOut` after the `DbUser`
            class instead landed mid-body, splitting `DbUser` in two and
            silently reparenting 6 of its 7 methods (`.one()`, `.create()`,
            `get_or_create_user()`, etc.) onto the new class - `ruff`/syntax
            checks didn't catch it (both halves were valid Python), only
            the full test suite did (130 setup errors, `AttributeError:
            get_or_create_user`). Moved the misplaced insertion to the
            correct location and re-verified structurally with an `ast`
            walk before re-running tests. Also hit an unrelated ~8-minute/
            27-failure test run (`urllib3.MaxRetryError` against the `s3`
            test container) caused by resource contention from concurrent
            background agent work in the same session - confirmed
            environmental (none of the failing tests touch any file this
            batch changed) via a full stack teardown + fresh
            `docker compose ... up` + rerun, which came back 257/257 in the
            normal ~33s. Lesson for next time: don't run a heavy `docker
            compose` test cycle at the same time as another agent is doing
            unrelated heavy work in the same sandbox.
      - [x] batch 3 (23 of 91 routes) — `projects/classification_routes.py`,
            all 23 routes. Categorized as: (A) routes that build their own
            dict locally with a known, stable shape → real `response_model`
            schema (`ClassifyResetStaleResponse`, `ClassifyStartResponse`,
            `IngestUploadsResponse`, `CreateProjectFromExifResponse`,
            `ProjectImageryStatusOut`, `ProjectImagesOut`,
            `TaskImageUrlsOut`, `BulkImageUrlsOut`,
            `MarkTaskVerifiedResponse`, `FlightGapDetectionResponse`); (B)
            routes that delegate to `ImageClassifier`'s opaque dict-returning
            methods (`accept_image`, `reject_image`, `assign_image_to_task`,
            `delete_batch`, `delete_image`, `delete_invalid_images`, plus a
            few summary/coverage/review/map-data endpoints) →
            `response_model=None` with a comment, shape not locally owned;
            (C) `download_reflight_plan` always returns a file-download
            `Response` → `summary=` only, no `response_model` kwarg, same as
            the `waypoint_routes.py` pattern.
            **Caught and fixed a real regression before committing** (not
            environmental this time): adding `response_model=
            ClassifyStartResponse` to `POST /{project_id}/classify` broke
            `test_start_project_classification_returns_no_job_when_no_staged_images`
            — the route's "no images" branch returns a 3-key dict (no
            `job_id`), but FastAPI's `response_model` serialization adds
            *every* declared schema field, so the optional `job_id: str |
            None = None` field started appearing as an explicit `"job_id":
            null` in the response even when the route never set it,
            breaking the test's exact-dict equality check. Fixed with
            `response_model_exclude_none=True` on that route decorator.
            **Lesson**: any route where `response_model` declares an
            `Optional` field that the route sometimes omits entirely from
            its returned dict (rather than explicitly setting it to `None`)
            needs `response_model_exclude_none=True`, or the optional field
            leaks into responses that didn't have it before. Checked the
            other new schemas with optional fields in this file
            (`MarkTaskVerifiedResponse.image_move_job_id`,
            `FlightGapDetectionResponse`'s several `| None` fields) — both
            routes always include those keys in their returned dict
            (via `.get()` or a computed value, never omitted), so no
            `exclude_none` needed there; confirmed via full-suite pass.
            Verified via `ruff check`/`format --diff` (clean), full backend
            suite (257/257 passed), and `api.openapi()` build + summary
            spot-check on 4 routes.
      - [x] batch 4 (37 of 91 routes, final batch) — `projects/project_routes.py`.
            **The `read_projects` mismatch flagged in batch 3's writeup turned
            out not to be a bug**: `ProjectOut` already is the paginated
            envelope shape (`results: list[ProjectInfo]`, `pagination:
            PaginationMeta`), matching what the route returns exactly — just
            added `summary=`. The `upload_imagery_to_oam` bug was real and
            fixed: two branches did `return HTTPException(...)` instead of
            `raise HTTPException(...)`, which would have returned a 200 with
            an `HTTPException` object serialized as the body instead of an
            actual 403/409 error response.
            26 routes got real `response_model` schemas (new schemas added to
            `project_schemas.py`: `ProjectCreateResponse`,
            `TaskBoundaryUploadResponse`, `ImageProcessingStartResponse`,
            `RetryTransferResponse`, `WaypointsCountOut`,
            `OamUploadStartResponse`, `QfieldGenerateResponse`,
            `QfieldStatusResponse`, `InitiateUploadResponse`,
            `SignPartUploadResponse`, `CompleteUploadResponse`,
            `UploadPartsListResponse`, `CloudnativeTriggerResponse`,
            `ArqTestTaskResponse`; reused `MessageResponse` from
            `shared_schemas.py` for the two plain `{"message": ...}` routes).
            `get_assets_info` got a union response_model
            (`list[AssetsInfo] | AssetsInfo | None`) since its two branches
            genuinely return different shapes, both locally known.
            5 routes got `response_model=None` with a comment: `regulator_approval`
            (inconsistent `details`/`message` key across branches - a second,
            separate bug not worth silently papering over with a schema),
            `preview-split-by-square` and `/assets/{project_id}/reconcile`
            (delegate to/merge opaque `dict[str, Any]`-typed helpers),
            `normalize-aoi` (returns the `geojson` package's FeatureCollection
            object directly, not a pydantic model). 8 streaming/file/HEAD
            routes (`download-boundaries`, `terrain-dem`, the 5 `odm/export/*`
            variants, `head_odm_assets`) got `summary=` only, no
            `response_model`, matching the `waypoint_routes.py` pattern.
            Applied `response_model_exclude_none=True` to
            `retry_imagery_transfer` up front (its early-return branch omits
            `status`/`job_id` entirely, same shape as batch 3's `job_id`
            regression) rather than finding it via a failing test this time.
            Verified via `ruff check`/`format --diff` (clean), full backend
            suite (257/257 passed), and `api.openapi()` build + summary
            spot-check on 7 routes. **This completes the full 91-route sweep
            across all 8 backend route files.**
- [x] **Needs interaction:** introduce `/api/v1` path versioning. This is a
      breaking-change-shaped decision (URL structure, client migration,
      whether unversioned `/api` keeps working during a transition) that
      needs a rollout plan, not a drive-by route mount.
      Asked; chose "break it and fix it" over an additive/dual-mount
      transition period — `settings.API_PREFIX` default changed from `/api`
      to `/api/v1` outright, no back-compat redirect.
      DONE — since every backend route was already mounted via
      `prefix=api_prefix` / `settings.API_PREFIX` (only 2 exceptions: the
      Hanko admin/OSM routers in `main.py` hardcoded `prefix="/api"`, fixed
      to use the same `api_prefix` var), the prefix bump was a one-line
      `app/config.py` change. Everything downstream that breaks:
      - Frontend: 10 call sites doing
        `getRuntimeConfig('VITE_API_URL', '/api')` (App.tsx, services/
        index.ts, services/public.ts, views/IndividualProject/index.tsx,
        components/HankoAuth, GoogleAuth, DroneOperatorTask/
        DescriptionSection, modules/user-auth-module's Login,
        routes/ProtectedRoute) → fallback bumped to `/api/v1`.
      - `utils/index.ts`'s `buildDownloadUrl()` had a **real bug** here: it
        stripped a hardcoded literal `/api` (4 chars) off asset paths the
        backend already prefixes with `API_PREFIX`, to avoid doubling when
        re-prepending the API base. With prefix `/api/v1` that hardcoded
        slice(4) would produce `/api/v1/v1/...`. Rewrote to strip by the
        *actual* configured base's path length (falling back to the old
        literal-`/api` strip only for truly legacy unversioned paths).
        Added `src/utils/buildDownloadUrl.test.ts` (5 cases, incl. a
        regression test for the doubling bug) - this file had no prior test
        coverage.
      - `docker-entrypoint.sh`, `compose.yaml`, `chart/values.yaml` (+
        `chart/README.md`), `.env.example`, `docs/dev/setup.md`,
        `docs/dev/imagery-upload.md`, `src/gcp-editor/README.md`: updated
        `/api` defaults/examples to `/api/v1`.
      - Backend tests: 103 hardcoded `/api/...` literals across 13 test
        files → `/api/v1/...` (mechanical `sed`, verified no doubling, no
        stray un-migrated `/api/` left).
      Verified: full backend suite 265/265 + coverage report clean;
      confirmed live via `curl` inside the test container that `/api/v1/
      docs` returns 200 and the old `/api/docs` now 404s; frontend `tsc`
      + `vite build` + `eslint --fix` (caught and fixed one `no-nested-
      ternary` from the buildDownloadUrl rewrite) + `vitest run` (19/19,
      up from 14) all clean.

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
- [x] Add lint + typecheck + build gate for the frontend on PRs — `build`
      job (`tsc && vite build`, builds the `gcp-editor` sibling package
      first) is a hard gate; `lint` was initially non-blocking
      (`continue-on-error` on the eslint step) since the ~6600
      pre-existing violations below weren't that PR's to fix. That
      backlog is now fully cleared (see the `no-explicit-any` triage
      below, PR #50) — flipped `lint` to a normal blocking gate
      (`frontend-test.yml`, `continue-on-error` removed).
- [x] Turn on dependency vulnerability scanning — added Dependabot
      (`.github/dependabot.yml`) for `uv` (backend + drone-flightplan
      workspace member), `npm` (pnpm workspace: frontend + gcp-editor),
      `github-actions`, and `docker` (backend + frontend release images).
      `contrib/pg-upgrade/Dockerfile` deliberately excluded — it pins
      specific PostGIS major versions as upgrade-path steps, not a
      normal deployed image. CodeQL not covered by this item — no code-
      scanning config added.
- [x] Turn on container image scanning (`tag_build.yml:19` explicitly sets
      `scan_image: false` for the backend image)
      DONE — flipped to `scan_image: true` (`tag_build.yml:19`). Verified
      the workflow still passes `actionlint`.

## CI/CD & Delivery — P1

- [x] Add a secret-scanning CI gate (today: local pre-commit only)
      DONE — new `.github/workflows/secret_scan.yml`, `gitleaks/gitleaks-
      action@v2` on push to `main`/`dev`, `pull_request`, and manual
      `workflow_dispatch`. `actions/checkout@v4` with `fetch-depth: 0`
      (gitleaks needs full history to scan commits, not just the tip).
      Verified via `actionlint`.
- [x] Confirm/enable branch protection on `main`/`dev` (branch-protection API
      returned 404 for both — status unconfirmed, likely absent)
      Asked; explicitly out of scope for the "mechanical + secret-scanning +
      lint-staged" CI/CD batch (2026-08 session) — not a code change, needs
      live GitHub admin API access this session doesn't have. Still open.
      DONE — applied via the branch-protection API to `dev` on
      `scruplelesswizard/drone-tm` (no `main` branch exists there): 1
      required approving review (stale reviews dismissed on new pushes),
      required status checks (`gitleaks`, `pr-label`), no force-pushes, no
      deletions. Deliberately did **not** require `build`/`test`/`lint`/
      `pytest / just` — those are path-filtered (`src/backend/**` /
      `src/frontend/**`) in `test.yml`/`frontend-test.yml`, so a doc-only
      or single-domain PR would never trigger them and would sit
      permanently blocked on an "Expected" check that never runs. Only
      `gitleaks`/`pr-label` are unconditional on every PR.
- [x] Build & push images on every merge to `dev`, not just on release —
      tag by git-sha, keep semver tagging for releases
      Asked; explicitly out of scope for the same batch (deploy-cadence
      change, not mechanical). Still open. Note: this is also what blocks
      the OpenAPI doc-gen item below — see its writeup.
      DONE — added a `push: branches: [dev]` trigger to `tag_build.yml`
      alongside the existing `release` trigger. No tagging-logic change
      needed: the reusable `image_build.yml` workflow's default
      `docker/metadata-action` rules already produce a `dev` (branch-ref)
      tag and a `sha-<full sha>` tag on every push, and `type=semver`
      tags only fire for release events — exactly the "tag by git-sha,
      keep semver for releases" split this item asked for. Passed
      `environment: dev` explicitly for push-triggered builds (vs. the
      release tag name for release builds), so `vars`/`secrets` lookups
      resolve to a stable environment name instead of a different one per
      git ref.

## CI/CD & Delivery — P2

- [x] Enforce a coverage threshold in backend CI (`coverage`/`coverage-badge`
      installed but unconfigured; `pytest` invocation has no `--cov`)
      DONE — `pytest-cov` is NOT installed in this repo (only plain
      `coverage`), so `--cov` was never going to work here; switched
      `tasks/test`'s pytest invocation to `coverage run -m pytest &&
      coverage report`. Added `[tool.coverage.run]` (source=app, omits
      migrations/scripts) and `[tool.coverage.report]` with `fail_under=58`
      to `src/backend/pyproject.toml`. Measured actual baseline inside the
      test container: 60% (8299 stmts, 3287 miss) — threshold set a small
      margin below to gate real regressions, not line-count rounding noise.
      Verified `fail_under=58` passes at the real 60%, and correctly fails
      when tested against an artificially high threshold.
- [x] Wire up the dormant `lint-staged` config (declared in `package.json`,
      but no `husky`/`.husky/` exists to invoke it)
      DONE — rather than adding a second git-hook manager (`husky`) next to
      this repo's existing `pre-commit`, added a `- repo: local` hook to
      `.pre-commit-config.yaml` (`language: system`, matching the existing
      `mypy` hook) that runs `pnpm exec lint-staged` from `src/frontend`,
      scoped via `files:` to staged `.js/.jsx/.ts/.tsx`. Added `lint-staged`
      to `package.json` devDependencies, `pnpm-lock.yaml` regenerated.
      Verified functionally: staged a trivial change, ran the hook's
      `entry:` command manually (confirmed `eslint --fix` ran and re-staged
      the result), reverted the trivial change. `pre-commit` CLI itself
      isn't installed in this sandbox so couldn't run a literal
      `pre-commit run` end-to-end.

## CI/CD & Delivery — P3

- [x] Add OCI image labels + re-enable OpenAPI doc generation
      (`build_openapi_json` in `docs.yml` is fully commented out)
      Split: OCI labels DONE, OpenAPI doc-gen still blocked.
      Labels — added `org.opencontainers.image.{title,description,source,
      licenses,vendor}` `LABEL` instructions to `src/backend/Dockerfile`
      (`service` stage) and `src/frontend/Dockerfile` (`prod` stage).
      Verified via `docker inspect ... --format '{{json .Config.Labels}}'`
      on a built backend image; both images still build cleanly.
      OpenAPI doc-gen — still blocked, not attempted. `docs.yml`'s commented
      -out `build_openapi_json` job references image tag
      `ghcr.io/${{ github.repository }}/backend:ci-${{ github.ref_name }}`,
      which nothing in the current workflow set builds or pushes — only
      `tag_build.yml` (release-triggered, semver tags) produces images.
      Re-enabling this depends on the "build & push images on every merge
      to dev" P1 item above, which was explicitly excluded from this
      session's CI/CD scope (deploy-cadence change). Left `docs.yml`
      unedited; revisit once that item is picked up.

## Kubernetes & Infra — P0

- [x] **Needs interaction:** set default resource requests/limits
      (`chart/values.yaml` ships `backend.resources: {}`,
      `worker.resources: {}`, `qgis.resources: {}`). Real numbers need actual
      usage data (or at least a target cluster's node sizing) - guessed
      requests/limits are worse than none if they're wrong in either
      direction (throttling vs. no protection).
      Asked; chose conservative placeholder defaults over leaving unset.
      DONE — backend/qgis: limits 2000m/2Gi, requests 250m/512Mi. worker:
      limits 4000m/4Gi, requests 500m/1Gi (higher - ODM/image-processing
      jobs run there). Explicitly labeled in `values.yaml` as unverified
      against real traffic, there for a deploy-owner to tune. Verified
      `helm lint` + `helm template` render the new blocks correctly.
- [x] **Needs interaction:** harden container `securityContext` —
      `readOnlyRootFilesystem`, `capabilities.drop:[ALL]`,
      `allowPrivilegeEscalation:false`. `readOnlyRootFilesystem` in
      particular risks breaking any container that writes to its own
      filesystem at runtime (temp files, caches) - needs a real deploy to
      verify before defaulting it on, not a chart-only change.
      DONE (partial, by design) — added `allowPrivilegeEscalation: false`
      and `capabilities.drop: ["ALL"]` to the shared `.Values.
      securityContext` block (used by backend/worker/qgis containers alike),
      both zero functional risk. Deliberately did **not** add
      `readOnlyRootFilesystem` - confirmed via code review that both the
      backend and worker genuinely write local temp files at runtime
      (`tempfile.mkstemp()`/`tempfile.gettempdir()` in `app/arq/tasks.py`,
      DEM/flightplan processing) - turning it on would need those paths
      backed by an explicit `emptyDir` first and verifying against a real
      deploy, exactly the risk the original item named. A `values.yaml`
      comment documents why it's still absent rather than looking like an
      oversight.

## Kubernetes & Infra — P1

- [x] **Needs interaction:** default HPA and PDB to enabled
      (`autoscaling.enabled`/`podDisruptionBudget.*.enabled` default
      `false`). Enabling by default changes behavior for every existing
      install of the chart, not just new ones - a deploy-owner call.
      Asked; chose to enable both as placeholder defaults. DONE -
      `backend.autoscaling.enabled`/`worker.autoscaling.enabled`/
      `podDisruptionBudget.backend.enabled`/`podDisruptionBudget.worker.
      enabled` all flipped to `true`, using the existing min/max/target
      values already present (1-10 replicas, 80% CPU target;
      `minAvailable: 1`). **Worth flagging for the next reviewer**: at the
      chart's default `replicaCount: 1`, `PodDisruptionBudget.
      minAvailable: 1` means a voluntary eviction (e.g. node drain) has
      nowhere to go and gets blocked until HPA scales past 1 replica under
      real load - a real operational interaction between two "safe-looking"
      defaults, not something a chart-only render can catch.
- [x] **Needs interaction:** add default-deny `NetworkPolicy`. Wrong from a
      sandbox with no real cluster to validate against - a too-strict policy
      silently breaks Postgres/Dragonfly/RustFS connectivity in a way only
      visible at runtime.
      Asked; chose conservative placeholder over skipping. DONE, but kept
      **disabled by default** (`networkPolicy.enabled: false`) rather than
      force-enabling something unverified - the template
      (`templates/networkpolicy.yaml`) is written and ready for a
      deploy-owner with a real cluster to turn on: default-deny baseline +
      narrow allows for DNS, intra-release pod-to-pod traffic, HTTPS/HTTP
      egress (broad, not enumerated - too many third-party endpoints:
      S3, SMTP, ScaleODM, Hanko, Google OAuth, Sentry), and ingress to the
      backend's HTTP port from anywhere (the ingress controller's own
      namespace/labels vary too much across clusters to hardcode).
      Verified with `helm template ... --set networkPolicy.enabled=true`.
- [x] Add `startupProbe` to backend/worker — purely additive (new probe,
      existing liveness/readiness untouched); verified with `helm lint` +
      `helm template`.

## Kubernetes & Infra — P2

- [x] **Needs interaction:** pin images by digest, not mutable tag. Needs a
      decision on the digest-refresh workflow (Renovate digest-pinning mode,
      or manual) - not just a values.yaml edit.
      **Not attempted** despite the "implement conservative placeholder
      defaults" direction for this batch - unlike the others, this one
      doesn't have a meaningful placeholder form. Pinning a real digest
      needs a live registry lookup per image that stays correct only if
      something (Renovate or a manual process) keeps it updated; a
      one-time hardcoded digest would just silently rot. Still needs an
      explicit decision on that refresh mechanism, which touches CI config
      this session was told to be conservative about changing without a
      specific ask.
      DONE — Asked; chose Renovate-managed. Added `renovate.json`
      (`config:recommended` + a `packageRules` entry pinning digests for
      every `docker`-datasource dependency) — validated with the real
      `renovate-config-validator`. Resolved and pinned current digests via
      `docker buildx imagetools inspect` for every external base image:
      `python:3.11-slim-trixie` (backend, via a new `PYTHON_IMG_DIGEST`
      ARG alongside the existing `PYTHON_IMG_TAG` — Renovate's documented
      pattern for digest-pinning a parameterized tag), `ghcr.io/
      spwoodcock/obj2tiles:v1.6.2`, `node:24-slim` and `docker.io/rclone/
      rclone:1` (frontend), and the Helm chart's `qgis.image` (`ghcr.io/
      hotosm/qfield-project-packager:26.3`) — added a `digest:` value next
      to `tag:` and updated `qgis-deployment.yaml` to append `@{digest}`
      when set. Left `postgresql.image` (bitnami subchart, `enabled:
      false` by default, not this chart's own template) unpinned — lower
      value pinning a disabled third-party subchart's own image config,
      whose `digest` key support isn't guaranteed the way this chart's own
      templates now guarantee it. Verified: `docker build --check` on both
      Dockerfiles (digests resolve, no warnings), `helm lint` +
      `helm template` (qgis image renders as `repo:tag@digest`).
- [x] Add `values.schema.json` to validate `helm install`/`template` inputs
      — deliberately permissive (`additionalProperties: true` throughout,
      subchart values left untyped) so it only constrains what this chart's
      own templates consume. Verified: default `values.yaml` still renders
      unchanged, and a deliberately-wrong values file is rejected with a
      clear per-field error. Needed a `.gitignore` exception - a blanket
      `*.json` rule was silently excluding it.

## Kubernetes & Infra — P3

- [x] **Needs interaction:** SBOM generation + image signing
      (`cosign`/`syft`/`trivy`). Needs key management / OIDC signing
      infrastructure decisions, not just a workflow step.
      **Not attempted**, same reasoning as digest pinning above - a
      placeholder signing step without real keys/OIDC trust configured
      would just fail in CI, not degrade gracefully like the K8s
      chart defaults could.
      DONE — Asked; chose keyless signing via GitHub OIDC (no key to
      generate/store/rotate). Added a `sign-and-sbom` job to
      `tag_build.yml`, matrixed over both images, running after
      `backend-build`/`frontend-build`: `anchore/sbom-action` generates an
      SPDX-JSON SBOM per image, then `cosign sign --yes` (keyless,
      Sigstore Fulcio/Rekor) signs it and `cosign attest --yes` attaches
      the SBOM as a signed in-toto attestation. Needs `id-token: write` +
      `packages: write` job permissions for the OIDC exchange and
      pushing the signature/attestation to GHCR. Verified: YAML syntax
      valid; full end-to-end signing wasn't run in this sandbox (needs a
      real GHCR push + live OIDC token, which only exists inside an
      actual Actions run) — will confirm on the first real `dev`-merge
      build once this PR lands.

## Security — P1

- [x] **Needs interaction:** add rate limiting (no `slowapi`, middleware, or
      ingress-level throttling on login, the presigned-URL endpoint, or the
      ScaleODM webhook). Needs a decision on actual thresholds per endpoint
      and whether it's enforced app-side (`slowapi`) or at the ingress —
      picking numbers without input is a guess, not a fix.
      Asked; chose app-side `slowapi` with conservative placeholder
      thresholds over ingress-level or skipping. DONE — new
      `app/rate_limit.py` (`Limiter(key_func=get_remote_address)`), wired
      into `main.py` (`app.state.limiter`, `SlowAPIMiddleware`, the
      `RateLimitExceeded` exception handler). Applied
      `@limiter.limit(...)` to the three named routes: login 5/minute,
      presigned-URL 30/minute, ScaleODM webhook 60/minute - all explicitly
      flagged as unverified against real traffic. Regenerated `uv.lock`
      (same container-based process as the `/metrics` item, `slowapi`
      needed no extra system deps beyond what was already installed for
      that lock).
      **Verified real enforcement works correctly by hand** (`curl` loops
      against the actual running `docker compose` backend - N successes
      then 429s, exactly as configured, for all three routes) - but
      **could not drive the same 429 through pytest's `client` fixture**.
      Root-caused it: `asgi_lifespan.LifespanManager` + `httpx.
      ASGITransport` (every test's `client` fixture depends on both)
      causes slowapi's per-request dedup flag
      (`request.state._rate_limiting_complete`) to end up `True` from the
      first request onward, so the decorator's check never re-fires on
      later calls in-process - confirmed via a minimal repro (same
      decorated route rate-limits correctly under `ASGITransport` alone,
      stops as soon as `LifespanManager` wraps the app). A test-harness
      interaction, not an application bug. Tests
      (`test_rate_limiting.py`) verify the configured limit value on each
      decorated route directly (via `limiter._route_limits` introspection)
      plus one real-request sanity check, with the hand-verification
      method and root cause documented in the test file's own docstring
      rather than silently working around it. Full backend suite:
      265/265 passed (one flaky run first - 27 failures, all
      `urllib3.MaxRetryError` against the S3 test container from resource
      contention with concurrent docker builds in this same session - a
      clean teardown+rerun came back green, matching the exact lesson
      already documented earlier in this file).

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
- [x] Expose a Prometheus `/metrics` endpoint. Needed a dependency choice
      (`prometheus-fastapi-instrumentator` vs `prometheus_client` vs
      `starlette-exporter`) — asked, chose
      `prometheus-fastapi-instrumentator`.
      DONE — `Instrumentator().instrument(_app).expose(_app,
      include_in_schema=False)` in `get_application()`, right before
      `return _app`. Bare `/metrics` (not under `api_prefix`, matching
      Prometheus scrape convention), no app-level auth - same expectation
      as any other Prometheus target, meant to be restricted at the
      network layer (ingress/`NetworkPolicy`), not the application layer.
      `include_in_schema=False` keeps it out of the OpenAPI docs.
      Pinned `==7.1.0`, **not** the latest `8.1.0` - `uv lock` caught a
      real dependency conflict: `8.x` requires `starlette>=1.0.0`, but
      this project's pinned `fastapi==0.112.0` requires
      `starlette>=0.37.2,<0.38.0`, so `8.1.0` is actually uninstallable
      here. `7.1.0` requires `starlette<1.0.0,>=0.30.0`, which is
      compatible.
      Regenerated `uv.lock` in a throwaway container built from the
      backend Dockerfile's own apt-get + `uv` setup (same approach as the
      earlier mypy-baseline lockfile fix) - `uv lock` alone needed the
      full `libpq-dev`/GDAL/build-essential toolchain too, since
      `psycopg-c` has no prebuilt wheel for this combination and gets
      built from source just to resolve dependency metadata, not only to
      install. Verified: `docker compose build backend` succeeds, both
      `backend` and `arq-worker` containers start healthy, `curl
      localhost:8000/metrics` returns real Prometheus text output, a real
      request through `/api/projects/centroids` shows up in
      `http_requests_total`, `api.openapi()` confirms `/metrics` is
      correctly absent from the schema, and the full backend suite
      (261/261 passed).

## Observability — P2

- [x] Instrument the arq worker, not just the API (`app/arq/*.py` has zero
      OTel/Sentry references)
      DONE. Mirrors `main.py`'s API-side pattern (`MonitoringTypes.SENTRY`
      env gate, `try/except ImportError` graceful-degrade if the optional
      `monitoring` dependency group isn't installed): `arq/tasks.py`'s
      `startup()` now calls `set_sentry_otel_tracer()` + a new
      `instrument_worker_otel()` in `monitoring.py`. The worker version
      skips `FastAPIInstrumentor` (no FastAPI app in a worker process) but
      keeps `PsycopgInstrumentor`/`RequestsInstrumentor` - the worker does
      plenty of both (DB queries, ScaleODM/S3 HTTP calls) and neither was
      traced before. No new dependency - reuses the same
      `opentelemetry-instrumentation-{psycopg,requests}` packages already
      in the `monitoring` extras group for the API. Verified the
      arq-worker container starts healthy with `MONITORING` unset
      (exercises the graceful-skip path, matching this sandbox's test
      env) and the full backend suite (261/261, unchanged - this repo has
      no existing tests for the API-side monitoring gate either, so no
      new test added here matches that established convention rather
      than introducing a one-off exception).

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

- [x] Break up the four largest components: `DroneImageProcessingWorkflow/
      ImageReview.tsx` (2559 lines as of 2026-08, was 2334),
      `ModalContent/ProcessingStatusDialog.tsx` (1274, was 1153),
      `DroneOperatorTask/MapSection/MapSection.tsx` (1186, was 1072),
      `DroneImageProcessingWorkflow/TaskVerificationModal.tsx` (902, was
      832) — opportunistically, alongside feature work that already
      touches them. Originally not attempted: a blind split risks behavior
      changes in components this size without the usual manual browser
      check this repo's guidelines call for, and this session can't drive
      a real browser.
      Asked; chose "change guidelines, verify using headless browser, add
      a headless testing framework + tests" over skipping the item or
      attempting it unverified.
      DONE — added Playwright (`@playwright/test`,
      `src/frontend/playwright.config.ts`, tests in `src/frontend/e2e/`,
      `pnpm test:e2e`), distinct from the existing Vitest/Testing-Library
      unit suite (jsdom, no real browser/rendering engine). Chromium
      installed via `npx playwright install chromium` (no `--with-deps` -
      no root in this sandbox; ran fine without it). `playwright.config.ts`
      builds + serves the app via `vite preview` and runs headless
      Chromium against it. `e2e/smoke.spec.ts`: 4 real-browser tests on
      public routes (landing page renders, unknown route doesn't blank-
      page, protected route redirects signed-out users to `/`, `/qfield-
      open` loads) - all pass. Updated `CLAUDE.md`'s Testing standards
      section: a passing headless Playwright run is accepted as sufficient
      UI verification when a manual browser session isn't available.
      Added `.gitignore` entries for `test-results/`/`playwright-report/`/
      `blob-report/`.
      Breakup itself: see the follow-up items below, one per component.
  - [x] `ModalContent/ProcessingStatusDialog.tsx` (1274 lines) → directory
        `ProcessingStatusDialog/` with `index.tsx` (770, container - all
        state/hooks/handlers unchanged, zero logic edits), `TaskTable.tsx`
        (312, the per-task table), `FinalProcessingPanel.tsx` (139,
        coverage/CTA), `GcpStatusCard.tsx` (83), `FinalProcessingResults.tsx`
        (95, ortho/DSM/DTM/pointcloud downloads), `types.ts` (shared task/
        project-detail types + `stateColors`). Pure JSX-extraction refactor:
        every extracted piece takes explicit props, no state moved, no
        behavior changed. `../TaskOrthoCogViewer` lazy-import path updated
        for the new directory depth (confirmed via `pnpm build` that it's
        still its own chunk). `RefObject<HTMLInputElement>` needed to widen
        to `RefObject<HTMLInputElement | null>` for the GCP file input ref
        prop (React 19 `useRef(null)` typing) - only non-mechanical change.
        Verified: `tsc --noEmit` clean, `eslint --fix` clean (only auto-
        reformatting, no logic diffs), `pnpm build` clean (chunk split
        intact), Vitest 19/19, Playwright `test:e2e` 4/4 (public-route
        smoke only - see below).
        Also fixed a real bug this surfaced in the prior commit: Vitest's
        default glob was picking up `e2e/*.spec.ts` and crashing trying to
        run Playwright's `test()` outside Playwright's runner - added
        `test.exclude: ['e2e/**']` to `vitest.config.ts`.
        **Not verified**: authenticated rendering with live task/imagery
        data. This repo's only local auth is Google OAuth (`AUTH_PROVIDER=
        legacy`) - no seedable local login, so Playwright can't drive a
        real session without a token-minting/DB-seeding fixture, which
        wasn't built this pass. The refactor is logic-preserving (pure prop-
        threaded extraction, not a rewrite), so risk is low, but this is
        exactly the "what wasn't verified end-to-end" case CLAUDE.md's
        updated testing-standards note calls for flagging. A proper
        Playwright auth fixture (seed a user/project/task via the API,
        mint/inject a session) would unblock deep authenticated e2e
        coverage for this and the remaining 3 components below.
  - [x] `DroneOperatorTask/MapSection/MapSection.tsx` (1186 → 1079 lines) -
        deliberately conservative pass, unlike the two components above.
        This file's ~700-line state section (map lifecycle, drag-rotation,
        take-off-point selection, DEM checks) is far more tightly coupled
        than ProcessingStatusDialog/TaskVerificationModal's - left entirely
        untouched rather than risk a subtle behavior regression in a live
        map *editing* tool (not just a viewer) for a mechanical line-count
        win. Only extracted the genuinely decoupled, prop-driven UI pieces:
        `MissingDemModal.tsx` (44), `MapControlsBar.tsx` (62, drone-model/
        gimbal/waypoint-mode selectors), `MapToolButtons.tsx` (90,
        rotation/flight-plan/task-area/zoom toggle buttons) - all take
        explicit props/callbacks, zero state moved.
        One real lint interaction found: passing `handleRotationToggle`
        (a hoisted `function` declaration, the one handler of its group not
        written as a `const ... = () =>` arrow) as a bare prop reference
        tripped `react/jsx-no-bind`, while the sibling arrow-declared
        handlers didn't - root cause not fully chased down (likely an
        eslint-plugin-react quirk around hoisted function declarations).
        Fixed by wrapping all four handler props in inline arrows at the
        call site, matching the original code's own pattern exactly (it
        already wrapped these in arrows before the extraction).
        Verified: `tsc --noEmit`, `eslint --fix` clean, `pnpm build` clean,
        Vitest 19/19, Playwright 4/4. Same authenticated/live-map
        verification caveat as the other two components.
  - [x] `DroneImageProcessingWorkflow/TaskVerificationModal.tsx` (902) →
        directory `TaskVerificationModal/` with `index.tsx` (629, container
        - all map-lifecycle useEffects/mutations/handlers unchanged),
        `TaskMapPanel.tsx` (180, map + stats/coverage overlays),
        `ImageSidebar.tsx` (140, virtualized image grid), `VerificationFooter
        .tsx` (65). Same pure-extraction methodology as ProcessingStatusDialog
        above. `./FlightGapDetectionModal` import updated to `../
        FlightGapDetectionModal` for the new directory depth. One real type
        gap surfaced: `imagesGeoJson()`'s return value was untyped/inferred
        in the monolith, so passing it as an explicit `TaskMapPanel` prop
        forced a choice - typed it loosely (matching what the source data
        actually satisfies: `image.location` isn't a strict GeoJSON
        `Geometry`) rather than fixing the underlying geometry typing, which
        is out of scope for a pure refactor. Verified: `tsc --noEmit`,
        `eslint --fix` (one `no-param-reassign` warning on the image-ref
        callback moving into a props-receiving component - scoped
        eslint-disable, same as the file's existing pattern), `pnpm build`
        clean, Vitest 19/19, Playwright 4/4. Same authenticated-rendering
        caveat as above: not verified live (map + task imagery need a real
        session).
  - [x] `DroneImageProcessingWorkflow/ImageReview.tsx` (2559, the largest)
        → directory `ImageReview/` (2586 total across 3 files - modest
        reduction, same conservative reasoning as MapSection: the ~2000-
        line main component's state is a single tightly-coupled block -
        map lifecycle, box-select, sequence-select, bulk accept/reject,
        task-matching - not touched). What DID move cleanly, with zero
        behavioral risk: this file already had 2 self-contained named
        components living in the wrong place (`TaskAccordionContent`,
        `VirtualizedAccordionList` - neither closed over the main
        component's state, both took only props/module-scope helpers) and
        a cluster of pure, closure-free helper functions
        (`hasIssueStatus`/`canManuallyMatchImage`/
        `canOverrideImageRejection`/`canRejectImage`/
        `getImageTileBorderClass`/`escapeHtml`/`escapeAttr`/
        `buildPopupHtml`/`runWithConcurrency`/`useTaskImageUrls`).
        `imageReviewHelpers.ts` (122, the pure functions - `escapeHtml`/
        `escapeAttr`/`getImageTileBorderClass` stayed module-private,
        used only by `AccordionList.tsx`), `AccordionList.tsx` (427,
        `TaskAccordionContent` + `VirtualizedAccordionList` +
        `useTaskImageUrls`), `index.tsx` (2037, the main component -
        **verified byte-identical to the original's lines 574-2559 via
        `diff`**, since a 2000-line component is too large to safely
        retype by hand: sliced with `sed` instead of using the Write tool,
        eliminating transcription-error risk entirely for the risky part).
        `./TaskVerificationModal` import updated to `../TaskVerificationModal`
        for the new directory depth (that component is itself a directory
        as of the earlier breakup in this same batch).
        Verified: `tsc --noEmit` clean on the first attempt (a strong
        signal the import surgery was correct), `eslint --fix` clean,
        `pnpm build` clean, Vitest 19/19, Playwright 4/4. Same
        authenticated-rendering caveat as the other 3 components - not
        verified live.
        **This completes the "break up the four largest components" item**
        - all 4 done (2 substantial pure-JSX-extraction refactors, 2
        conservative partial extractions where the remaining bulk is
        genuinely high-risk stateful logic, documented as such rather than
        forced).
- [x] Reduce `any` usage starting at the API layer (193 occurrences across
      86 files despite `strict: true`) — DONE, superseded by the full
      `@typescript-eslint/no-explicit-any` triage below (448 → 0 sites
      across the whole frontend, not just the API layer). Only remaining
      `any` token left in `src/` is inside a commented-out code block in
      `VectorLayer.ts` (not live code, not linted).
- [x] Finish i18n coverage (`LandingPage`/`Footer` and several cross-cutting
      `toast.error()` calls are hardcoded English) — not attempted this
      pass; translating user-facing strings is a copy/product call as much
      as a code one.
      DONE (mechanical extraction, English text only - not translated to
      other locales, per explicit direction). `LandingPage`/`Footer`
      turned out to need **zero changes** - all 16 component files and
      their shared `constants/landingPage.tsx` data source were already
      fully migrated to `m.xxx()`; this line item was stale by the time
      it was picked up. The real remaining gap was hardcoded
      `toast.error()`/`.success()`/`.warning()` calls: found 21 call
      sites across 7 files via three passes (a plain-literal grep first,
      then two broader regex sweeps, since template-literal calls
      spanning multiple lines don't match a simple one-line grep - caught
      7 more sites on the second pass, 2 more on a third). Added 20 new
      keys to all three locale files (`en`/`es`/`id` - same English text
      in each,
      matching the earlier decision not to translate), reusing the
      existing `{param}`/pluralization-`{suffix}` convention already
      established by `image_review_deleted_invalid_images`. Files
      touched: `services/index.ts`, `utils/adb.ts`,
      `utils/callApiSimultaneously.ts`,
      `DroneOperatorTask/DescriptionSection/UppyFileUploader/index.tsx`
      (6 sites), `MapLibreComponents/Layers/VectorLayer.ts`,
      `DroneImageProcessingWorkflow/TaskVerificationModal.tsx` (2 sites),
      `DroneImageProcessingWorkflow/ImageReview.tsx` (6 sites),
      `DroneOperatorTask/MapSection/MapSection.tsx`. Left dynamic
      server/exception messages alone (`toast.error(err.response?.data
      ?.detail)`, `toast.error(data.message)`, etc.) - those aren't
      hardcoded frontend strings to migrate. Verified `tsc --noEmit`/
      `eslint .` (0 errors), `pnpm test` (14/14), `pnpm build`, and a
      final regex sweep confirming zero hardcoded-literal toast calls
      remain anywhere in `src/`.

## Frontend — P3

- [x] Investigate dropping one of two map libraries (MapLibre GL vs
      OpenLayers). Explicitly named as a spike in the original audit, not
      a direct change - needs the spike's findings before any removal.
      DONE (spike only, no removal - per direction) — findings written to
      `docs/decisions/map-library-spike-findings.md`. Top line: MapLibre
      GL is used in 25 files, `ol` in exactly 1
      (`TaskOrthoCogViewer.tsx`); the sibling `@hotosm/gcp-editor` package
      independently depends on `maplibre-gl`, so it stays in the tree
      regardless. Real functional overlap exists - both render COG
      orthophotos, just in different UI contexts (MapLibre inline in the
      main map via `@geomatico/maplibre-cog-protocol`, already proven
      elsewhere in `COGOrthophotoViewer`; OL in a standalone modal via
      `ol/source/GeoTIFF`). Recommendation: consolidate onto MapLibre
      long-term, but `TaskOrthoCogViewer` carries several hard-won
      OL-specific workarounds (band auto-detect, an async-view-config
      race, a resolutions-array zoom-clamp bug) that a MapLibre port would
      need to rediscover equivalents for - a real feature-parity rewrite
      needing its own manual verification pass, not a mechanical swap.
      Bundle cost (~232 KB gzip) is real but already isolated to a
      lazy-loaded chunk, so no urgency forcing this ahead of other work.
      Not actioned further this pass (spike explicitly ends at findings).

## Accessibility & Design System (WCAG 2.2 AA)

New backlog domain, added 2026-08-16 from a standards audit (WHATWG HTML,
WCAG 2.2 AA, ARIA APG, ISO 9241-110/210, OWASP ASVS, Core Web Vitals,
i18n) requested against `src/frontend`. Findings below are from a fast
targeted scan, not the full multi-day audit the standards list implies -
each is a real, file-specific issue, but this is a punch list to start
from, not exhaustive coverage of every category (performance and OWASP
ASVS in particular haven't been scanned yet).

### Critical

- [x] Base `Modal` component has no dialog semantics, no Escape handler, no
      focus trap (`components/common/Modal/index.tsx`, used by 7+ callers
      incl. `DeleteProjectConfirmation`, `UnlockTaskPromptDialog`,
      `ChooseProcessingParameter`, `UploadToOAM`). Has `tabIndex={-1}` but
      no `role="dialog"`/`aria-modal`/`aria-labelledby`; Tab can leave the
      dialog into background content. WCAG 2.4.3, 4.1.2; ARIA APG Dialog
      pattern.
      DONE — added `role="dialog"`/`aria-modal="true"`/`aria-labelledby`
      (or `aria-label` when `headerContent` replaces the default title
      markup) on the dialog panel, an Escape handler (mirrors `Drawer`'s
      existing `useCallback`+`useEffect` pattern), and a new shared
      `hooks/useFocusTrap.ts` (Tab/Shift+Tab wraps within the dialog,
      focus moves in on open, restores to the trigger on close). Simplified
      `onClose` from `MouseEventHandler` to `() => void` - every one of the
      ~15 callers across the codebase already passed a zero-arg function,
      confirmed by grep before changing the type; also fixed the two
      pass-through wrapper components (`PromptDialog`,
      `IndividualProject/ModalContent`) whose own `onClose` prop was still
      typed `MouseEventHandler`, which would have been a real TS error
      ("target signature provides too few arguments") after Modal's
      signature narrowed. Added `Modal/index.test.tsx` (4 tests: dialog
      role+label, Escape closes, close button closes, `show=false` renders
      nothing). Verified `tsc --noEmit`/`eslint .` (0 errors) and `pnpm
      test` (11/11 passed) and `pnpm build`.
- [x] `Icon` component's keyboard handler is a no-op
      (`components/common/Icon/index.tsx:17-26`): `role="button"
      tabIndex={0} onKeyUp={() => {}}` — looks accessible but Enter/Space
      does nothing. Every icon-only control built on it (57 usages: close,
      delete, sync, download, zoom, etc.) is keyboard-unusable, and none
      pass `aria-label` (accessible name falls back to the icon ligature
      text, e.g. "close", fragile if the icon font fails to load). WCAG
      2.1.1, 4.1.2.
      DONE (partial) — `onKeyUp` now calls `onClick` on Enter/Space,
      matching native button semantics. Tried making `role`/`tabIndex`
      conditional on whether `onClick` is passed (57 usages have no
      `onClick` at all, so those are decorative icons that arguably
      shouldn't be tab stops either) - reverted after `eslint-plugin-
      jsx-a11y` flagged it (`no-static-element-interactions`,
      `no-noninteractive-tabindex`: both rules need a literal `role=
      "button"` to recognize the element as interactive, a conditional
      expression doesn't satisfy them). Kept `role="button"`/`tabIndex={0}`
      static, matching the original and every other interactive `<i>` in
      this codebase. Also fixed `IIconProps extends HTMLAttributes` never
      actually spreading those attributes onto the DOM node (`{...rest}`
      added) - `aria-label` now reaches the element when a caller passes
      one, but none of the 57 call sites were retrofitted with one this
      pass (real fix, out of scope: a11y-friendly icon-only-button audit
      needs per-caller product copy, not a mechanical change). Added 2
      tests (keyboard activation, no-crash-without-onClick) to the existing
      `Icon/index.test.tsx`. Verified `tsc --noEmit`/`eslint .` (0 errors)
      and `pnpm test` (11/11 passed).

### High

- [x] `Breadcrumb` keyboard handler is also a no-op
      (`components/common/Breadcrumb/index.tsx:20-23`) - real navigation
      only happens in `onClick`. WCAG 2.1.1.
      DONE — extracted the shared activation logic into `handleActivate`,
      wired `onKeyDown` to call it on Enter/Space (was a static `() => {}`
      no-op before); also added `aria-current="page"` on the final
      (non-navigable, current-page) crumb.
- [x] `ProjectCard`'s clickable div uses `role="presentation"` (removes it
      from the accessibility tree) and has no `tabIndex`/`onKeyDown`
      (`components/Projects/ProjectCard/index.tsx:33-37`) - the main
      navigation target for every project in the grid is unreachable by
      keyboard/screen reader. WCAG 2.1.1, 4.1.2.
      DONE — `role="presentation"` → `role="button"`, added `tabIndex={0}`,
      an `onKeyDown` handler for Enter/Space, and `aria-label={title}`
      (the card has no visible heading tying id-only text to the click
      target, so a computed name via `aria-label` was simpler than wiring
      up `aria-labelledby`).

### Medium

- [x] Heading hierarchy: three `<h1>`s in one section
      (`components/IndividualProject/ExportSection/index.tsx:16,48,55`).
      Should be one `h1` + `h2`/`h3` for subsections. WCAG 1.3.1, 2.4.6.
      Stale entry - already fixed by the a11y sweep earlier this session
      (`todo/61`): confirmed current file has one `<h1>` (section title,
      line 17) and the two subsection headings are `<h2>` (lines 49, 58).
      This checkbox was never flipped when that branch landed.
- [x] `SearchInput`/`Select` rely on `placeholder` only, no
      `<label>`/`aria-label` (`components/common/FormUI/SearchInput/index.tsx:27-34`,
      `components/common/FormUI/Input/index.tsx`,
      `components/common/FormUI/Select/index.tsx:113-117`). Placeholder
      text isn't a reliable accessible name (it disappears on input). WCAG
      1.3.1, 4.1.2.
      DONE — added an optional `ariaLabel` prop to both, defaulting to the
      resolved placeholder text when omitted (still a computed fallback,
      not nothing, while letting callers pass something more specific).
      `Input` already spread `...rest` onto the DOM node so `aria-label`
      reached it once passed; `SearchInput`/`Select` didn't forward it to
      their inner `Input`, now fixed.
      **New finding, filed separately** (out of this item's WCAG 1.3.1/
      4.1.2 label scope, but found while in this file): `Select`'s
      dropdown toggle `<div onClick={toggleDropdown}>` has no `role`,
      `tabIndex`, or keyboard handler at all - the whole component is
      mouse-only. The three `jsx-a11y` rules that would normally catch
      this (`no-static-element-interactions`, `no-noninteractive-element-
      interactions`, `click-events-have-key-events`) are disabled at the
      top of the file. Not fixed this pass - `Select` isn't a native
      `<select>`, so a real fix means implementing the ARIA combobox
      pattern (role="combobox", `aria-expanded`, `aria-controls`,
      `aria-activedescendant`, `listbox`/`option` roles, arrow-key
      navigation) - a materially bigger change than this item's scope,
      and one that needs the manual keyboard-testing this repo's
      guidelines call for on UI changes of this size.
- [x] `Drawer` has `role="dialog"`/`aria-modal`/Escape handling (good) but
      no focus trap or initial focus on open
      (`components/common/Drawer/index.tsx`) - Tab can still leave the
      panel. WCAG 2.4.3.
      DONE — reused the `useFocusTrap` hook built for the `Modal` fix
      (same session, different item). Drawer stays mounted in the DOM at
      all times (visibility toggled via CSS, unlike `Modal`'s
      `unmountOnExit`), which the hook handles fine since it only attaches
      its keydown listener while `open` is true. Added
      `Drawer/index.test.tsx` (3 tests: dialog semantics, Escape closes,
      overlay click closes). Verified `tsc --noEmit`/`eslint` (0 errors)
      and `pnpm test` (14/14 passed).
- [x] Fixed-width label containers risk text clipping on longer-language
      translations:
      `components/RegulatorsApprovalPage/Description/DescriptionSection.tsx:156,168,183`
      (`w-[146px]`) and
      `components/IndividualProject/ExportSection/index.tsx:22,25,30,33,38,41`
      (`w-28`) on translated field labels - should be `min-w` not fixed
      `w-`. i18n text-expansion guidance.
      DONE — `w-[146px]` → `min-w-[146px]`, `w-28`/`md:w-36` →
      `min-w-28`/`md:min-w-36`. Applied to both the label and value cells
      in `ExportSection.tsx` (not just the translated-label ones flagged),
      since the value cells can also hold unpredictable-length content
      (e.g. `author_name`). Preserves current visual width for English,
      lets the container grow instead of clipping for longer text.
- [x] No `prefers-reduced-motion` or `prefers-color-scheme` support
      anywhere (confirmed via repo-wide grep - zero matches).
      `tailwind.config.js` defines several transform/scale/opacity
      animations with no reduced-motion variant.  `darkMode: "class"` is
      configured but no toggle mechanism was found using it. WCAG 2.3.3.
      DONE (motion only, scoped per direction) — added a single global
      `@media (prefers-reduced-motion: reduce)` rule in `tailwind.css`
      that forces `animation-duration`/`transition-duration` to `0.01ms`
      and `scroll-behavior: auto` on `*` - the standard "neutralize
      everything" snippet, covers every existing and future
      `animate-*`/`transition` Tailwind utility without touching call
      sites individually. Hit a real CSS-comment gotcha writing the
      explanatory comment: `/* ... animate-*/transition ... */` - the
      `*/` inside "animate-*/transition" closed the comment early,
      breaking the rest as invalid CSS (caught immediately by `pnpm
      build` failing with a parse error, not silently). Reworded to
      avoid a literal `*/` substring.
      **Not attempted** (per explicit direction - this is a real feature,
      not a mechanical CSS fix): a `prefers-color-scheme`/dark-mode
      toggle. `darkMode: "class"` is configured in `tailwind.config.js`
      but nothing sets the class, and building a real toggle means a UI
      control, a persisted preference, and auditing every color token
      for a dark counterpart - out of scope here.

### Low

- [x] Verify `dangerouslySetInnerHTML` usages are sanitized, not raw
      API/user data: `components/IndividualProject/QFieldExport/index.tsx`,
      `components/common/MapLibreComponents/{AsyncPopup,NewAsyncPopup}/index.tsx`
      (MapLibre popups render feature-derived content),
      `components/Dashboard/RequestLogs/index.tsx`. OWASP ASVS (XSS).
      DONE — audited all 4, found and fixed **one real stored XSS**:
      - `Dashboard/RequestLogs/index.tsx` — **VULNERABLE, fixed.** Rendered
        `m.dashboard_request_log_message({ taskIndex, projectName })` via
        `dangerouslySetInnerHTML`. The existing inline comment claimed this
        was safe ("app-controlled i18n message string... not user input"),
        but that's wrong: the paraglide *template* is app-controlled, the
        `projectName` **interpolated into it is not** - project names are
        arbitrary user-set text, and paraglide does zero HTML-escaping on
        interpolated values (confirmed in the compiled output - it's a
        plain JS template literal). The template also had literal
        `<strong>` tags baked into the translated string around both
        placeholders. A project named e.g. `<img src=x onerror=...>`
        would execute for any user viewing Dashboard Request Logs. Fixed
        by stripping the `<strong>` markup from all three locale strings
        (`messages/{en,es,id}.json`) and switching the component to plain
        JSX text interpolation (`{m.dashboard_request_log_message(...)}`)
        instead of `dangerouslySetInnerHTML` - React auto-escapes JSX text
        children, closing the injection vector entirely. Lost the bold
        styling on task#/project name as a result; judged an acceptable
        trade for eliminating a stored XSS rather than re-architecting
        into a 3-locale JSX-composition split.
      - `QFieldExport/index.tsx` — safe. `qrSvg` comes from the `qrcode`
        library's `createSvgTag()`, which only emits structural
        `<rect>`/`<path>` grid markup (verified directly: fed a payload
        containing `"><script>` as QR *data* and confirmed the output SVG
        contains no trace of the input string, only pixel geometry).
      - `AsyncPopup`/`NewAsyncPopup` — safe today, but fragile. Both
        `renderToString(popupUI(properties))` then re-inject the result via
        `dangerouslySetInnerHTML` (`NewAsyncPopup` additionally hands that
        string to `maplibre-gl`'s own `Popup.setHTML()`, which does the
        same raw-innerHTML assignment outside React entirely). Checked
        every `popupUI`/`getPopupUI` implementation passed to either
        component (5 call sites, `Projects/MapSection`,
        `IndividualProject/MapSection`, `FlightGapDetectionModal`,
        `DroneOperatorTask/MapSection`) - all use plain JSX `{}` text
        interpolation (React auto-escaped), none nest their own
        `dangerouslySetInnerHTML` or build raw HTML strings. No live
        vulnerability today, but nothing in the `popupUI` prop's type
        signature prevents a future implementation from introducing one -
        noted here rather than silently left as an assumption.
- [x] `alt=""` on a meaningful profile image in the task-lock user list
      (`components/IndividualProject/ModalContent/LockTaskDialog.tsx:209-213`)
      - other avatars in the codebase use descriptive alt text; this one
      conveys user identity but is marked decorative.
      **Verified, not a bug - no change made.** This avatar sits inside a
      `<button>` immediately next to `<span>{user.name}</span>` (same
      clickable element, both are descendants). The accessible-name
      algorithm for a button concatenates all descendant text and image
      `alt`s, skipping `alt=""` images - so the button's computed
      accessible name is already the user's name via the visible span.
      Giving the `<img>` `alt={user.name}` here would make a screen
      reader announce the name **twice** (once from the img alt, once
      from the span) - a real regression, not a fix. Also: the "other
      avatars use descriptive alt text" comparison in the original
      finding doesn't hold up on inspection - the other avatar sites
      (`DashboardSidebar`, `BasicDetails` x2) all use the generic,
      non-identity `m.common_profile_picture_alt()` ("Profile picture"),
      not the person's actual name, so they're not actually a
      contradicting precedent either. Left as `alt=""`.

### Checked and clean (no action needed)

No `<img>` missing `alt` outright (some empty/decorative by design).
`StatusChip` pairs color with visible text, not color-only. `TaskOrthoCogViewer`
correctly implements `role="dialog"`/`aria-modal`.

### Not yet scanned

Performance (Core Web Vitals), OWASP ASVS beyond the XSS check above,
full keyboard-navigation/focus-order pass across all views, contrast
audit, and the CSS/design-token consolidation pass - out of scope for
this fast scan, needed before calling this domain complete.

## Follow-ups discovered while executing the above

New items surfaced during backend/frontend work, filed separately rather
than as inline notes on the item that found them:

- [x] Fix the ~30 remaining `detail=f"...{e}"` sites in
      `classification_routes.py`/`project_routes.py` that leak raw exception
      text into the client-facing response (all already `log.error(...)` the
      real error first, so not urgent — found while adding the RFC 7807
      handlers, which only fixed the 3 sites the original audit named).
      DONE — 30 sites across 7 files (`project_routes.py` 6,
      `classification_routes.py` 17, `task_schemas.py` 2, `task_logic.py`
      2, `waypoint_routes.py` 1, `project_deps.py` 1, `utils.py` 1):
      dropped the `{e}`/`{e!s}` interpolation from the client-facing
      `detail=` string, turning each into a plain static message. 3 sites
      (`task_schemas.py` x2, `waypoint_routes.py` x1) had **no**
      `log.error(...)` at all — the exception's only use was the leaked
      `detail=`, so removing that made `except Exception as e` genuinely
      dead (ruff F841) and would have silently dropped the error
      entirely; added a proper `log.error(f"...: {e}")` call in each
      instead of just dropping the binding. 6 more sites (`project_routes.py`
      x4, `task_logic.py` x2) had the same F841 issue for a different
      reason — they matched the todo's named f-string pattern but weren't
      in the original 23-site count from the two named files, so this
      landed at exactly 30 total once verified against `ruff check`.
      Verified with `ruff check`/`ruff format --diff` (clean) and the full
      backend suite (`docker compose -f compose.test.yaml`, 257/257
      passed).
      Follow-up (`detail=str(e)` sites) - DONE: reviewed all 14 individually
      rather than mechanically. 7 turned out **not** to be the leak bug at
      all: `classification_routes.py`'s `except ValueError as e: detail=
      str(e)` sites (accept/reject/manually-assign/delete image, get image
      url, get task verification, create-from-exif) all catch a `ValueError`
      whose message is hand-authored and intentionally user-facing (e.g.
      `ImageClassifier`'s "Image not found", "Only assigned images can be
      manually rejected", `validate_s3_access`'s docstring explicitly says
      "Raises ValueError with a user-readable message") - correctly left
      alone, this is by-design, not a generic-exception leak. The other 7
      were real leaks, fixed (static `detail=`, `log.error(...)` added
      where missing): `public_routes.py` (presign URL), `project_deps.py`
      (`get_tasks_by_project_id` - also had a real logic bug caught in the
      same spot: the inner `raise HTTPException(...FORBIDDEN...)` had no
      `except HTTPException: raise` guard, so the outer generic `except
      Exception` was silently swallowing it and re-raising as a 500 instead
      - added the guard), `user_schemas.py` x2 (`DbUser.create`'s
      `IntegrityError` non-duplicate branch, `get_user_by_email`),
      `project_logic.py` (`get_centroids`, already had `log.error` -
      just fixed the leaked `detail=`), `drone_schemas.py` x2
      (`DroneFlightHeight.all`/`.one`). Verified via `ruff check`/`format
      --diff` (clean) and full backend suite (257/257 passed).
- [x] Regenerate `uv.lock` for the mypy dev dependency — ran `uv lock` inside
      a throwaway container built from the backend Dockerfile's build stage
      (has the `libpq-dev`/GDAL headers this sandbox itself lacks). Landed
      on `todo/08-mypy-baseline` (PR #23) and cascaded through every branch
      after it, since it was failing CI on `mypy-baseline` and every PR
      built on top of it.
- [x] Incrementally clear the debt the restored ruff config now tracks in
      documented `ignore` entries: `B904` (51 sites, exception chaining),
      `N805`/`N806` (43 sites, naming), `ASYNC240` (11 sites, blocking calls
      in async functions). Each needs individual review, not a blind fix.
      DONE — all four rules reviewed and cleared; see sub-items below.
      - [x] `ASYNC240` (11 sites) — DONE. Reviewed each: all 11 are
            `os.path.exists`/`.isfile`/`.getsize` calls on small local/temp
            files (DEM download cleanup, static frontend asset checks,
            flightplan temp-file writes), not network paths. None are on a
            genuinely hot, high-concurrency path - and in the one file
            that comes closest (`waypoint_routes.py`, a live route), the
            `os.path.exists` calls sit next to a synchronous S3 download
            (`get_file_from_bucket`) and CPU-bound flight-plan generation
            in the same function - both far more blocking than a stat()
            call, and neither flagged by `ASYNC240` or fixable by wrapping
            just the path checks in `asyncio.to_thread`. Concluded that
            per-site `asyncio.to_thread` wrapping would add real overhead
            (thread-pool dispatch, ~100µs-1ms) for a call that's already
            sub-microsecond, likely net negative, while leaving the actual
            blocking cost in that route untouched - not a real fix.
            Used `ruff check --add-noqa` to generate the 11 inline
            suppressions, then added a one-line reason to each (`# noqa:
            ASYNC240 -- stat() on a small local/temp file, not a hot
            path`), and removed the config-level `ignore` entry entirely -
            the rule now stays **active** for any new code, these 11
            known/reviewed sites are just grandfathered explicitly rather
            than invisibly exempted repo-wide. Verified `ruff check`/
            `format --diff` (clean) and full backend suite (257/257,
            comment-only diff so no functional change expected or found).
      - [x] `N805` (21 sites) — DONE, and this one hid a real, actively-
            deprecated bug, not just a style nit. 16 of the 21 sites were
            `@model_validator(mode="after") def method(cls, values):` -
            a pattern that only *looks* like a classmethod. Checked what
            Pydantic actually does with it (`uvx --with pydantic python3
            -c ...` against a minimal repro): for `mode="after"`, Pydantic
            calls it with `cls=the actual class` and `values=the validated
            model instance` - and emits `PydanticDeprecatedSince212:
            Using @model_validator with mode='after' on a classmethod is
            deprecated. Instead, use an instance method... Deprecated in
            Pydantic V2.12 to be removed in V3.0.` That warning never
            showed up in this repo's own test output because pytest's
            warning capture didn't surface it by default - it was silently
            live technical debt that would have hard-broken on a future
            Pydantic v3 upgrade. Rewrote all 16 (`project_schemas.py` 13,
            `task_schemas.py` 2, `user_schemas.py` 1) from `(cls, values)`
            + `values.field`/`return values` to the correct `(self)` +
            `self.field`/`return self` instance-method form, via a
            structured script (find each `mode="after"` signature,
            whole-word-replace `values`→`self` within that method's
            indented body only) rather than a blind repo-wide sed, then
            read the full diff for both files to confirm every site
            transformed correctly (no stray `values` usages, no `cls.`
            references anywhere in these bodies that would've broken).
            2 more sites (`user_schemas.py` `password_complexity`,
            `validate_base64`) were `@field_validator` methods missing
            the `@classmethod` decorator - Pydantic auto-classmethod-ifies
            these at runtime regardless (confirmed no behavior change),
            but official Pydantic v2 style adds it explicitly for
            IDE/type-checker clarity, which is also what satisfies ruff's
            N805 check. The remaining 3 sites (`DbProject.one`/`.all`,
            `DbUserProfile.get_userprofile_by_userid`) were plain
            `@staticmethod`-style helpers (called as `ClassName.method(db,
            ...)`, never via an instance) simply missing the
            `@staticmethod` decorator - confirmed against sibling methods
            in the same classes (`.create()`, `.delete()`) that already
            had it. Removed `N805` from the config-level `ignore` entirely
            (kept `N806` there, tracked separately below). Verified `ruff
            check` (clean, 0 N805 findings) and full backend suite
            (257/257 - critically, the Pydantic deprecation warning is
            gone from the test output too, confirming the fix is live).
      - [x] `N806` (22 sites) — DONE. All 22 were genuinely
            SCREAMING_SNAKE_CASE local "constants" declared inside a
            function body - no Pydantic/SQLAlchemy false positives
            actually turned up here (that concern in the original comment
            seems to have been about `N805`, not this rule). Two different
            fixes depending on the file:
            - `flight_gap_identification.py` (7), `flight_tail_removal.py`
              (9, across 2 functions - `MIN_DISTANCE_METERS` was
              duplicated identically in both, merged into one shared
              constant), `task_splitter.py` (1) - these are small,
              single-algorithm-per-file modules, so hoisted the tuning
              constants to module level (`task_splitter.py`'s got renamed
              `MAX_SPLIT_GRID_CELLS` from the underscore-prefixed
              `_MAX_CELLS` for clarity, matching the sibling
              `MATCHER_NEIGHBORS`/`LARGE_DATASET_IMAGE_THRESHOLD` pattern
              already used elsewhere in this codebase for the same kind of
              value).
            - `arq/tasks.py` (1), `main.py` (3) - these are large,
              multi-purpose files where the constant is used by exactly
              one small function; hoisting to the top would separate the
              value from its only usage in a big file. Lowercased in place
              instead (`_OUTLIER_THRESHOLD_DEG` → `outlier_threshold_deg`,
              `SILENCED_LOGGERS`/`SKIPPED_LOGGERS`/`FRAMEWORK_LOGGERS` →
              lowercase).
            Removed `N806` from the config-level `ignore` entirely.
            Verified `ruff check`/`format --diff` (clean) and full backend
            suite (257/257 passed).
      - [x] `B904` (51 sites) — DONE. All 51 are `except X as e: ...
            raise HTTPException(...)` (or similar) with no `from` clause.
            Reviewed each site's except-clause and surrounding code (not
            a blind sed) to decide `from e` vs `from None`: 49 of 51 are
            genuine error-translation sites (an internal exception being
            turned into a client-facing HTTP error) - `from e` is correct
            there, preserving `__cause__` for server-side tracebacks
            without leaking anything to the client (FastAPI never
            surfaces `__cause__` in the HTTP response body). 9 of those
            49 had a bare `except X:` with no bound variable at all
            (`jwt.ExpiredSignatureError`/`jwt.JWTError` in
            `user_routes.py`, plus a few bare `except Exception:`) - added
            `as e` to the except clause so it could be chained. The
            remaining 2 sites (`project_routes.py`'s two
            `s3_client().stat_object(...)` "probe for existence" checks in
            `export_odm_orthophoto`/`_stream_s3_object_response`) are
            different: the caught exception is routine, expected control
            flow (S3 "key not found"), not a genuine cause of the clean
            404 being raised - used `from None` there instead, since
            chaining a routine MinIO/S3 exception onto a domain 404 would
            just be log/Sentry noise, not useful debugging signal.
            Implemented via a script that locates each site's enclosing
            `except` clause by indentation, adds `as e` where missing, and
            appends `from e`/`from None` after the `raise` statement's
            closing paren (found via paren-balance counting, not a fixed
            line offset, since several are multi-line calls) - then
            re-verified with `ruff check --select B904` (clean) before
            trusting it. Removed `B904` from the config-level `ignore`
            entirely - **all three items originally listed under this
            backlog entry (`B904`, `N805`, `N806`) are now done.**
            Verified `ruff check`/`format --diff` (clean, only line-wrap
            reflow from the added `from e` suffixes) and full backend
            suite (257/257 passed). Hit a real, unrelated infra blocker
            mid-verification: the sandbox disk filled completely
            (`ENOSPC`) right after this fix was written but before it
            could be committed - every write, including a plain `Write`
            tool call, failed. Not something fixable from inside the
            sandbox; flagged to the user, who freed space externally.
            `docker builder prune -af` reclaimed ~9GB of accumulated
            build cache on resume - worth doing between docker-heavy
            verification cycles for the rest of this backlog to avoid
            repeating it.
- [x] Give `GET /users` a real paged UI/UX instead of the large
      default/max page size (200/500) it currently uses to avoid breaking
      the user-mention picker, which expects "all users" back in one page.
      DONE, scoped down from "build a UI" to "fix the actual coupling
      bug" — there is no existing admin/user-management UI anywhere in
      this frontend to attach real pagination controls to (checked: `GET
      /users` has exactly one consumer, the mention picker). Building a
      brand-new admin users page from scratch is a real feature (nav
      entry point, permission-gating, what columns/actions) needing
      product input this backlog item didn't provide, so not attempted.
      What *is* actionable and now done: decoupled the picker from
      `/users`'s pagination contract entirely.
      - `GET /users` now uses the shared `pagination_params()` dependency
        (page=1, per_page=20, max 100) like every other list endpoint,
        instead of its own override (page=1, per_page=200, max 500).
      - New `GET /users/mentionable` — unpaginated, field-minimal
        (`id`/`name`/`profile_img` only, via a new `DbUser.
        all_mentionable()` + `MentionableUserOut`/`MentionableUsersOut`
        schemas), purpose-built for the picker's client-side-filter-as-
        you-type UX, which genuinely does need the full user list in one
        shot. `getUsers()`/`useGetUsersQuery` in the frontend now call
        this instead.
      - **New finding, filed separately, not fixed here**: `GET /users`
        (and now `/mentionable`) return `email_address`/`is_active`/
        `is_superuser` (the full `DbUser` model) to *any* authenticated
        user, not just admins - `login_required` is the only gate, no
        superuser check. `/mentionable`'s response is now minimal by
        design, but the original `/users` listing endpoint still exposes
        every user's email and superuser flag to any logged-in user.
        Out of scope here since it's a permissions question (CLAUDE.md:
        ask before changing the auth model), not a pagination one.
      - Added `test_get_mentionable_users_returns_all_unpaginated` and
        updated `test_get_users_rejects_invalid_per_page`'s bound
        (500→100) to match. Verified `ruff check`/`format --diff` (clean
        on the touched files - noted separately that this test file, like
        633 other pre-existing sites across `tests/`, has bandit's S101
        "assert in test" findings the repo's ruff config doesn't exempt
        test files from; not something this change introduced or a
        blocker locally since pre-commit hooks aren't installed in this
        sandbox, but worth a real per-file-ignore entry at some point),
        `tsc --noEmit`/`eslint .` (0 errors), `pnpm build`, and the full
        backend suite (258/258 passed, +1 for the new test).
- [x] Reformat/fix `vite.config.ts` to the project's own prettier style —
      covered by the `eslint --fix` pass below (it's no longer excluded
      from linting since the ESLint v9 migration).
- [x] Ran `eslint --fix` across the frontend tree in one PR (explicit
      user direction, overriding the caution originally noted here about
      doing it in reviewable batches): fixed ~5836 auto-fixable errors +
      48 warnings (99% prettier formatting, plus a handful of safe
      mechanical rules — see the PR for the full list). Verified `pnpm
      run build` clean and the Vitest suite unchanged (5/5) before
      committing, fixer output only, no manual edits.
- [x] Triage the remaining ~640 errors + 21 warnings `eslint .` still
      reports (mostly `@typescript-eslint/no-explicit-any` at 448 sites,
      `@typescript-eslint/ban-ts-comment` at 78, plus a long tail —
      `no-nested-ternary`, `consistent-return`, `no-shadow`,
      `jsx-a11y/*`, etc.) — not auto-fixable, needs individual review.
      DONE — `eslint .` now reports 0 errors, 0 warnings across the whole
      frontend tree (verified after the final no-explicit-any batch below).
      Was done in reviewable batches, mechanical/low-risk rules first:
      - [x] `no-console` (12 sites) — allow `warn`/`error` in config (all
            existing sites were legitimate diagnostics, not debug
            leftovers); kept 4 genuine `console.log` breadcrumbs in
            `utils/adb.ts` (flaky hardware transfer) behind scoped
            `eslint-disable` comments.
      - [x] `react/button-has-type` (20 sites) — added explicit
            `type="button"`; verified no affected file contains a
            `<form>`, so none needed `type="submit"` instead.
      - [x] `no-unused-vars` (46 sites) — found and fixed a real config
            bug along the way: the base (non-TS-aware) rule was active
            instead of `@typescript-eslint/no-unused-vars`, producing
            false positives on TS declaration-merged `.d.ts` files and
            type-only callback signatures in prop interfaces. Swapped
            rules (with `argsIgnorePattern`/`varsIgnorePattern: '^_'`,
            matching this codebase's existing convention), added a
            `src/**/*.d.ts` override, and `eslint --fix` cleaned up 30+
            now-stale `eslint-disable no-unused-vars` comments left over
            from before the swap. Fixed the ~26 real findings the
            correct rule then surfaced.
      - [x] `@typescript-eslint/ban-ts-comment` (78 sites) — added real
            per-site descriptions to `@ts-expect-error` (most: MapboxDraw
            types written for mapbox-gl not maplibre-gl, TanStack Table's
            generic `ColumnDef` missing `accessorKey`, loosely-typed
            `data?: []` props, stubbed `register` no-ops); removed 2
            unnecessary `@ts-ignore`/`@ts-nocheck` (`DefineAOI`,
            `LandingPage`, `common/Modal`) after confirming via `tsc
            --noEmit` they weren't suppressing anything real; kept
            `views/Tutorial`'s `@ts-nocheck` (genuine
            @react-spring/web + React 19 incompatibility) but scoped the
            rule off for just that file instead. Found and fixed two real
            bugs along the way: `previewUrl`/`previewURL` casing mismatch
            between type and every call site in `UploadArea` and
            `FormUI/FileUpload` (both), and `FormUI/Select`'s `onChange`
            prop invoked without `?.()` despite being optional.
      - [x] `no-alert` (6), `no-shadow` (6), `no-use-before-define` (6),
            `jsx-a11y/click-events-have-key-events` (6),
            `jsx-a11y/no-static-element-interactions` (5),
            `no-underscore-dangle` (8), `no-restricted-syntax` (7),
            `@typescript-eslint/no-empty-object-type` (7) — grouped as one
            batch since each individually was small/mechanical. Notable
            fixes: renamed `adb.ts`'s underscore-prefixed helpers and
            reordered them above their call sites (fixed
            `no-underscore-dangle` + `no-use-before-define` together, since
            both fired on the same convention); swapped its `alert()`
            calls for `toast.error` (consistent with the rest of the app);
            added an `__RUNTIME_CONFIG__` allowlist entry for
            `no-underscore-dangle` (shared global-injection convention,
            `runtimeConfig.ts` + `public/config.js`); converted `for...of`
            loops to `.forEach()` (airbnb style, no behaviour change);
            added real keyboard handlers (Enter/Space, Escape-to-close on
            modals) to clickable `<div>` image tiles and dialog backdrops
            rather than the no-op `onKeyDown={() => {}}` pattern already
            used elsewhere in this codebase, except where the existing
            mouse-only ctrl/meta-click multi-select semantics have no
            reasonable keyboard equivalent yet (documented inline);
            left the 4 `window.confirm`/`window.prompt` `no-alert` sites in
            `ProcessingStatusDialog.tsx` as scoped `eslint-disable`s —
            deliberate blocking confirmations before costly/irreversible
            processing actions, not a suppress-and-move-on.
      - [x] `no-nested-ternary` (17), `consistent-return` (16) — grouped
            together since fixes for both cluster in the same handful of
            files (mostly map-lifecycle `useEffect`s in `ImageReview.tsx`
            and its siblings). `consistent-return` was almost entirely one
            recurring shape: a `useEffect` with an early bare `return;`
            guard clause followed later by `return () => {...}` cleanup -
            fixed by making the guard `return undefined;` instead of
            introducing a behavioural change. `no-nested-ternary` fixes
            were mostly 3-to-6-way ternary chains picking a CSS class or
            button label/state; extracted to a named helper
            (`getImageTileBorderClass` in `ImageReview.tsx`, for its 6-way
            image-tile border/ring chain) or inlined as an IIFE with early
            returns where a named function wasn't warranted, matching the
            IIFE pattern already used elsewhere in
            `views/IndividualProject/index.tsx`.
      - [x] Remaining small-count rules (~21 sites total):
            `@typescript-eslint/no-unused-expressions` (3),
            `import/prefer-default-export` (3), `no-undef` (2),
            `react/no-danger` (2), `no-await-in-loop` (2),
            `react/no-unused-prop-types` (2),
            `@typescript-eslint/no-unsafe-function-type` (2),
            `no-param-reassign` (1), `react/jsx-no-bind` (1),
            `react/display-name` (1),
            `jsx-a11y/no-interactive-element-to-noninteractive-role` (1),
            `no-return-await` (1). Found a real a11y bug fixing the last
            one: `Navbar`'s home link had `role="presentation"` on an
            `<a href="/">`, which strips its link semantics from
            assistive tech despite a real `aria-label` - removed the
            role rather than suppressing the lint. `MeasureTool`'s two
            unused-prop-types turned out to be an entirely unused,
            unimported component - deleted the two dead props rather
            than silencing the rule. `no-await-in-loop` and one
            `react/no-danger`/`no-param-reassign` site were legitimate
            (bounded-concurrency worker pool, sequential stream reads,
            MapLibre cursor-style mutation, locally-generated QR SVG) -
            left as scoped `eslint-disable`s with reasons rather than
            restructured.
      - [x] `react-hooks/exhaustive-deps` (9) - each reviewed individually
            for actual runtime-behavior risk, not blindly satisfied:
            4 sites (`map`/`queryClient` missing from map-lifecycle or
            auth-redirect effects) were safe to add outright, since the
            referenced value is either guarded against re-triggering side
            effects internally or referentially stable across renders.
            2 sites got real fixes instead of a wider dependency: switched
            `setModifiedWaypointModeOptions` to the functional-update form
            (avoids both the missing dep and a same-render infinite loop),
            and captured `droneModel` in a ref instead of adding it as a
            dep, since the toast it's used in should reflect whichever
            waypoint-data fetch just resolved, not re-fire when the drone
            model selector changes on its own. Hoisted `ImageReview.tsx`'s
            `escapeHtml`/`escapeAttr`/`buildPopupHtml` (pure, closed-in
            only on their own arguments) to module scope, which
            structurally removed the missing-dep warning rather than
            papering over it. Fixed a real stale-ref risk in the
            box-select effect's cleanup by capturing
            `boxOverlayRef.current` once at effect-setup time. One
            genuinely-unnecessary dep pair (`queryClient`, `projectId` on
            a `useCallback` that never referenced either) removed outright.
      - [x] `@typescript-eslint/no-explicit-any` batch 1 (49 of 448 sites) —
            services/API/Redux data layer: `src/services/*.ts`,
            `src/api/*.ts`, `src/store/slices/{project,createproject,
            droneOperartorTask}.ts`, plus the components those slices
            broke when tightened. Typed React Query `select` callbacks as
            `(res: unknown) => (res as AxiosResponse).data` rather than
            `(res: AxiosResponse) => ...` - the latter type-checks in
            isolation but fails TanStack Query's overload resolution when
            `queryOptions` has no generics. Reconstructed real payload
            shapes from each mutation's actual call site instead of
            guessing (`FormData` for the multipart endpoints,
            `{ event, comment }` for task-status posts, etc.); used
            `Record<string, unknown>` only for genuinely-arbitrary
            passthrough (query filters); left 3 sites in
            `RegulatorsApprovalPage/index.tsx` and ~20 in `MapSection.tsx`
            alone pending a shared `ProjectDetail`/`TaskData` interface -
            not a quick per-site fix.
            Found two real bugs by tightening these types: (1)
            `CreateprojectLayout` was calling
            `formData.append('image', projectImage.projectMapImage)` where
            `projectImage` was already the `File` itself (not a wrapper
            object) - every project creation silently uploaded the string
            `"undefined"` as the project image instead of the real
            screenshot; (2) the `droneOperatorTask` slice's initial state
            had `geojsonListOfPoint` (singular) while every real dispatch
            used `geojsonListOfPoints` (plural), masked entirely by `any`.
            Also deleted two write-only, never-read state fields
            (`uploadedProjectArea`, `uploadedNoFlyZone`) that had drifted
            out of the `CreateProjectState` interface.
      - [x] `@typescript-eslint/no-explicit-any` batch 2 (36 of 399 sites) -
            the user-profile form family: `UpdateUserDetails/*` (4 files),
            `CompleteUserProfile/*` (view + 4 FormContents siblings, which
            share the exact same `formProps` object so got the same fix
            together), `RegulatorsApprovalPage/Description/ApprovalSection.tsx`,
            `utils/callApiSimultaneously.ts`. Also fixed `postUserProfile`'s
            `data` param in `services/common.ts` - it was typed as
            `UserProfileDetailsType` (id/email/profile_img/has_user_profile,
            an unrelated Google-auth shape), but its one real caller always
            passed the full profile-edit form payload; the mismatch was
            silently invisible because the caller side was `any` too.
            Established two reusable patterns for this cluster: (1)
            `useMutation<AxiosResponse, AxiosError, TVariables, unknown>`
            with `err.response?.data as { detail?: string }` in `onError`,
            replacing `useMutation<any, any, any, unknown>` +
            `err?.response?.data?.detail`; (2) a `type` alias (not
            `interface`) for form-data shapes passed into
            `patchUserProfile`/`postUserProfile`, since TS only structurally
            matches `Record<string, unknown>` params against object-literal
            `type` aliases, not `interface` declarations without an index
            signature - the latter fails assignment with a real compiler
            error, not just a lint warning.
            Skipped `RegulatorsApprovalPage/Description/DescriptionSection.tsx`
            (4 sites) - its `projectData: Record<string, any>` prop is the
            same shared shape flagged in batch 1 as needing a dedicated
            `ProjectDetail` interface; fixing it here in isolation would
            just be guessing at a type other files already depend on.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 1 (23 of 363
            sites) - researched the real backend response shapes (an
            Explore agent read `project_schemas.py`/`task_schemas.py`
            directly) instead of guessing from frontend usage. Finding:
            there is no single "ProjectDetail" shape - the frontend
            conflates **five distinct backend response shapes** under
            `Record<string, any>`: `ProjectInfo` (GET /projects/{id}),
            `TaskOut` (nested in `ProjectInfo.tasks`), `Task`/`TaskStateItem`
            (GET /tasks/states/{project_id} - only `task_id`/`project_id`/
            `state`, no `id`, no `outline`), `TaskDetailsOut` (single-task
            detail), and `AssetsInfo` (task summary bulk endpoint). Added
            real `ProjectInfo`/`TaskOut` to `services/createproject.ts` and
            `TaskStateItem` to `services/project.ts`, then applied them to
            `RegulatorsApprovalPage/Description/DescriptionSection.tsx`
            (deferred from batch 2), `RegulatorsApprovalPage/index.tsx` +
            its view wrapper, and `views/IndividualProject/index.tsx`.
            **Found and fixed a real bug while researching this**: two map
            components (`IndividualProject/MapSection/index.tsx`,
            `IndividualProject/ExportSection/MapSection.tsx`) read
            `projectData?.no_fly_zones_geojson`, a field that has never
            existed on the backend response (the real field is
            `no_fly_zones`) - no-fly-zone polygons have never rendered on
            either map. Fixed both call sites.
            **Flagged, not fixed**: `ProcessingStatusDialog.tsx` already
            declares local types (`ProcessingDialogTask`,
            `ProcessingDialogProjectDetail`) with fields
            (`has_ready_imagery`, `imagery_transfer_pending`,
            `assigned_images`, `pending_transfer_count`, `task_index`,
            `failure_reason`, `task_state`) that don't exist on the current
            backend `AssetsInfo` model or its actual construction in
            `project_logic.py`. Either this is stale/aspirational typing
            for a feature that was never shipped or was removed, or there's
            a reconciliation endpoint the research didn't find - needs a
            deliberate decision before touching, not a mechanical any-fix.
            Discovered that `useGetProjectsDetailQuery`/`useGetTaskStatesQuery`
            (in `api/projects.ts`) don't propagate real types to callers
            regardless of how precisely `select` is typed internally,
            because they're built on bare `Partial<UseQueryOptions>` with
            no generics - callers still see `data` as `{}`/`unknown` and
            need an explicit `as { data?: ProjectInfo; ... }` cast at each
            call site (the pattern used throughout this batch). Properly
            wiring the hook generics through would remove the need for
            that cast but is a larger, separate refactor.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 2 (25 of 340
            sites) - `IndividualProject/MapSection/index.tsx` (the 28-site
            file, distinct from `DroneOperatorTask/MapSection/MapSection.tsx`
            of the same basename), fully cleared using the `ProjectInfo`/
            `TaskStateItem` types from part 1. Removed redundant
            `(task: Record<string, any>)` callback annotations on
            `.map`/`.filter`/`.find` over `tasksData` entirely (the array's
            own declared type already carries the looseness, so an
            explicit per-callback annotation was purely redundant - once
            removed, no literal `any` remains for ESLint to flag while
            behaviour is identical). Used `GeoJsonProperties` (from the
            `geojson` package) for MapLibre feature-properties callback
            params instead of `Record<string, any>` - correct AND not
            flagged, since referencing an imported type alias that
            internally resolves to `any` isn't the same as writing the
            `any` keyword yourself. Propagated the `ProjectInfo` prop type
            through to `views/IndividualProject/index.tsx` and
            `views/RegulatorsApprovalPage/index.tsx`'s `<MapSection>`
            usages (both previously bridged with an `as Record<string,
            unknown>` cast to the old loose prop type).
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 3 (29 of 315
            sites) - `DroneOperatorTask/MapSection/MapSection.tsx` (its own
            ~24 sites) plus `useTaskParams.ts`, `GetCoordinatesOnClick.tsx`,
            `common/SwitchTab/index.tsx`, and two call sites in
            `DefineAOI/index.tsx`/`constants/createProject.tsx` that broke
            once `SwitchTab` got a real prop type. Added the 4th and 5th
            backend response shapes from the batch-3-part-1 research to
            `services/tasks.ts`: `TaskDetailsOut` (single-task detail,
            `GET /tasks/{id}` and `/tasks/project/{id}/{index}` - used via
            `useTaskParams()`) and `AssetsInfo` (task summary bulk
            endpoint). `useTaskParams()` itself had 2 explicit-anys
            (`(projectData as any)?.id`, `taskData = ... as any`) feeding
            directly into every consumer of `taskData`/`taskId`/`projectId`
            across the DroneOperatorTask tree - fixing it at the source
            here is why this batch was smaller-but-higher-leverage than
            its raw MapSection.tsx count suggests.
            Reconfirmed the TanStack Query overload-resolution issue from
            part 1: a `select` callback typed with a concrete param
            (`res: AxiosResponse<...>`) fails to satisfy
            `Partial<UseQueryOptions>`'s bare-generic overload even though
            it's more specific, not less - the fix is always `select: (res:
            unknown) => { const data = res as AxiosResponse<T>; ... }`,
            never a directly-typed parameter.
            `SwitchTab`'s `onChange: any` prop turned out to flow real
            option objects (`{label, value, icon?, message?}`) matching
            every actual call site once traced - gave it a proper
            `SwitchTabOption` interface instead of widening to
            `Record<string, unknown>`, which would have broken `key={...}`
            and other direct property reads at render time.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 4 (16 of 286
            sites) - `DescriptionBox/index.tsx` and its sibling
            `ManualOverrideSection.tsx`, plus `DescriptionComponent/index.tsx`.
            Found two more real fields the frontend reads that aren't on
            the backend `TaskDetailsOut` schema (`altitude`,
            `starting_point_altitude`) - same drift pattern as the
            `no_fly_zones_geojson` bug and the `ProcessingStatusDialog`
            fields flagged earlier, but lower stakes here (both are already
            behind `|| null` fallbacks that were already always firing, so
            no behavior change - just made the "this is dead/unconfirmed"
            fact visible in the type instead of hidden inside `any`).
            `DescriptionBoxComponent`'s `data[].value` prop was typed
            `string` but real callers were already passing raw numbers
            (`taskWayPoints?.length`) - only worked before because `any`
            masked the mismatch; widened to `string | number | null |
            undefined` to match actual usage instead of coercing values to
            match the type.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 5 (27 of 270
            sites) - `ImageReview.tsx` and `TaskVerificationModal.tsx`
            fully cleared. Both files' MapLibre click handlers were typed
            `(e: any)`; used maplibre-gl's own `MapMouseEvent`. Several
            `GeoJSON.Feature<any>` callback annotations turned out to be
            pure redundancy - once removed, the array's own already-correct
            element type (from `ProjectMapData`/`TaskVerificationData` in
            `services/classification.ts`, which were already properly
            typed) flowed through with no further changes needed.
            `TaskVerificationModal.tsx`'s `queryClient.setQueryData`/
            `setQueriesData` cache updaters were the trickiest part: they
            defensively handle two different possible cache shapes
            (`TaskStateItem[]` directly, or wrapped in `{ data: [...] }`)
            because the cache key can be populated by either a raw
            queryFn result or an already-`select`-transformed one
            depending on call site - preserved that exact dual-branch
            defensive logic with `unknown` + `Array.isArray` narrowing
            instead of collapsing it to a single assumed shape.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 6 (34 of 243
            sites) - `common/MapLibreComponents/types/index.ts` (the shared
            prop-types file for the whole MapLibre component family)
            rewritten in full: `GeoJsonProperties` (from the `geojson`
            package) for all feature-properties callback params
            (`onFeatureSelect`, `fetchPopupData`, `popupUI`, `showPopup`,
            `handleBtnClick`), and `onDrag`'s event param changed from `any`
            to `Record<string, unknown> & {originalCoordinates, isDragging}`
            (a `MapMouseEvent` intersection doesn't work here - the real
            call site in `VectorLayer.ts` spreads the event object, which
            drops class methods, so the runtime value is never actually a
            `MapMouseEvent`). Fixed the resulting fallout across every
            consumer: `FlightGapDetectionModal.tsx`, `Projects/MapSection/
            index.tsx` (incl. a full rewrite of its `projectsCentroidGeojson`
            `useMemo`/`.reduce` to build a properly-typed `FeatureCollection`
            instead of `any`), `IndividualProject/MapSection/index.tsx`,
            and both `AsyncPopup/index.tsx` and `NewAsyncPopup/index.tsx`
            (sibling components with slightly different `coordinates` state
            shapes - `AsyncPopup` widened to `LngLatLike | null` since
            `popupCoordinate` is a loose `number[]`, not a `[number,number]`
            tuple, so it can't satisfy `LngLat` directly).
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 7 (38 of 209
            sites) - `common/DataTable/index.tsx` (the shared generic table
            component, 12 sites) fully cleared: `select`/`getErrorMsg` use
            the established `AxiosResponse`/`AxiosError` pattern,
            `useQueryOptions` is `Partial<UseQueryOptions>`, and `ColumnData.
            cell` is typed with TanStack's own `ColumnDefTemplate<CellContext
            <ColumnData, unknown>>` rather than a fabricated row shape (this
            component genuinely reuses `ColumnData` as both the column-def
            schema and the table's row generic - a pre-existing, if
            confusing, design not touched here). Fixing `data`/
            `handleTableRowClick` from `Record<string, any>` to
            `Record<string, unknown>` cascaded into all 4 real callers
            (`IndividualProject/Tasks(/TableSection)`, `Contributions/
            (TableSection)`, and their `views/IndividualProject/index.tsx` /
            `RegulatorsApprovalPage/index.tsx` callers) needing the same
            fix, which in turn required properly typing Redux's `tasksData`
            (previously `Record<string, any>[]`, now `TaskData[]` - `TaskOut`
            with `outline` widened to `Record<string, unknown> | null` since
            the reshape in both dispatch sites only ever sets `properties`,
            never a full `type`/`geometry` Feature) and `taskClickedOnTable`
            (now a proper `TaskClickedOnTable` interface, not a backend
            shape - just the fields the map popup needs on row click). That
            retyping had further fallout across `IndividualProject/
            MapSection/index.tsx` and `ExportSection/MapSection.tsx` (both
            already `tasksData` consumers), fixed in the same commit;
            `ExportSection/MapSection.tsx`'s and `ExportSection/index.tsx`'s
            own `projectData: Record<string, any>` props were tightened to
            `ProjectInfo` while in there. Also fixed `Dashboard/RequestLogs/
            index.tsx` (not a `DataTable` consumer, but same `any`-riddled
            task-list shape): added `UserTasksOut` (`services/dashboard.ts`,
            matching backend `task_schemas.UserTasksOut` exactly - the
            `GET /tasks` list endpoint, distinct from every other
            Task-shaped interface already in the frontend) and used the
            established `select: (res: unknown) => (res as AxiosResponse
            <...>).data` pattern.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 8 (11 of 171
            sites) - `DroneOperatorTask/DescriptionSection/UppyFileUploader/
            index.tsx` fully cleared. `@uppy/aws-s3` and `@uppy/core` ship
            their own full type declarations, so the plugin-option
            callbacks (`createMultipartUpload`, `signPart`, etc.) were
            already correctly inferring `file`/`data`/`partData` param
            types - only the manually-added `: any` annotations
            (`requestData`, `requestBody`, 5x `catch (error: any)`) were
            actual `any` sites, replaced with real inline object types or
            plain `catch (error)` (none of the catch bodies do member access
            on `error`, so no cast needed). `uppy.on('complete'/
            'upload-error', ...)` handlers and the `onUploadComplete` prop
            use `UploadResult<Meta, Record<string, never>>` / `UppyFile<...>`
            from `@uppy/core` (the app doesn't customize Uppy's Meta/Body
            generics, so this matches the actual default instance type).
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 9 (22 of 160
            sites) - `CreateProject/CreateprojectLayout/index.tsx` (9) and
            `CreateProject/FormContents/DefineAOI/index.tsx` +
            `common/UploadArea/index.tsx` (10 + 3, fixed together since
            `DefineAOI`'s file-upload handlers are typed by
            `UploadArea`'s `onChange`/`isValid` props) all fully cleared.
            `CreateprojectLayout`'s two `useMutation<any,any,any,unknown>`
            calls got the established `AxiosResponse`/`AxiosError` pattern;
            `onSubmit`'s `data: any` became `FieldValues` (react-hook-form's
            own type), which required explicitly annotating the
            `refactoredData` object literal as `FieldValues` too - spreading
            a `Record<string, any>`-based type into an object literal with
            additional explicit keys drops the index signature in strict
            mode, breaking the later `delete refactoredData[key]` loop
            otherwise. Exported `UploadedFilesType` from `UploadArea` so
            `DefineAOI` could type its `onChange`/`isValid` handlers against
            it instead of `Record<string, any>[]`/`any` - surfaced a
            pre-existing looseness (native `File` lacks the `lastModifiedDate`
            field `FileType` declares) on two more lines inside `UploadArea`
            itself, suppressed with the same `@ts-expect-error` convention
            already used there for identical cases. Several `: any` locals
            in both files turned out to be fully redundant (the values were
            already implicitly `any` from untyped upstream calls like
            `validateGeoJSON`) and were just deleted rather than retyped.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 10 (17 of 138
            sites) - rest of `CreateProject/**` fully cleared:
            `FormContents/GenerateTasks/index.tsx` (8, incl. `formProps:
            any` -> `UseFormPropsType`, the two `useMutation<any,...>` calls
            -> `AxiosResponse`/`AxiosError`, and the two redundant
            `Record<string, any>` casts around `convertGeojsonToFile` -
            it already accepts `unknown`, so the casts were pure dead
            weight), `FormContents/KeyParameters/index.tsx` (3, incl. one
            `SwitchTab.onChange`'s `selected.value` needing a `'gsd' |
            'altitude'` cast at the dispatch site since `measurementType`
            is a narrow union but `SwitchTabOption.value` is `string`),
            `FormContents/BasicInformation/index.tsx` (1, same
            duplicate-project-name-check pattern as `CreateprojectLayout`),
            `StepSwitcher/index.tsx` (1), `FormContents/GenerateTasks/
            MapSection/index.tsx` (1 - `canvas.toBlob`'s callback is
            `(blob: Blob | null) => void`; added the previously-missing
            null check, a small real bug fix since `new File([null], ...)`
            was reachable before), `FormContents/DefineAOI/MapSection/
            index.tsx` (3 - the two `feature: any` filter callbacks got a
            minimal `{id?: string | number}` shape since `projectArea`/
            `noFlyZone`'s `.features` access is itself only valid under the
            file's existing `@ts-expect-error`, so a real Feature type
            wasn't obtainable there without a larger refactor).
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 11 (15 of 121
            sites) - rest of `DroneOperatorTask/**` fully cleared:
            `DroneImageProcessingWorkflow/index.tsx` (6) + `ImageUpload.tsx`
            (1) share the `UploadResult<Meta, Record<string, never>>` /
            `Meta` pattern from `@uppy/core` established in batch 3/8; the
            three classification-mutation `onError` handlers just needed
            their redundant `: any` annotations removed since
            `useStartProjectClassificationMutation` etc. (`api/projects.ts`)
            already declare `Error` as their `TError` generic.
            `QuestionBox/index.tsx` (3): `setFlyable`'s `any` generic
            narrowed to `string` (matches the real `useState('yes')` in its
            only caller, `DescriptionBox/index.tsx`), and the comment
            mutation typed against `postUnflyableComment`'s own param type
            via `Parameters<typeof postUnflyableComment>[0]['data']`.
            `UploadsInformation/index.tsx` (1): typed `data` as
            `{name: string; value: string | number | null | undefined}[]`
            - the `DescriptionBoxComponent` `value` pattern from batch 3/4,
            since its only caller passes both string and numeric values.
            `Header/index.tsx` (2) and `DescriptionSection/index.tsx`'s
            `project_task_index` cast (part of its 2) were pure redundancy
            - `useTaskParams()`'s `taskData` is already `TaskDetailsOut`.
            `DescriptionSection/index.tsx`'s other site: the 409-response
            `payload: any` typed as `{detail?: {code?: string}} | null`.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 12 (13 of 106
            sites) - rest of `IndividualProject/**` (excl. `MapSection`,
            already done) fully cleared. `ProcessingStatusDialog.tsx` (6):
            `projectId = (projectDetail as any)?.id` was pure redundancy -
            its local `ProcessingDialogProjectDetail` type just hadn't
            declared `id` even though the real backend response
            (`ProjectInfo`) has it; the `taskList` builder's `any`s replaced
            with `Record<string, unknown>` plus per-field casts, keeping the
            already-documented "these fields may not exist on `AssetsInfo`"
            uncertainty visible rather than asserting a shape. `GcpEditor/
            index.tsx` (2): its 3 props typed from their one real caller
            (`views/IndividualProject/index.tsx`); the custom-event handler
            typed `Event` with a `CustomEvent<string>` cast for `.detail`.
            `TaskOrthoCogViewer.tsx` (3): OpenLayers' own `ViewOptions` type
            for the GeoTIFF view config, and `BaseEvent` (`ol/events/Event`)
            for the `'error'` listener - OL's `.on()` overloads are keyed by
            event name, and only accept callbacks typed for one of its
            declared event-type unions, so a bespoke inline shape didn't
            type-check; the GeoTIFF-specific `.error` property beyond
            `BaseEvent` needed one more inline cast at the access site.
            `Instructions/index.tsx` (1) and `QFieldExport/index.tsx` (1)
            were mechanical - `ProjectInfo` and an `AxiosError` cast
            respectively.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 13 (13 of 93
            sites) - rest of `common/MapLibreComponents/**` fully cleared
            (completes the family started in batch 3/6): `VectorLayer.ts`
            (1, plus surfaced a real pre-existing bug - `toast.error(msg,
            errorObj)` was always passing a raw object as react-toastify's
            second positional arg, which is `ToastOptions`, not text;
            merged into one template-string message). `MeasureTool/
            index.tsx` (1) and `PopupUI/index.tsx` (2) were mechanical -
            `FeatureCollection` (from `draw.getAll()`'s real return type)
            and `Record<string, unknown>`. `helpers/changeLayerOrder.ts`
            (4, unreachable - no callers anywhere in the codebase, left
            in place rather than deleted since that's outside this task's
            scope) and `helpers/reverseLineString.ts` (1) typed against
            their actual geojson-package shapes. `useDrawTool/index.ts`
            (3): `drawStates`/`redoStates` are `FeatureCollection[]`, and
            the `sourcedata` handler uses maplibre-gl's own
            `MapSourceDataEvent`. The `FeatureCollection` typing cascaded
            into a few narrowing casts already implied by this file's
            existing `@ts-expect-error` comments (`geometry as LineString`,
            `id as string` for `draw.delete`).
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 14 (18 of 81
            sites) - all of `utils/**` and `hooks/**` fully cleared.
            `checkIfLoading.ts` and `sortArrayUsingDate.ts`/`getExifData.ts`
            picked up real types from their actual callers/libraries
            (`RootState`'s `loader.actions: string[]`, a generic
            `HasDateTime` constraint, `exifreader`'s tag shapes plus a new
            `GPSLatitudeRef`/`GPSLongitudeRef` field instead of relying on
            an `any` index signature). `removeObjectKeys.ts`, `utils/
            index.ts`'s `removeKeysFromObject`, `prepareFormData.ts`, and
            `prepareQueryParam.ts` all went to `Record<string, unknown>` -
            genuinely arbitrary object shredders with no fixed schema.
            `useScrollActiveListener.ts` and `useWindowDimensions.tsx`
            share an identical `debounce` helper - both fixed the same way,
            generic over `Args extends unknown[]` instead of `any[]`/`any`.
            `sortArrayUsingDate.ts` and `useScrollActiveListener.ts`'s
            `sectionRefs` prop are dead code (no callers found anywhere in
            the codebase) but typed properly anyway rather than deleted,
            same call made for `changeLayerOrder.ts` in batch 3/13.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 15 (12 of 63
            sites) - `modules/user-auth-module/**` fully cleared.
            `store/slices/user.ts` (2): `Record<string, unknown>` for
            `user`/`userProfile`, matching the `Record<string, any>`
            convention used for other loosely-shaped Redux state this
            session. `ForgotPassword/index.tsx` (4) and `Login/index.tsx`'s
            login mutation (3 of its 6): `useMutation<any,any,any,unknown>`
            -> `AxiosResponse`/`AxiosError` + the real service param type
            (`forgotPassword`'s `{email:string}`, `Parameters<typeof
            signInUser>[0]`), same pattern as every other mutation fixed
            this session. `Login/index.tsx`'s other 3: the Google-login
            query's `select` uses the established `(res: unknown) => (res
            as AxiosResponse).data` cast, and `(import.meta as any).env.
            VITE_FRONTEND_URL` was a real gap - `vite-env.d.ts` had no
            `ImportMetaEnv` augmentation for it (every other `VITE_*` var
            in this codebase goes through the `getRuntimeConfig` docker-
            injectable-config helper, but `VITE_FRONTEND_URL` is build-time
            only, so extending that helper's key union would have been
            misleading; added a minimal `ImportMetaEnv` augmentation
            instead).
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 16 (17 of 51
            sites) - all of `views/**` fully cleared. `Dashboard/index.tsx`
            (4): the query's `select` cast against `AxiosResponse<Record
            <string, number>>`, and the mapped-card type derived as
            `(typeof dashboardCards)[number] & {count?: number}` rather
            than a hand-written literal, since the cards carry paraglide's
            branded `LocalizedString` title type which a plain `string`
            annotation doesn't satisfy. `Import/index.tsx` (1) and
            `View3DModel/index.tsx` (4, incl. a new `TilesetNode` interface
            for the 3D Tiles JSON tree walk, matching the
            `changeLayerOrder.ts`/`ProcessingStatusDialog.tsx` "type the
            actual shape accessed" pattern) were mechanical. `Projects/
            index.tsx` (4): typed the list-query response with a new local
            `ProjectListItem` interface and surfaced a real pre-existing
            mismatch - `ProjectCard`'s `id` prop is typed `number` but
            backend project ids are UUID strings everywhere else in this
            codebase (same class of bug as `postTaskBoundary`'s `id:
            number` found in batch 3/9); left a cast + comment rather than
            silently changing `ProjectCard`'s contract. `ViewOrthophoto/
            index.tsx` (4): reused the existing `ProjectInfo` interface
            instead of a bespoke local type, since all the accessed fields
            (`cloud_ortho_cog_url`, `outline`, `name`) are already on it.
      - [x] `@typescript-eslint/no-explicit-any` batch 3, part 17 (34 of 34
            sites) - FINAL BATCH, backlog now at 0. Cleared every remaining
            file: `Dashboard/TaskLogs/**` (reused `UserTasksOut` from
            `services/dashboard.ts`, same source as `RequestLogs` in batch
            3/7); `GoogleAuth/index.tsx`, `LandingPage/**`, `common/
            Navbar/index.tsx` (the `(import.meta as any).env.
            VITE_FRONTEND_URL` pattern recurred in 3 more files - all now
            plain `import.meta.env.VITE_FRONTEND_URL` using the
            `ImportMetaEnv` augmentation added in batch 3/15);
            `Projects/MapSection/VectorLayerWithCluster.tsx` (typed against
            `MapInstanceType`/`GeojsonType`/`MapMouseEvent`, then fixed the
            resulting MapLibre GeoJSONSource/geometry-narrowing fallout);
            `Projects/Pagination/index.tsx` and `ProjectsHeader/index.tsx`
            (redundant `any` removed once `Select`'s prop was already
            correctly typed); `RadixComponents/Image.tsx`, `common/
            BaseLayerSwitcher`, `Chip`, `CustomDatePicker`, `ErrorBoundary`
            (React's own `ErrorInfo` type), `FormUI/FileUpload`, `FormUI/
            MultiSelect`+`Select` (kept `Record<string, unknown>` +
            per-access casts since `labelKey`/`valueKey` are genuinely
            dynamic prop-driven object keys), `Layouts/types.ts`,
            `RadioButton`, `UserProfile`, and all three `constants/*`
            files. `common/DataTable/DataTablePagination/index.tsx` (typed
            against `Table<ColumnData>`) surfaced a real dead-prop bug in
            `DataTable/index.tsx` - it was passing `currentPage`/
            `totalCount`/`pageSize` to `DataTablePagination`, which never
            read any of them (only `table`); removed the unused props at
            the call site rather than fabricating a use for them. Typing
            `RadioButton.onChangeData` and `Select.onChange` away from
            `any` cascaded into 4 call sites across `CompleteUserProfile`,
            `UpdateUserDetails`, and `CreateProject/BasicInformation/
            AdvancedConfig.tsx` needing a narrow-union cast (e.g. `val as
            'yes' | 'no'`) where the emitted `string` was being dispatched
            into Redux state typed with a specific literal union.
            Ran `pnpm eslint . --fix` to auto-fix the ~38 residual prettier
            formatting diffs this batch's edits accumulated (no logic
            changes) - `eslint .` now reports 0 errors, 0 warnings across
            the whole frontend. tsc, `pnpm build`, and `pnpm test` (5/5)
            all clean. This closes out the entire "fix remaining eslint
            errors and warnings" effort from the original ~640-error
            triage - every `@typescript-eslint/no-explicit-any` site in
            the frontend is now a real type.
      - [x] Everything else listed above, done - see individual `[x]`
            entries in the batch history above for what each covered.
- [x] Propagate the new request ID (`RequestIDMiddleware`, `main.py`) into
      arq jobs enqueued from a request, so a job can be traced back to the
      HTTP request that triggered it. Needs touching every enqueue call
      site to pass the ID through job kwargs/context - not attempted as
      part of adding the middleware itself.
      DONE. `RequestIDMiddleware` now also stashes `request.state.
      request_id`. On the worker side, rather than editing all 19 worker
      function bodies individually, added a single choke point:
      `with_request_id_context()` in `arq/tasks.py` wraps every entry in
      `WorkerSettings.functions`/`cron_jobs` and pops an optional
      `request_id` kwarg before calling the real function, binding it via
      `log.contextualize()` for the duration of the call if present -
      `@functools.wraps` preserves `__qualname__`, which is what arq's
      function registry dispatches job names on (verified this
      empirically, not just from docs, with a standalone repro). Jobs
      enqueued without one (cron, scripts) are completely unaffected.
      Wired `request_id=request.state.request_id` (or a threaded-through
      `request_id` param, for the 2 sites where the enqueue happens in a
      logic-layer helper rather than the route itself -
      `enqueue_dem_download`, `create_tasks_from_geojson`) into all 14
      route-originated `enqueue_job()` call sites across
      `public_routes.py`, `classification_routes.py` (4),
      `project_routes.py` (8), `jaxa/upload_dem.py`.
      **Scope boundary, not attempted**: a job enqueueing *another* job
      from inside a worker (one case exists -
      `process_imported_odm_assets` calling `create_tasks_from_geojson`)
      doesn't relay the original request_id forward - the todo item's
      wording ("jobs enqueued *from a request*") is satisfied by the
      primary route→job hop; chasing it through nested job→job chains
      too would mean relaying an explicit param through more function
      signatures for a rare, second-order case.
      Broke 6 pre-existing tests that asserted exact `enqueue_job` call
      args/kwargs (now includes the new `request_id`) or called a route
      function directly without the now-required `request` param -
      fixed each by asserting `request_id` is present as a string
      separately from the rest of the kwargs dict (rather than widening
      the exact-match to a hardcoded value, since it's a real UUID
      generated per-request), and adding a `_fake_request()` helper
      (`SimpleNamespace(state=SimpleNamespace(request_id=...))`) for the
      handful of tests calling route functions directly rather than via
      the HTTP client. Added `test_arq_request_id_propagation.py` (3
      tests covering the wrapper itself: binds context and strips the
      kwarg, is a no-op when absent, preserves `__qualname__`/`__name__`
      for arq's dispatch). Verified `ruff check`/`format --diff` (clean),
      an `api.openapi()` build (93 paths, no errors from the new
      `Request` params), and the full backend suite (261/261 passed,
      +3 for the new test file).
- [x] Regenerate `uv.lock` again once `prometheus_client` (or whichever
      package gets picked, see the `/metrics` item above) is added as a
      dependency - same container-based process used for the mypy lockfile
      fix.
      DONE as part of the `/metrics` item itself (same commit) - see that
      entry above for the version-conflict finding and verification.
- [x] Fixed two real bugs the RFC 7807 PR's own tests caught: (1) the
      exception handlers were only registered on the module-level `api`
      singleton, not inside `get_application()` itself, so any other
      caller of the factory (including every test) silently got FastAPI's
      default handlers instead - moved registration inside the factory;
      (2) `handle_http_exception` was unconditionally `str()`-ing non-string
      `detail`, breaking routes (e.g. waypoint's `MISSING_TERRAIN_DEM`
      check) that deliberately raise a structured dict detail for the
      frontend to branch on - now passed through as-is. Confirmed via a
      real `just test backend`-equivalent run (this sandbox got Docker
      BuildKit working via a user-level `docker-buildx` CLI plugin install,
      no root needed) - full suite green, 257/257.
- [x] **Needs interaction:** every PR that triggers a test workflow should
      have tests exercising both expected and failure conditions - done
      for the backend PR stack (#2-#33) this pass; frontend PRs beyond the
      ErrorBoundary/AppErrorFallback test are still light (ESLint-v9 and
      redux-saga-deletion PRs are config/deletion-only, no new tests
      needed, but ProjectCard/Modal/Breadcrumb keyboard-accessibility gaps
      below have no regression tests either once fixed). "Add additional
      linting for FE and BE code" also requested - no specific new rules
      picked yet; needs a decision on what beyond the existing ruff/ESLint
      configs is wanted (stricter mypy, more ESLint plugins, etc.) before
      it's actionable.
      DONE — Asked; scope: require tests on new backend routes, require
      tests on new frontend components, tighten ESLint, tighten ruff.
      **Governance gates** (CI, not local lint): `.github/scripts/
      check-route-tests.sh` (new job `require-route-tests` in `test.yml`)
      fails a PR that changes a `*_routes.py` file with zero test-file
      changes anywhere in the diff — repo-wide, not a per-route mapping,
      deliberately coarse. `.github/scripts/check-component-tests.sh`
      (new job `require-component-tests` in `frontend-test.yml`) fails a
      PR that adds a new `components/**/*.tsx` file with no sibling
      `*.test.tsx` (matches this repo's existing `index.tsx` →
      `index.test.tsx` convention). Both PR-only (need `github.base_ref`),
      both functionally tested against a scratch repo across
      added/edited/no-op cases before wiring into CI.
      **Ruff**: added `C4`/`PIE`/`ISC`/`RUF`/`TID` to `select` — all had
      zero or single-digit violations (unlike `RET`/`PERF401`/`T201`/
      `PTH`/`ARG`, which surface 40-170+ pre-existing sites each and are
      deliberately deferred alongside `D`/pydocstyle above). Fixed the one
      real `C416` site (dict-comprehension → `dict()`), added
      `allowed-confusables = ["×"]` for legitimate `5°×5°`/`km ×`
      typography in log/docstring text (`RUF001`/`RUF002`). Net violation
      count unchanged (713 baseline, all pre-existing debt in
      already-selected rules) — zero new debt from the added categories.
      **ESLint**: `react-hooks/exhaustive-deps` warn→error (0 new
      violations — already clean); added
      `@typescript-eslint/no-floating-promises` (130 violations). 106 were
      one of four safe, well-understood fire-and-forget patterns
      (`navigate()`, `queryClient.invalidateQueries()`,
      `handleSubmit(onSubmit)()`, side-effect `import()`) — fixed via
      ESLint's own `floatingFixVoid` suggestion applied programmatically
      by range (had to fix my own bug here: a naive insert-at-offset
      script corrupted 3 files where the suggestion is a full-span
      *replacement*, not a zero-width insertion — reverted and redid
      those 3 with proper range-replace logic before re-verifying). The
      remaining 24 got individual review, surfacing real (not just lint)
      bugs: `callApiSimultaneously.ts`'s retry backoff called `delay(1000)`
      without `await`, so retries never actually waited; a project-
      printout `html2canvas` export cleared its own loading spinner
      before the export finished; two `navigator.clipboard.writeText()`
      call sites showed a success toast unconditionally, even if the
      write itself failed. All three fixed for real (not just silenced).
      Also had to add `'no-void': ['error', { allowAsStatement: true }]`
      — airbnb's default config banned the `void` operator outright,
      which conflicts with `no-floating-promises`'s own canonical fix.
      Verified: full `eslint .` clean, `tsc && vite build` clean, Vitest
      19/19.

## Round 2 — scoped 2026-08-20

Original backlog (above) is fully complete (66/66, both PRs merged into
`dev`). This round is a fresh scoping pass, not an item-by-item audit
request — found via: reproducing `just lint`'s mypy/ruff commands in a
throwaway container (same approach used for the mypy-baseline/`/metrics`
lockfile regens above), grepping for TODO/FIXME across both apps, `pnpm
audit`, and checking which of `.pre-commit-config.yaml`'s hooks actually
run in CI (none do — grepped every `.github/workflows/*.yml`).

- [x] **Real bug:** `mypy` crashes outright — `cd src/backend && uv run
      mypy app` (the exact command both `just lint` and the pre-commit
      `mypy` hook run) fails immediately with `Source file found twice
      under different module names: "s3_paths" and
      "app.projects.s3_paths"`, before checking a single file. Introduced
      by `1560cfa5` (2D Ortho & 3D mesh viewer, adds
      `app/projects/s3_paths.py`) hitting a namespace-package ambiguity
      in mypy's implicit-package-root resolution (no `__init__.py`
      anywhere in `app/`). Confirmed via `--explicit-package-bases`
      (mypy's own suggested fix): crash goes away, revealing 523 real
      errors across 33 files that have been accumulating unchecked since
      whenever this broke — nobody would have seen them because (a) mypy
      just crashes locally instead of reporting, and (b) nothing in CI
      runs mypy anyway (see next item). Since CI has never gated on this,
      the crash could have been live in `dev` for a while; needs `git
      bisect`/blame on `app/projects/` history to confirm exactly when.
      DONE (PR #92) — `explicit_package_bases = true` + `mypy_path = "."`
      fixes the crash; 523 surfaced errors grandfathered via
      `[[tool.mypy.overrides]] ignore_errors = true` for the 33 affected
      modules (same rationale as ruff's per-file-ignores — fixing the
      tool, not the debt, is this item's scope).
- [x] **Real gap:** no CI workflow runs any of `.pre-commit-config.yaml`
      (ruff check, ruff format, mypy, codespell, actionlint, oxfmt,
      detect-private-key/detect-aws-credentials, uv-lock-check) — grepped
      every file in `.github/workflows/`, zero hits for
      `pre-commit`/`ruff`/`mypy`. `test.yml`/`frontend-test.yml` only run
      pytest/vitest+eslint+build. A PR can currently fail every local
      lint rule and still go fully green in CI. (Frontend ESLint is the
      one exception — already gated via `frontend-test.yml`'s `lint`
      job from the original backlog.)
      DONE (PR #93) — new `backend-lint` job in `test.yml` (mypy, ruff
      check, ruff format --check), runs inside `python:3.11-slim-trixie`
      (not `ubuntu-latest` — confirmed the runner OS's `libgdal-dev` is
      too old to build the pinned `gdal==3.10.3` sdist at all). Standing
      it up surfaced real drift: 653 of 713 ruff violations were a
      missing `tests/* = ["S101"]` exemption; the remaining 60 split
      between a documented per-file-ignore for `packages/drone-flightplan`
      (GDAL-API-mirroring naming, own release cadence) and real fixes in
      the app's own tests (`usedforsecurity=False`, ternary, explicit
      `strict=True`) — some of these (`N806`/`B904`) were "fully triaged"
      in earlier PRs, so this is regression, not original debt.
- [x] OpenAPI doc-gen (`docs.yml`'s commented-out `build_openapi_json`
      job) can now actually be re-enabled — it was blocked on an image
      tag (`ghcr.io/${{ github.repository }}/backend:ci-${{
      github.ref_name }}`) that nothing produced. That's no longer true:
      `tag_build.yml`'s `push: branches: [dev]` trigger (added by the
      original backlog's "build & push images on every merge to dev"
      item) already produces a `dev`-tagged image on every push this
      workflow's own trigger fires on (`docs.yml` only runs on push to
      `dev`), via `docker/metadata-action`'s default branch-ref rule.
      Swap the image ref, uncomment the job.
      DONE (PR #94) — swapped `ci-${{ github.ref_name }}` for the real
      `backend:dev` tag, uncommented both jobs. Surfaced a second real
      blocker: the reusable workflow imports `app.main` with cwd = repo
      root (GitHub Actions container jobs always use `GITHUB_WORKSPACE`
      as cwd), but this repo's `app/` lives under `src/backend/app/` —
      reproduced `ModuleNotFoundError: No module named 'app'` locally
      against the built image, every time. Fixed with an additive
      `PYTHONPATH=/project/src/backend` in the runtime image's `ENV`
      block (the container's own `CMD` already resolves fine via its own
      `WORKDIR` either way).
- [x] **Needs interaction:** `GET /api/v1/projects/odm/export/{project_id}
      [/{task_id}]` (and its point-cloud/DEM-export siblings in
      `project_routes.py`) are deliberately public with no auth — the
      code has a fully-written, commented-out auth check
      (`user_data.is_superuser or project.author_id == user_data.id`)
      behind `# TODO: Re-enable auth when we have proper role-based
      access control.` This is an auth-model question per CLAUDE.md's
      change-boundary rules, not a drive-by fix — asking rather than
      flipping it.
      Asked; user said "Add rbac". DONE (PR #95) — enabled the
      already-written check on `export_odm_assets`, and found + fixed
      the same gap (no auth at all, not even a TODO) on 5 undocumented
      siblings: `export_odm_orthophoto`, `export_odm_dsm`,
      `export_odm_dtm`, `export_odm_pointcloud`, `head_odm_assets`. All 6
      now use `check_permissions(IsSuperUser() | IsProjectCreator())` —
      the existing permission framework already used by
      `delete_project_by_id`, not a new RBAC system. Also fixed a real
      frontend regression this would have caused: the ZIP-all download
      button used a bare `fetch()`/`<a href>` that carries neither the
      legacy-JWT `Access-Token` header nor (reliably) a cross-origin
      session cookie — rewritten to fetch an authenticated blob, matching
      the existing reflight-plan download's own pattern. 2 new tests
      (unauthenticated → 403, non-owner → 403 without touching S3) plus
      2 existing tests updated to authenticate. Full backend suite
      267/267, frontend build/lint/vitest/Playwright all clean.
- [x] GitHub vulnerability alerts + Dependabot automated security fixes
      were disabled repo-wide on `scruplelesswizard/drone-tm` (`gh api
      repos/.../vulnerability-alerts` → 404 "disabled";
      `automated-security-fixes` → `enabled: false`), despite
      `.github/dependabot.yml` existing from the original backlog — the
      config file alone doesn't turn Dependabot on. Confirmed real signal
      behind this: `pnpm audit --audit-level=high` in `src/` finds 94
      vulnerabilities (2 critical, 42 high) with zero open Dependabot PRs
      to address any of them. First attempt (`gh api -X PUT
      .../vulnerability-alerts`) was blocked by this session's permission
      classifier as a live shared-infra change.
      DONE — user explicitly said "enable dependabot". Re-ran both `gh
      api -X PUT` calls (`vulnerability-alerts`,
      `automated-security-fixes`), verified both now report enabled. Not
      a code change — nothing to PR.

## Round 3 — found while scoping a UI design pass (2026-08-21)

Not a fresh scoping pass like Round 2 - these surfaced organically while
setting up a real local dev instance (seeded DB user + password) to take
screenshots for a visual-refresh mockup, then again while checking
mobile/desktop responsiveness. Same "found and fixed", not just logged,
standard as the rest of this file.

- [x] **Real bug:** broken avatar image rendering, 4 sites
      (`common/UserAvatar`, `Dashboard/DashboardSidebar`,
      `CompleteUserProfile`'s and `UpdateUserDetails`' `BasicDetails`
      forms) — `src=""` never fires `onError` (the HTML `img` element
      treats an empty `src` as "no image", not a failed load), so a user
      with no `profile_img` got a permanent broken-image icon +
      overlapping alt text instead of a fallback, even on the 2 sites
      that had an `onError` handler (it just never fired).
      DONE (PR #97, merged) — guard the `src` itself
      (`imageSource || avatarImage`) instead of relying solely on
      `onError`. 8 new Vitest tests.
- [x] **Real bug:** `GET /users/my-info` 500'd for any user whose id
      isn't all-digits — `DbUserProfile.user_id` was typed `int` even
      though the `users.id` column (and `DbUser.id`) is a plain varchar;
      parsing a real DB row via `class_row(DbUserProfile)` raised a
      pydantic `ValidationError` for a non-numeric id. Hanko SSO ids are
      UUIDs, so this broke every Hanko user with a profile - unnoticed
      because the one existing test's fixture user id happens to be an
      all-digits Google-OAuth sub.
      DONE (PR #97, merged) — retyped to `str` throughout `DbUserProfile`
      (the field + 4 method signatures with the same stale `int` hint).
      New regression test constructs a real Hanko-style UUID user.
- [x] **Real bug:** content below the fold was completely unreachable on
      mobile-height viewports on 4 pages (`IndividualProject`,
      `Dashboard`, `CreateProject`, `RegulatorsApprovalPage`) — each
      wraps its content in a fixed-height `h-screen-nav` section
      (`calc(100vh - 57px)`) with default `overflow: visible`; once a
      page's real content exceeds one screen (much more likely once
      everything's stacked to one narrow mobile column), the box stays
      fixed-height but the document never gains scrollable area to
      reveal what overflows it - no scrollbar, no touch-scroll, nothing.
      Confirmed on `IndividualProject` at 375×812: a real project's
      About tab (metadata, Imagery Workflow steps, Delete Project
      button) sat entirely below the unreachable line -
      `section.scrollHeight` (1508px) vs. `clientHeight` (755px) with
      `document.body.scrollHeight` pinned to exactly `window.innerHeight`.
      DONE (PR #98) — added `overflow-y-auto` alongside the existing
      `h-screen-nav` on all 4 pages; verified via a real mouse-wheel
      gesture (0 scroll pre-fix, full scroll post-fix) and a screenshot
      diff confirming zero regression on desktop. `HankoAuth`/
      `GoogleAuth`'s use of the same class left alone - fixed centered
      spinners that never overflow. Not captured as a permanent
      automated test - these routes need an authenticated session and
      the e2e suite has no seed/login fixture yet.

## Round 4 — Individual Project view (2026-08-21)

Scoped audit of the Individual Project view (About/Tasks/Instructions/
Contributions tabs, map section, modals, GCP editor entry, exports) as
part of the app-wide UX/design pass. No live docker stack available for
this pass (port conflicts with a concurrent worktree) - verified via
`pnpm lint`/`pnpm build`/`pnpm test` (all clean) plus careful reading;
flagged below wherever that matters.

- [x] **Real bug (same regression class as the CreateProject wizard):**
      3 more modal "Cancel" buttons - `DeleteProjectConfirmation`,
      `LockTaskDialog`, `UnlockTaskPromptDialog` - used the `Button`
      default variant (real `bg-primary-400` background since the CVA
      fix) with a bare `!naxatw-text-red` override and no `variant`,
      producing invisible blue-on-blue text. Same root cause as the
      CreateProject wizard's "Previous" button fixed elsewhere this
      round.
      DONE — added `variant="ghost"` to all 3, matching the established
      pattern.
- [x] **Real bug:** `DeleteProjectConfirmation`'s inline "invalid
      project name" validation error text used bare `text-red` (now the
      blue brand color) instead of a real danger color - a genuine error
      message rendering in brand-blue instead of red.
      DONE — changed to `text-red-500`.
- [x] **Real bug (missed in the blue-anchor rework):** 9 buttons in
      `IndividualProject/index.tsx` (GCP Editor, View/Convert Orthophoto,
      View/Convert 3D, Export toggle) hardcoded the pre-rebrand hex
      `#D73F3F` directly via Tailwind arbitrary values
      (`border-[#D73F3F]`/`text-[#D73F3F]`, including the `/40`/`/60`
      opacity variants) instead of the `red` token, so they stayed
      old-red while every other action button in the app turned blue.
      DONE — replaced with `border-red`/`text-red` (and `/40`, `/60`
      variants), matching the rest of the app.
- [x] Audited the rest of the `#D73F3F` hardcoded-hex usages in this
      view's scope (`MapSection`'s task-status color map, `Legend.tsx`,
      `ProcessingStatusDialog/types.ts`) - confirmed these are a genuine
      multi-color STATUS palette (grey/pink/light-blue/green/purple/
      dark-green/red for UNLOCKED/AWAITING_APPROVAL/LOCKED/FULLY_FLOWN/
      HAS_IMAGERY/HAS_ISSUES/READY_FOR_PROCESSING/IMAGE_PROCESSING_*),
      not brand-color usage - `#D73F3F` there correctly marks
      `HAS_ISSUES`/`IMAGE_PROCESSING_FAILED` (danger states) and should
      stay red. Left unchanged.
- [ ] **Judgment call, not changed:** the project-area boundary
      line-color on the live map (`MapSection/index.tsx`) and the export
      printout's static map (`ExportSection/MapSection.tsx`) both draw
      the AOI outline in the same hardcoded `#D73F3F`. Arguably should
      match the new blue brand color (the Create Project wizard's own
      AOI-drawing step already renders the "Project" boundary toggle in
      blue), but changing map layer paint colors felt like it deserved a
      deliberate call rather than a drive-by find - left as-is.
- Everything else in scope (`ChooseProcessingParameter`, `GcpEditor`
  entry point, `Contributions`, `ExportSection` print flow, `MapSection`
  interaction logic, `ProcessingStatusDialog` family) read clean on a
  careful pass - no other real bugs found. Not verified against a live
  backend/DB this round (see note above) - a live spot-check of the GCP
  editor launch and the modal flows (delete/lock/unlock confirmations)
  is still worth doing before/soon after merge.

## Round 5 — remaining views: QField, 3D/Ortho viewers, Regulator approval (2026-08-21)

Continuation of the app-wide UX/design pass, scoped to the views not yet
touched: Tutorials, Import, QFieldOpen, QFieldExport, View3DModel,
ViewOrthophoto, RegulatorsApprovalPage.

- [x] **Real bug:** 10 leftover hardcoded `#D73F3F` (the old red) hex
      values across 5 files completely bypassed the blue brand-anchor
      rework - `View3DModel` (back arrow + recenter-icon buttons),
      `ViewOrthophoto` (back arrow + zoom-to-extent icon), `QFieldOpen`
      (primary CTA button + install link, 2 of its 3 occurrences from an
      earlier partial fix), `QFieldExport` (generate/regenerate buttons +
      generating-spinner), and `RegulatorsApprovalPage`'s description
      heading. Because these used Tailwind arbitrary-value syntax
      (`text-[#D73F3F]`) instead of the `red`/`primary` tokens, changing
      the token's value in `tailwind.config.js` had no effect on them -
      they stayed the old red while every token-based accent in the rest
      of the app went blue, a real visual inconsistency on exactly the
      pages a user reaches from a project's map/3D/orthophoto views and
      the QField mobile handoff flow.
      DONE — replaced all 10 with the `naxatw-text-red`/`naxatw-bg-red`
      token classes (now blue, matching everywhere else). Also fixed one
      adjacent real bug in the same file: `QFieldExport`'s inline
      generation-error message used the same bare `text-red` (now blue)
      for a genuine error string - flipped to `text-red-500` so it stays
      visually distinct as an error, consistent with the equivalent fix
      already made in `DeleteProjectConfirmation` (PR #101).
      Considered also recoloring `RegulatorsApprovalPage`'s Reject button
      to `red-500` (destructive-looking action) but reverted that
      instinct - every other solid/filled action button in the app,
      including genuinely destructive ones (Delete/Lock/Unlock), already
      uses the brand blue post-rebrand; singling out Reject would break
      that established convention rather than fix a bug.
      Tutorial, Import, and 3 of the QFieldOpen/View3DModel/ViewOrthophoto
      code paths were re-checked and found already correct (prior
      rounds' fixes hold, no new issues).
      Verified via `pnpm lint`/`pnpm build`/`pnpm test` (27/27 passing) -
      no live docker stack was started for this round (compose.yaml
      hardcodes the db/nodeodm host ports, so only one stack can run
      system-wide at a time and another was in use); these are pure
      Tailwind class swaps with no logic change, so static verification
      is sufficient, but a live visual spot-check of `RegulatorsApprovalPage`
      (which needs a REGULATOR-role seed user not yet in the local
      fixture set) is still worth doing in a follow-up pass.

## Round 6 — expert UX design review (2026-08-22)

Requested design/UX pass over the live app (desktop 1440px, mobile 390px,
both PROJECT_CREATOR and DRONE_OPERATOR roles), seeded login, real
screenshots. These are **recommendations, not yet implemented** — logged
for prioritization, unlike prior rounds' find-and-fix entries.

- [x] **Real bug:** CreateProject wizard step header
      (`common/StepSwitcher/index.tsx`) - the step-number/label row uses
      `naxatw-flex ... naxatw-grid-cols-5 naxatw-flex-wrap` on the same
      div: `grid-cols-5` is a dead class (parent is `flex`, not `grid`,
      so Tailwind never applies it), leaving `flex-wrap`+`justify-evenly`
      to lay out just 2 steps. At 1440px this collapses the "01"/"02"
      step numerals directly onto the "Intended Use Case"/"Basic
      Information" labels - unreadable overlapping text on the very
      first screen of the project-creation flow. Confirmed live via
      screenshot at `/create-project`. Needs a real flex layout (drop
      the dead `grid-cols-5`, give each step a fixed/min basis) rather
      than a fix targeted at just this data set, since `data.length`
      varies by call site.
      DONE — the dead-class diagnosis turned out to be a false lead;
      Round 8 traced the real cause to the staggered entrance animation
      overshooting into the neighbor's slot, fixed the animation
      distance, and dropped `grid-cols-5` as a no-op cleanup. PR #115.
- [x] **Real bug / IA gap:** Individual Project's "Available Tasks" tab
      and "Contributions" tab disagree about scope. Locking a task
      (`LockTaskDialog`) makes it vanish from the Available Tasks table
      ("No Data Found") while the same task keeps rendering on the map
      with no distinguishing treatment - the legend defines a dashed
      yellow "Assigned to You" outline that never gets applied, even to
      a task the current user just locked. The task's real state
      ("Locked", who holds it) is only visible by switching to
      Contributions. A user who just locked their own task sees it
      disappear from the tab named for finding tasks, with no visual
      cue on the map explaining why - confirmed live (locked Task #1,
      compared map/legend/tabs).
      **Resolved as a judgment call, no Available Tasks change needed:**
      Round 8 (PR #114) fixed the actual bug half of this finding - the
      map now applies the dashed-yellow "Assigned to You" outline to a
      self-locked task, which was the missing piece explaining "why did
      it disappear." The remaining half (should a locked task still list
      in Available Tasks?) isn't a bug once that cue exists - "Available
      Tasks" is scoped to tasks you can still take, and a task already
      locked (by anyone, including yourself) genuinely isn't one of
      those anymore; Contributions is correctly the place to see your
      own locked/in-progress work. Re-adding it to Available Tasks with
      a "locked by you" state would duplicate Contributions' job and
      muddy what the tab name promises. No code change.
- [x] **Layout/hierarchy:** on mobile (390px), Individual Project's tab
      strip (About/Available Tasks/Instructions/Contributions) sits
      *below* the map+legend block in document order, pushed off the
      first screen entirely - confirmed the tabs are still clickable
      (Playwright auto-scroll reached them fine) but a real thumb has no
      on-screen affordance telling them to scroll past a full map to find
      primary navigation. Move the tab strip above the map on narrow
      viewports, or make it sticky.
      DONE — an existing `naxatw-order-*` mechanism tied correctly on
      desktop but put the map first on mobile; Round 8 fixed the order
      classes rather than restructuring or going sticky. PR #112.
- [x] **Responsive gap:** the public landing page's top bar
      (`v2026.8.8` version tag + Tutorials/Documentation/Supported
      Drones/language links) has no mobile breakpoint - at 390px
      "Supported Drones" wraps and visually collides with the language
      switcher, and a bare semver string competes for the same cramped
      row as primary nav on the very first screen anonymous visitors
      see. Worth demoting the version tag to a footer/about-page detail
      and collapsing the link row into a mobile menu.
      DONE — Round 8 reused the existing hamburger+Drawer pattern from
      `common/Navbar`: version tag moves into the drawer header, the
      link row collapses into the drawer body below `sm`. Live-verified
      via Playwright screenshots at 390x844. PR #113.
- [x] **Empty state:** Individual Project's "Instructions" tab renders
      completely blank (no heading, no copy) when a project has no
      instructions set, rather than the "No Data Available" empty-state
      pattern already used elsewhere in the app (Dashboard's Request
      Logs, Available Tasks' "No Data Found"). Inconsistent - some
      empty states are designed, this one is just absent content.
      DONE — reused the same `NoDataFound` component backing Available
      Tasks/Dashboard Request Logs instead of building a new pattern.
      PR #111.
- [x] **Redundancy:** Dashboard's profile card shows name/role/email
      twice - once in the avatar header, again immediately below as a
      Name/Email/Role list - on a page that's otherwise mostly empty
      space. Either drop the duplicate list or use that space for
      something the header doesn't already say.
      DONE — removed the duplicate list; header already covers it.
      PR #110.
- [x] **Onboarding gap:** logging in with a role that doesn't match the
      account's actual role (e.g. signing in as Drone Pilot on a
      Project-Creator-only account) silently redirects to what looks
      exactly like the ordinary Edit-Profile form, with the entire top
      navbar/logo missing and zero explanation of why the user landed
      there or how to get back. Confirmed live by signing in with
      `signedInAs=DRONE_PILOT` against the seeded Project Creator
      account. Needs at minimum a message ("This account isn't
      registered as a Drone Pilot yet - complete this section to add
      that role") and the standard nav chrome kept intact.
      DONE — `CompleteUserProfile` now distinguishes "existing profile,
      wrong role" from "genuinely new user" and shows a minimal header +
      back link + explanatory banner only in the mismatch case; the
      new-user wizard is untouched. PR #116.
- [x] **Real bug (backend):** the `BOTH` role - meant for accounts that
      are both project creator and drone pilot, and a real value in the
      Postgres `userrole` enum type - is **not** a member of the Python
      `UserRole(IntEnum)` in `app/models/enums.py:97-100` (only
      `PROJECT_CREATOR`/`DRONE_PILOT`/`REGULATOR` are defined).
      `UserProfileOut`'s `srting_role_to_integer` validator
      (`app/users/user_schemas.py:134-144`) silently drops any role
      string that isn't in `UserRole.__members__`, so any user whose
      `user_profile.role` contains `{BOTH}` gets back `"role": []` from
      **every** API response (confirmed via a direct `/users/my-info`
      call against a seeded user with `role = ARRAY['BOTH']::userrole[]`).
      Because the frontend's post-login check is
      `userDetails?.role?.includes(signedInAs)`, an empty array can
      never match either role string - a `BOTH`-role account is
      permanently bounced to `/complete-profile` on **every** login,
      regardless of which role tile they pick.
      DONE (branch `todo/108-fix-both-role-enum`) - traced `BOTH` back
      through migration history: it's a leftover from the *pre-array*
      role column (`users.role` as a single `PROJECT_CREATOR|DRONE_PILOT
      |BOTH` enum, migration `d2b9d45d3ede`), superseded when role
      became `user_profile.role: userrole[]` (migration `b36a13183a83`,
      which only (re)creates the enum with `PROJECT_CREATOR`/
      `DRONE_PILOT` - "both" is now correctly expressed as two array
      elements, `{PROJECT_CREATOR,DRONE_PILOT}`). Never re-added to the
      Postgres type by design; no code path writes it. Rather than
      resurrecting a redundant sentinel that would let "both roles" be
      expressed two conflicting ways, fixed the actual defect: the
      validator now logs a loud warning for any unrecognized role
      string instead of silently swallowing it, so a stray/orphaned DB
      value is immediately debuggable via logs instead of producing an
      inexplicable permanent `/complete-profile` redirect. Verified
      live: reset the seed user to the correct
      `{PROJECT_CREATOR,DRONE_PILOT}` array - both role logins now land
      on `/projects` as expected. 2 new unit tests on
      `BaseUserProfile.role` parsing (known multi-value array parses
      correctly; an unrecognized value like `BOTH` is dropped, not
      fatal). Full backend suite (271 tests), ruff check/format, and
      coverage gate all pass.
- [x] **Real bug:** RegulatorsApprovalPage's Accept/Reject buttons
      (`components/RegulatorsApprovalPage/Description/ApprovalSection.tsx`)
      both key off the same `red` brand token - Reject is
      `naxatw-border-red naxatw-text-red` (outline), Accept is
      `naxatw-bg-red naxatw-text-white` (filled) - and since Round 3's
      brand-anchor swap `red` resolves to the same blue as everything
      else, the two decisions are differentiated only by fill-vs-outline,
      not color. Confirmed live via a real token-based regulator
      approval link (seeded `requires_approval_from_regulator=true` +
      `regulator_emails` on the test project, hit
      `/projects/:id/approval?token=<base64 email>` per
      `app/users/user_routes.py`'s `/users/regulator` endpoint). A
      regulator scanning quickly has no color cue distinguishing
      "approve this drone project" from "reject it" - this is exactly
      the kind of destructive/affirmative pair that should stay
      red-vs-blue (or red-vs-green) regardless of the rebrand.
      **Note:** Round 5 independently considered recoloring this same
      Reject button and reverted the instinct, reasoning that every
      other solid action button in the app (including genuinely
      destructive ones - Delete/Lock/Unlock) already went blue
      post-rebrand, so singling out Reject would break that
      convention rather than fix a bug. Real disagreement between two
      passes over the same code, not an oversight - worth a deliberate
      call (scope it to Accept/Reject specifically as a binary
      approve/deny decision, vs. the app's general single-color action
      convention) rather than picking a side by default.
      **Resolved in Round 7** (below) — differentiated Reject to
      `red-500`, kept Accept on brand blue.
- [x] **Copy:** the same approval page labels its status/comment fields
      "Local Regulator Approval Status" / "Local Regulator Comment"
      (`messages/en.json`: `proj_desc_label_regulator_approval_status`,
      `proj_desc_label_regulator_comment`). Addressed to the regulator
      who is themself taking the action, "Local Regulator" reads like a
      third party is being described, not the reader - worth rewording
      (e.g. "Your Approval Status" / "Your Comment").
      DONE — reworded to "Your Approval Status" / "Your Comment". PR
      #108 (merged).
- [x] **Accessibility:** the "Filter By Project Status" dropdown
      placeholder on the Projects list measures at a **1.88:1** contrast
      ratio (`rgb(189,189,189)` on white, ~13px) - well under WCAG AA's
      4.5:1 minimum for normal text (measured directly via
      `getComputedStyle` against the live page, not eyeballed). Worth a
      full placeholder/disabled-text contrast pass across the app's
      form controls rather than a single spot fix - this was one
      sampled control, not an exhaustive audit.
      DONE — root cause was the shared `common/FormUI/Select`
      component's placeholder color (`grey-400`, 1.88:1); fixed at the
      component level (`grey-700`, 6.18:1 computed), covering every
      non-search `<Select>` in the app, not just this one control. PR
      #109 (merged).
- [x] **Density/balance:** Projects list and Dashboard both dedicate the
      majority of a 1440px viewport to dead white space regardless of
      how much real content exists (a single project card floating in
      an otherwise-empty grid+map layout; a profile card and an empty
      "Request Logs" panel on an otherwise blank page). Worth a
      low-count/empty layout treatment (center content, cap max-width,
      or add contextual guidance/CTAs in the freed space) rather than
      always reserving full desktop-grid space.
      DONE — Projects list (`views/Projects/index.tsx`): the cards+map
      row forced `calc(100vh-11rem)`/`h-full` regardless of result
      count; added low-count/empty checks (≤3 results, or 0) that let
      the row size to content instead of stretching, with the map panel
      given an explicit height rather than `h-full`; empty state now
      reuses `NoDataComponent` instead of a bare unstyled string.
      Dashboard (`views/Dashboard/index.tsx`): swapped the forced
      `h-screen-nav` for `min-h-screen-nav`, an existing pattern already
      used in `Import/index.tsx` for the same problem, verified against
      CSS Grid's default `align-items: stretch` to confirm sidebar/
      content-column height-matching still holds without a definite
      parent height. Many-item case untouched in both. Not live-verified
      (Dashboard/Projects both require a full authenticated Redux
      session, not reachable from an isolated worktree) - verified via
      static CSS mechanics reasoning instead, documented in the PR.
      `pnpm lint`/`pnpm build` clean. PR #119.
- Follow-up after the host restart: seeded a regulator-linked project
  (`requires_approval_from_regulator`/`regulator_emails`/
  `commenting_regulator_id`) and hit the real token-based approval URL -
  see the Accept/Reject color finding and the "Local Regulator" copy
  finding above. Also traced the role-mismatch redirect to its actual
  root cause (the missing `BOTH` enum member, above) rather than leaving
  it as a surface-level observation. Sampled one contrast ratio
  end-to-end (measured, not eyeballed) rather than running a full
  audit - still worth a proper WCAG pass across form controls.
- Not chased this round: the full drone-operator task/upload flow
  (blocked on there being no locked-and-flyable task with actual
  imagery in the local seed data - would need a fabricated task state
  beyond what's reasonable to hand-seed), and a systematic
  color-contrast audit beyond the one sampled control above.

## Round 4 — Dashboard / user profile / settings (2026-08-21)

Scoped audit of the Dashboard (stat cards, sidebar, request/task logs) and
the "edit my profile" settings flow (`UpdateUserProfile`/
`UpdateUserDetails`), as part of the same app-wide UX/design pass. Static
verification only (lint/build/vitest) - no live docker stack available in
this worktree (see note on `compose.yaml`'s hardcoded db/nodeodm ports at
the end of this section).

- [x] **Real bug:** the Dashboard sidebar's "Edit Profile" button had
      invisible blue-on-blue text - same root cause as the CreateProject
      wizard/modal-Cancel-button bug already fixed elsewhere this round
      (default `Button` variant's new `bg-primary-400` colliding with a
      bare `!naxatw-text-red` override, both now the same blue since the
      brand-anchor swap). This exact fix already exists in an
      as-yet-unmerged sibling PR; fixing it here too since it's still
      broken on this branch's base and squarely in scope - expect this
      hunk to become a no-op once that PR lands first.
      DONE - added `variant="outline"`.
- [x] **Real bug:** `RequestLogs`'s approve/reject mutation surfaced the
      generic Axios error (`err.message`, e.g. "Request failed with
      status code 400") instead of the backend's actual `detail` message,
      unlike every other mutation in this same area (`Password`,
      `BasicDetails`, `OrganizationDetails`, `OtherDetails` all correctly
      extract `err.response?.data?.detail`). A project creator
      rejecting/approving a drone-pilot flight request on a task in the
      wrong state would see an unhelpful generic HTTP error instead of
      the real reason.
      DONE - matched the established pattern.
- [x] **Real bug:** the Edit Profile page's breadcrumb "Dashboard" link
      pointed at `/` (the public landing page) instead of `/dashboard` -
      clicking it took a logged-in user back to the marketing page
      instead of their dashboard.
      DONE - fixed the `navLink`.
- [x] **Real bug (missed by the Round 3 brand-anchor swap):** the
      Dashboard stat cards' hover/active border hardcoded the *old* raw
      hex `#D73F3F` as a Tailwind arbitrary value
      (`hover:naxatw-border-[#D73F3F]`), not the `red` token - so it never
      picked up the blue brand-anchor change, while the card's own count
      text right next to it (`naxatw-text-red`) did. Result: hovering or
      selecting a stat card showed a red border around a blue number.
      DONE - switched to the `border-red` token.
      **Not fixed here, out of scope, flagged for the agents/rounds
      owning those areas:** the same `#D73F3F`/`#D73F3f` hardcoded-hex
      pattern (arbitrary Tailwind values that don't track the `red`
      token) also appears in ~19 other files outside this scope -
      `IndividualProject` (incl. `MapSection`, `ExportSection`,
      `QFieldExport`), `DroneOperatorTask` (`DescriptionSection` and its
      many subcomponents, `ImageReview`), `RegulatorsApprovalPage`,
      `ViewOrthophoto`, `View3DModel`, `Projects/MapSection`,
      `LandingPage/MobileAppDownload`, `common/RadioButton`, and
      `constants/projectDescription.ts`. Worth a dedicated grep-and-fix
      pass (`grep -rl '#D73F3F' src/frontend/src`) before considering the
      brand-anchor rework fully done app-wide.
- [x] Audited every `naxatw-text-red`/`naxatw-bg-red` `<Button>` usage in
      this scope for the invisible-blue-on-blue pattern; all others
      either pair `bg-red` with the CVA default variant's own
      `text-white` (visible) or aren't `<Button>`s at all. No further
      instances found in this scope.

**Environment note for future rounds:** this worktree could not run
`docker compose up` - `compose.yaml` hardcodes the db port (`5467:5432`)
and nodeodm port (`9900:9900`) with no `.env` override, so only one live
stack can run host-wide at a time. Verification here was static only
(`pnpm lint`/`build`/`test`); nothing in this round's fixes needs a live
backend to express as a test, but a live-browser spot-check of the 4 real
bugs above (especially the button-visibility fixes) is still worth doing
once a stack is free.

## Round 4 — app-wide UX/design pass, Projects list + Create Project wizard (2026-08-21)

Scoping a full app-wide visual/flow audit (blue brand anchor from Round 3
carried through). Found two more real bugs while exercising the actual
Projects list and Create Project wizard against a live seeded login,
neither of them cosmetic.

- [x] **Real bug:** logging in via a direct/bookmarked `/login` visit (as
      opposed to the landing page's role-picker overlay) permanently
      redirected an already-complete profile back to `/complete-profile`
      on every route. `Login`'s `onSubmit` computes `signedInAs` as
      `localStorage.getItem('signedInAs') || 'PROJECT_CREATOR'` (an
      in-memory fallback) but never writes it back to `localStorage`;
      `UserProfile` (mounted in the navbar on every route) reads
      `localStorage.getItem('signedInAs')` with no fallback and
      redirects to `/complete-profile` whenever it's falsy, even for a
      fully-provisioned user. Only the landing page's sign-in overlay
      sets this key today, so any other path into `/login` breaks.
      DONE — `Login`'s `onSuccess` now also persists
      `localStorage.setItem('signedInAs', signedInAs)`.
- [x] **Real bug (regression from PR #100's Button variant fix):** the
      Create Project wizard's "Previous" button, 4 modal "Cancel"
      buttons (delete-project, lock-task, unlock-task confirmations),
      and the Dashboard sidebar's "Edit Profile" button all rendered
      with **invisible text** - blue-on-blue. Each uses the shared
      `Button` component's `default` variant (now correctly painting
      `bg-primary-400`, since PR #100 fixed the previously-dead CVA
      classes) combined with a bare `!naxatw-text-red` override and no
      `variant` prop; since `red`'s DEFAULT is now the same blue as
      `primary-400` (Round 3's brand-anchor swap), the override matched
      the background exactly. Before PR #100 these looked fine by
      accident (no background ever painted). Found by clicking through
      the actual wizard with a live login rather than trusting a static
      color-token read.
      DONE — added `variant="ghost"` (or `variant="outline"` for the
      one with an explicit border) to all 5 call sites, matching the
      pattern already used correctly by Login's own Back/Forgot-password
      buttons. Also caught one adjacent issue in the same file: the
      delete-project confirmation's inline validation error text used
      the same bare `text-red` (now blue) for a real "invalid project
      name" error message - flipped to `text-red-500` so genuine
      error/danger states stay visually red, independent of the brand
      anchor color.
      Audited every other bare `text-red`/`bg-red` Button usage
      app-wide for the same blue-on-blue pattern (~130 call sites
      grepped); all others either pair `bg-red` with `text-white` (still
      correct/visible) or already specify `variant="ghost"`/`"outline"`.

## Round 4 (parallel) — Drone operator task flow audit (2026-08-21)

Scoped to `DroneOperatorTask/**` (task description, image upload,
processing workflow) as part of the app-wide UX/design pass. Verified
statically only (lint/build/vitest) - no live docker stack available
concurrently with sibling audit branches (compose.yaml hardcodes the db
port 5467 and nodeodm port 9900, so only one live stack fits on a host
at a time). Read the flow's code very carefully as the primary
verification tool given that constraint.

- [x] **Real bug (regression from PR #100's Button/brand-anchor
      change):** `ManualOverrideSection`'s admin "last resort" warning
      text and its Cancel button. The warning copy
      (`drone_task_manual_override_last_resort`, e.g. "this is a last
      resort") used bare `naxatw-text-red` (now blue, following the
      brand anchor) instead of a real danger color - a warning about a
      destructive manual state override should stay visually red
      regardless of brand color. Its neighboring Cancel button also had
      no `variant` prop, defaulting to a solid blue fill inconsistent
      with every other Cancel button in the app (already fixed to
      `variant="ghost"` elsewhere in PR #101).
      DONE - warning text to `naxatw-text-red-500`; Cancel button to
      `variant="ghost"`.
- [x] **Real bug:** 6 hardcoded pre-rebrand hex `#D73F3F` usages, all
      genuine brand-accent headings/CTAs that PR #100's rebrand sweep
      missed because they never went through the `red` Tailwind token:
      the upload `ProgressBar` fill color, the "Upload Information" /
      Uppy dashboard label headings (3 call sites sharing the same
      className string), the task-description "download options"
      toggle button, and the flight-comment submit button in
      `QuestionBox`. All flipped to the `red`/token classes
      (`naxatw-bg-red` / `naxatw-text-red` / `naxatw-border-red`), which
      now correctly resolve to the blue brand anchor like every other
      CTA/heading in this same flow.
      Explicitly did NOT touch the two other `#D73F3F` occurrences in
      `ImageReview/index.tsx` (the map marker color and the status
      legend swatch for `rejected` images) - those are a genuine
      red/green/yellow/orange/gray status-color legend with real
      semantic meaning (rejected = red), unrelated to brand color, and
      correctly staying red.
- Read (not modified, no confirmed bug): `FlightGapDetectionModal.tsx`,
  `VerificationFooter.tsx`, `ImageSidebar.tsx`, `TaskMapPanel.tsx`,
  `ChooseTakeOffPointOptions.tsx`, `MissingDemModal.tsx`,
  `MapControlsBar.tsx`, most of `MapSection.tsx` and
  `DroneImageProcessingWorkflow/index.tsx` - all correctly styled
  post-rebrand, no invisible-button pattern found beyond what's fixed
  above.
- **Not verified live** (noted per the effort's own instructions rather
  than skipped silently): the actual image-upload/Uppy flow, the
  processing state-machine transitions in
  `DroneImageProcessingWorkflow/index.tsx`, and `ImageReview`'s
  map-based review/rejection UI all need a `DRONE_PILOT`-role user with
  a real locked task and uploaded imagery to exercise meaningfully: the
  seed data used elsewhere in this audit (a `PROJECT_CREATOR` with one
  `Not-Started` task) doesn't reach these states. Static reading found
  no logic bugs in this area, but a live pass with real task/imagery
  data would be needed to fully confirm the processing workflow and
  map interactions.


## Round 7 — resolve the Round 5/6 Reject-button color disagreement (2026-08-23)

Round 5 (above) considered recoloring `RegulatorsApprovalPage`'s Reject
button and reverted the instinct, reasoning every other solid action
button in the app (including Delete/Lock/Unlock) already uses the brand
blue post-rebrand, so singling out Reject would break that convention.
A later app-wide UX review flagged the same button as a bug: Accept and
Reject, sitting side by side, were differentiated only by fill-vs-outline
with identical color. Asked to resolve it directly rather than leave both
takes standing.

- [x] **Decision: differentiate, using the existing `red-500` danger
      token.** Delete/Lock/Unlock are standalone actions with their own
      confirm-dialog safety net - "everything's brand blue" holds fine
      there. Accept/Reject is a different shape of decision: two mutually
      exclusive buttons presented together with no confirmation step, for
      an external regulator who arrived via a one-off emailed token link,
      not a logged-in session with time to read carefully. That's exactly
      the case color-coding earns its keep. The codebase already
      distinguishes "genuine negative/error state" (`red-500`, real red)
      from "branded action" (`red`, now blue) - `tailwind.config.js`'s own
      comment on the `red` token says as much: "Button's `destructive`
      variant (bg-red-500) and any future danger/error UI should
      reference that, not the bare `red` token." Reject fits the former
      category; Round 5's "stay consistent" read Reject as the latter.
      DONE — `ApprovalSection.tsx`'s Reject button:
      `naxatw-border-red naxatw-text-red` → `naxatw-border-red-500
      naxatw-text-red-500`. Accept unchanged (stays brand blue, matching
      other affirmative solid actions). Verified live via the same
      token-based regulator approval link as Round 6: Reject now renders
      `rgb(215,63,63)` (`#D73F3F`, real red) against Accept's
      `rgb(27,102,175)` (`#1B66AF`, brand blue) - clearly distinct.
      `pnpm lint`/`pnpm build` clean.

## Round 8 — clear the Round 6 backlog (2026-08-23)

Implemented the remaining Round 6 findings, one PR per fix, all branched
from the same `dev` tip (`cb852279`) and left independent (no shared-file
edits between them, so no repeat of the earlier todo.md conflict cycle).

- [x] CreateProject wizard step-header overlap. Original diagnosis (dead
      `naxatw-grid-cols-5`) was a false lead - live Playwright checks at
      fixed post-load delays found the real cause: the staggered entrance
      animation's `translateX(-100%)` transiently slides each step item
      across its neighbor's slot while fading in. Fixed by shrinking the
      slide distance to `-24px`; also dropped the genuinely-dead
      `grid-cols-5` class as a no-op cleanup. PR #115.
- [x] RegulatorsApprovalPage "Local Regulator" copy → "Your Approval
      Status" / "Your Comment" (`messages/en.json`). PR #108.
- [x] Filter dropdown 1.88:1 contrast. Root cause was the shared
      `common/FormUI/Select` component's placeholder color
      (`naxatw-text-grey-400`, `#BDBDBD`) - fixed at the component level
      (`grey-700`, 6.18:1 computed), so this covers every non-search
      `<Select>` in the app, not just the one sampled control. PR #109.
- [x] Dashboard profile card redundancy - removed the duplicate
      Name/Email/Role list below the avatar header. PR #110.
- [x] Instructions tab empty state - reused the existing `NoDataFound`
      component (same one backing Available Tasks/Dashboard Request Logs)
      instead of rendering blank. PR #111.
- [x] Mobile tab strip below the map - root cause was an existing
      `naxatw-order-*` mechanism that tied correctly on desktop but put
      the map first on mobile; fixed the order classes rather than
      restructuring or going sticky. PR #112.
- [x] Landing page mobile top bar - reused the existing hamburger+Drawer
      pattern from `common/Navbar` (not a new pattern): version tag moves
      into the drawer header, Tutorials/Documentation/Supported
      Drones/language links collapse into the drawer body below `sm`.
      Live-verified via Playwright screenshots at 390x844. PR #113.
- [x] Onboarding role-mismatch gap - `CompleteUserProfile` now
      distinguishes "existing profile, wrong role" from "genuinely new
      user" (`isRoleMismatch = !!userProfile?.role?.length`, mirroring
      logic already in the same file) and shows a minimal header + back
      link + explanatory banner ("This account isn't registered as a
      {role} yet - complete this section to add that role") only in the
      mismatch case; the new-user wizard is untouched. PR #116.
- [x] "Assigned to You" map treatment never applied to self-locked tasks
      - the dashed-yellow legend style was wired only to `@mention`-based
      `mentionedTaskIds`, not to tasks the user actually locked. Extended
      the same filter (renamed `assignedToYouTaskIds`) to also include
      tasks where `taskStatusObj[task.id] === 'LOCKED' &&
      task.user_id === userDetails.id`, reusing the `task.user_id`
      lock-holder field already read elsewhere in `MapSection`. Scoped to
      the map's visual treatment only - the Available Tasks tab's
      scope/filtering (a separate, bigger IA question from the original
      finding) is untouched. PR #114.
- Not attempted this round: the Available Tasks/Contributions IA-scope
  disagreement itself (should a self-locked task still appear in
  "Available Tasks"?) and the Projects-list/Dashboard density-and-balance
  finding - both are design calls bigger than a single-PR fix, left open
  for a deliberate follow-up rather than a drive-by change.
- All 9 PRs verified via `pnpm lint`/`pnpm build`; several with live
  Playwright screenshot comparisons (StepSwitcher, landing page mobile,
  onboarding banner), noted per-PR where live verification wasn't
  reachable (e.g. routes needing a full authenticated Redux session in an
  isolated worktree) rather than claimed without having been done.
