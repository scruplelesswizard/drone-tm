# Map library usage spike — findings

Status: **spike findings, not a decision record.** Filed at the request of
the Frontend P3 backlog item ("investigate dropping one of two map
libraries"), which explicitly said any removal needs this spike first. No
code was changed to produce this document. Not added to `README.md`'s ADR
index since it doesn't record a decision.

## Context and problem statement

`src/frontend` depends on two mapping stacks: MapLibre GL JS (+ Mapbox GL
Draw for AOI/task drawing) and OpenLayers (`ol`). Two libraries doing
overlapping jobs is maintenance and bundle-size debt. This spike surveys
actual usage to answer: is there real overlap, and if so, is consolidation
onto one library feasible without a rewrite?

## What was found

**Usage is extremely asymmetric.** MapLibre GL is imported in 25 files
across the app: the main project map, task map, GCP workflows, flight-gap
detection, drawing tools, popups. `ol` is imported in exactly **one** file:
`components/IndividualProject/ModalContent/TaskOrthoCogViewer.tsx`.

**The sibling `@hotosm/gcp-editor` package depends on `maplibre-gl`
independently** (its own `package.json`, not `ol`). MapLibre stays in the
dependency tree regardless of anything decided here; `ol` has no other
consumer in the workspace.

**There is real, concrete functional overlap**, not just two libraries
coexisting for unrelated reasons. Both are used to render Cloud-Optimized
GeoTIFF (COG) orthophotos:

- `components/common/MapLibreComponents/COGOrthophotoViewer/` — MapLibre GL,
  via the already-installed `@geomatico/maplibre-cog-protocol` package.
  Renders the project orthophoto as a layer *inside* the main interactive
  project map (`IndividualProject/MapSection`), composited with task
  boundaries and other vector layers.
- `TaskOrthoCogViewer.tsx` — OpenLayers, via `ol/source/GeoTIFF` +
  `ol/layer/WebGLTile`. A standalone, portal-rendered modal viewer for a
  single task's orthophoto, opened from `ProcessingStatusDialog`.

So the two libraries aren't serving genuinely different needs (e.g. one for
2D maps, one for 3D) — they're two different technical solutions to the same
"render a COG in the browser" problem, in two different UI contexts.

**The OpenLayers implementation is not a thin call site.** `TaskOrthoCogViewer.tsx`
carries several hard-won, commented workarounds for OL-specific GeoTIFF-source
behavior discovered during development:

- ODM's RGBA fast-ortho COGs need OL's band auto-detect left alone —
  `convertToRGB: true` breaks `composeTile_` because OL then expects a
  different band count than the source returns.
- OL's GeoTIFF `getView()` is async but must be awaited *before* constructing
  the `View`, or an async `view: promise` races the initial `fit()` call and
  leaves the user looking at the wrong zoom level.
- OL's GeoTIFF view config includes a `resolutions` array (one entry per COG
  overview level); passing it straight through installs
  `createSnapToResolutions` as a constraint, which hard-clamps zoom-out
  regardless of `maxResolution`/`showFullExtent`. Workaround: construct the
  `View` with explicit min/max resolution bounds instead of the `resolutions`
  array.

These are the kind of bugs that only surface through hands-on testing against
real COGs, not something a mechanical port would carry over for free — a
MapLibre + `maplibre-cog-protocol` rewrite of this viewer would very likely
need to rediscover an equivalent set of quirks (probably different ones,
since `maplibre-cog-protocol` and `ol/source/GeoTIFF` decode/tile COGs
differently), each needing the same kind of manual, visual verification this
repo's guidelines already call for on map-rendering changes.

**Bundle size impact is real but not urgent — already isolated by code
splitting.** `ol`'s footprint shows up in three chunks, all part of the lazy
route that only loads when `TaskOrthoCogViewer` is actually opened, not the
initial bundle:

| chunk | raw | gzip |
|---|---|---|
| `TaskOrthoCogViewer-*.js` (OL core/View/WebGLTile) | 283 KB | 84 KB |
| `geotiff-*.js` (geotiff.js, pulled in by `ol/source/GeoTIFF`) | 304 KB | 110 KB |
| `lerc-*.js` (LERC codec, geotiff.js dependency) | 97 KB | 38 KB |

Total ≈ 684 KB raw / 232 KB gzip, but only paid by users who open that
specific modal — it costs nothing on first paint or the main map views
today.

## Recommendation

**Consolidate onto MapLibre GL long-term; do not treat this as a quick
dependency-removal win.** The case for MapLibre as the target is clear-cut:
25 files vs. 1, the sibling `gcp-editor` package already commits the
workspace to `maplibre-gl` regardless, and the working pattern
(`@geomatico/maplibre-cog-protocol`) for COG rendering already exists and is
already proven elsewhere in this codebase (`COGOrthophotoViewer`).

But porting `TaskOrthoCogViewer` is a real feature-parity rewrite, not a
mechanical import swap: it needs someone to reimplement and re-verify (by
hand, against real task orthophotos, at multiple zoom levels) equivalent
behavior for band handling, initial-view/zoom-level correctness, and
full-zoom-out behavior using MapLibre's COG path instead of OL's. Scope it as
its own dedicated task with a manual test pass — bundling it into "drop the
`ol` dependency" understates the risk. Given the bundle cost is already
isolated to a lazy chunk that only loads on that one modal, there's no
urgency forcing this to happen before some other feature work touches this
component anyway.
