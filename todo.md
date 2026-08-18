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
- [x] Add lint + typecheck + build gate for the frontend on PRs — `build`
      job (`tsc && vite build`, builds the `gcp-editor` sibling package
      first) is a hard gate; `lint` is non-blocking
      (`continue-on-error` on the eslint step, not the job, so it stays
      non-blocking even once branch protection requires the check) since
      the ~6600 pre-existing violations below aren't this PR's to fix.
      Flip `lint` to blocking once that backlog clears.
- [x] Turn on dependency vulnerability scanning — added Dependabot
      (`.github/dependabot.yml`) for `uv` (backend + drone-flightplan
      workspace member), `npm` (pnpm workspace: frontend + gcp-editor),
      `github-actions`, and `docker` (backend + frontend release images).
      `contrib/pg-upgrade/Dockerfile` deliberately excluded — it pins
      specific PostGIS major versions as upgrade-path steps, not a
      normal deployed image. CodeQL not covered by this item — no code-
      scanning config added.
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

## Accessibility & Design System (WCAG 2.2 AA)

New backlog domain, added 2026-08-16 from a standards audit (WHATWG HTML,
WCAG 2.2 AA, ARIA APG, ISO 9241-110/210, OWASP ASVS, Core Web Vitals,
i18n) requested against `src/frontend`. Findings below are from a fast
targeted scan, not the full multi-day audit the standards list implies -
each is a real, file-specific issue, but this is a punch list to start
from, not exhaustive coverage of every category (performance and OWASP
ASVS in particular haven't been scanned yet).

### Critical

- [ ] Base `Modal` component has no dialog semantics, no Escape handler, no
      focus trap (`components/common/Modal/index.tsx`, used by 7+ callers
      incl. `DeleteProjectConfirmation`, `UnlockTaskPromptDialog`,
      `ChooseProcessingParameter`, `UploadToOAM`). Has `tabIndex={-1}` but
      no `role="dialog"`/`aria-modal`/`aria-labelledby`; Tab can leave the
      dialog into background content. WCAG 2.4.3, 4.1.2; ARIA APG Dialog
      pattern.
- [ ] `Icon` component's keyboard handler is a no-op
      (`components/common/Icon/index.tsx:17-26`): `role="button"
      tabIndex={0} onKeyUp={() => {}}` — looks accessible but Enter/Space
      does nothing. Every icon-only control built on it (57 usages: close,
      delete, sync, download, zoom, etc.) is keyboard-unusable, and none
      pass `aria-label` (accessible name falls back to the icon ligature
      text, e.g. "close", fragile if the icon font fails to load). WCAG
      2.1.1, 4.1.2.

### High

- [ ] `Breadcrumb` keyboard handler is also a no-op
      (`components/common/Breadcrumb/index.tsx:20-23`) - real navigation
      only happens in `onClick`. WCAG 2.1.1.
- [ ] `ProjectCard`'s clickable div uses `role="presentation"` (removes it
      from the accessibility tree) and has no `tabIndex`/`onKeyDown`
      (`components/Projects/ProjectCard/index.tsx:33-37`) - the main
      navigation target for every project in the grid is unreachable by
      keyboard/screen reader. WCAG 2.1.1, 4.1.2.

### Medium

- [ ] Heading hierarchy: three `<h1>`s in one section
      (`components/IndividualProject/ExportSection/index.tsx:16,48,55`).
      Should be one `h1` + `h2`/`h3` for subsections. WCAG 1.3.1, 2.4.6.
- [ ] `SearchInput`/`Select` rely on `placeholder` only, no
      `<label>`/`aria-label` (`components/common/FormUI/SearchInput/index.tsx:27-34`,
      `components/common/FormUI/Input/index.tsx`,
      `components/common/FormUI/Select/index.tsx:113-117`). Placeholder
      text isn't a reliable accessible name (it disappears on input). WCAG
      1.3.1, 4.1.2.
- [ ] `Drawer` has `role="dialog"`/`aria-modal`/Escape handling (good) but
      no focus trap or initial focus on open
      (`components/common/Drawer/index.tsx`) - Tab can still leave the
      panel. WCAG 2.4.3.
- [ ] Fixed-width label containers risk text clipping on longer-language
      translations:
      `components/RegulatorsApprovalPage/Description/DescriptionSection.tsx:156,168,183`
      (`w-[146px]`) and
      `components/IndividualProject/ExportSection/index.tsx:22,25,30,33,38,41`
      (`w-28`) on translated field labels - should be `min-w` not fixed
      `w-`. i18n text-expansion guidance.
- [ ] No `prefers-reduced-motion` or `prefers-color-scheme` support
      anywhere (confirmed via repo-wide grep - zero matches).
      `tailwind.config.js` defines several transform/scale/opacity
      animations with no reduced-motion variant.  `darkMode: "class"` is
      configured but no toggle mechanism was found using it. WCAG 2.3.3.

### Low

- [ ] Verify `dangerouslySetInnerHTML` usages are sanitized, not raw
      API/user data: `components/IndividualProject/QFieldExport/index.tsx`,
      `components/common/MapLibreComponents/{AsyncPopup,NewAsyncPopup}/index.tsx`
      (MapLibre popups render feature-derived content),
      `components/Dashboard/RequestLogs/index.tsx`. OWASP ASVS (XSS).
- [ ] `alt=""` on a meaningful profile image in the task-lock user list
      (`components/IndividualProject/ModalContent/LockTaskDialog.tsx:209-213`)
      - other avatars in the codebase use descriptive alt text; this one
      conveys user identity but is marked decorative.

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
- [ ] Triage the remaining ~640 errors + 21 warnings `eslint .` still
      reports (mostly `@typescript-eslint/no-explicit-any` at 448 sites,
      `@typescript-eslint/ban-ts-comment` at 78, plus a long tail —
      `no-nested-ternary`, `consistent-return`, `no-shadow`,
      `jsx-a11y/*`, etc.) — not auto-fixable, needs individual review.
      Doing this in reviewable batches, mechanical/low-risk rules first:
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
      - [ ] `@typescript-eslint/no-explicit-any` remaining ~399 sites -
            continue in file/directory batches. `MapSection.tsx` (both the
            IndividualProject and DroneOperatorTask ones),
            `ImageReview.tsx`, and `common/MapLibreComponents/types/index.ts`
            are the largest remaining concentrations.
      - [ ] Everything else listed above, still open.
- [ ] Propagate the new request ID (`RequestIDMiddleware`, `main.py`) into
      arq jobs enqueued from a request, so a job can be traced back to the
      HTTP request that triggered it. Needs touching every enqueue call
      site to pass the ID through job kwargs/context - not attempted as
      part of adding the middleware itself.
- [ ] Regenerate `uv.lock` again once `prometheus_client` (or whichever
      package gets picked, see the `/metrics` item above) is added as a
      dependency - same container-based process used for the mypy lockfile
      fix.
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
- [ ] **Needs interaction:** every PR that triggers a test workflow should
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
