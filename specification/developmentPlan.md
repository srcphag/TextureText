# TextureText — Development Plan

Status: v0.1 · 2026-10-26
Technical plan for `specification/specification.md`. All agent-delegated decisions (spec §6) are recorded in the decision log with reasons and alternatives. Conventions inherited from TextureMosaic unless noted.

---

## 1. Decision log

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| Language | TypeScript 5 (strict ES2022 modules) | Type-safe contracts for the §4 pipeline (luma grid → intervals → line list); reuses the proven TextureMosaic setup. | Plain JS (weaker guarantees), Rust/WASM (unnecessary; pretext is already fast JS). |
| Text layout engine | `@chenglou/pretext` (npm) | Purpose-built for exactly this: `prepareWithSegments` once, `layoutNextLine` per variable-width line as pure arithmetic; sub-ms reflow proven by the editorial demo; 15 KB, zero deps. | Hand-rolled mini engine (~150 lines, re-implements Unicode segmentation edge cases), CSS Shapes (static-only, single-side wrap, no line geometry). |
| Build tool | Vite 6 | Fast dev server, zero-config static `dist/` build for Netlify; `optimizeDeps.include` pre-bundles the ProRes encoder to avoid dev-server reload losing exports. | Webpack, Parcel, esbuild standalone. |
| Interactive renderer | DOM line pool (absolute divs, `white-space: pre`, write-only updates) | Selectable text, GPU-composited blend modes via `mix-blend-mode`, proven 60 fps pattern in the pretext demo; zero DOM reads in the hot loop. | Canvas-only stage (loses selection/accessibility; blends need manual compositing), SVG (slower at high line counts). |
| Export renderer | Canvas 2D (`fillText` per computed line + `globalCompositeOperation` blend) | `prores-wasm-encoder` captures canvas directly; blend-mode names map 1:1 to DOM `mix-blend-mode` (except `none`→`source-over`); consumes the same line list as the DOM renderer (D12). | DOM rasterization libs (html2canvas — inaccurate, slow), headless re-render (no DOM in encoder path anyway). |
| ProRes encoding | `prores-wasm-encoder` + `/parallel` worker pool | Required by the constitution; 38 KB gzipped, pool keeps UI responsive, byte-identical output, no COOP/COEP headers needed (works on stock Netlify). | ffmpeg.wasm (10.2 MB, slower), MediaRecorder (no ProRes, lossy). |
| Media capture | `<video>`/`<img>`/`getUserMedia` → tiny 2D canvas (`willReadFrequently: true`) | GPU-accelerated downscale in `drawImage`; CPU-backed canvas avoids GPU→CPU sync stalls on `getImageData`; grid is ~450×28 cells at defaults (~50 KB readback). | WebGL readback (faster per-pixel but sync-stall risk and more code), `VideoFrame.copyTo` (Chrome-only; revisit later). |
| Luma cadence | `requestVideoFrameCallback` for sources with video frames; rAF otherwise | A 24/30 fps video yields ~2 free frames per 60 Hz tick; temporal smoothing (§4 step 4) keeps text motion continuous. | Extract every rAF (wasted work), fixed interval (drift). |
| CSS library | `letieu/terminal.css` v0.0.4 (vendored, not CDN) | Decided by the user; vendoring keeps the Netlify build self-contained and offline-dev friendly. | CDN link (extra runtime dependency). |
| Project structure | `src/engine/` (pure logic), `src/render/` (DOM + canvas renderers), `src/export/`, `src/ui/`; `tests/unit/`, `tests/e2e/` | Engine/render/UI separation keeps the §4 contract portable (spec §6 rule 4) and the UI swappable (spec §7 rule 3); mirrors TextureMosaic. | Single-file bundle (untestable), framework component tree (unneeded runtime dep). |
| Test tooling | Vitest (unit: §4 CPU reference, interval carving, cursor handoff) + Playwright Chromium (e2e: controls, fake webcam, export validity, static build, perf) | Same stack as TextureMosaic; headless Chromium covers canvas + video + workers. | Jest (slower ESM), Cypress (heavier). |
| Netlify configuration | `netlify.toml`: `npm run build` → `dist/`, Node 22, `Permissions-Policy: camera=(self)`, immutable `/assets/*` caching | Reproducible zero-server static deploy with webcam permission; same as TextureMosaic. | Manual drag-and-drop deploy. |
| Hosting | Netlify (static) | Decided by the user | |

---

## 2. Architecture

```
src/
  engine/            — pure TypeScript, no DOM rendering (unit-tested)
    types.ts         — LumaGrid, Interval, Slot, LineBox, SourceKind, AppState
    lumaField.ts     — frame draw → grid readback → process (invert/contrast/offset) → smoothing
    slotCarve.ts     — per-row intervals: merge, dilate, invert (inside mode), carve slots
    textFlow.ts      — pretext wrapper: prepare cache, band loop, cursor handoff → LineBox[]
    referenceCpu.ts  — plain-code §4 reference for pixel/logic parity tests
    clock.ts         — controllable clock (tests + deterministic export)
    fixtures.ts      — deterministic synthetic frames/texts
    debugApi.ts      — test-only window hooks (read/set params, line list, grid, frame count)
  render/
    domRenderer.ts   — div pool sync + writes; mix-blend-mode on the text layer
    canvasRenderer.ts— same LineBox[] via fillText; globalCompositeOperation; used by export
    blendModes.ts    — single source of truth: blend list, DOM↔canvas name mapping
    preview.ts       — processed source preview (same §4 step-3 math as the luma field)
  export/
    pngExport.ts     — canvas snapshot at working resolution → download
    proResExport.ts  — encoder pool; deterministic loop (video/image) + live record (webcam)
  ui/
    appUi.ts         — TextureMosaic 3-column studio grid (319px | 1fr | 270px), .ts-* components, data-testids, focused-input guard (U7), stats overlay
    terminal.css     — vendored letieu/terminal.css v0.0.4 (JetBrains Mono + ANSI palette)
    styles.css       — TextureMosaic .ts-* Figma tokens & component classes, logged in decisions.md
  main.ts            — bootstrap: fonts.ready → source load → rAF loop wiring
index.html
netlify.toml
```

**Data flow per frame** (interactive): source → `lumaField` (only on new video frame) → `slotCarve` → `textFlow` → `LineBox[]` → `domRenderer`. Export swaps in `canvasRenderer` + encoder.

**Key numbers**: grid rows = `stageHeight / lineHeight` (~28 at defaults), cols = `stageWidth / gridCellPx` (~320). Per-frame JS budget ~3.5 ms of the 16.6 ms frame (spec §5).

---

## 3. Export pipelines (D10/D11)

- **PNG**: render current state through `canvasRenderer` at working resolution → `toBlob('image/png')` → download.
- **ProRes deterministic** (video/image): seek video to 0, pause; create pool (`width/height/fps/profile` from export params); loop `duration·fps` frames: step clock, extract luma, layout, `canvasRenderer.draw`, `await pool.addFrameFromCanvas(canvas)`; `finalizeToBlob()` → download `.mov`; progress bar + cancel; `destroy()` always.
- **ProRes live** (webcam): same pool, but frames are added from the live rAF loop between start/stop presses; wall-clock timestamps, dropped frames logged to the stats overlay.
- Vite: `optimizeDeps.include: ['prores-wasm-encoder', 'prores-wasm-encoder/parallel']`.

---

## 4. Build order (spec §9 expanded)

| Step | Deliverable | Automated checks |
|---|---|---|
| 1 | Vite+TS scaffold, `terminal.css` + TextureMosaic `styles.css` (`.ts-*` 3-column grid `319px 1fr 270px`), source slot (image/video/webcam), processed `96×96` preview, transport bar | e2e: source switching, preview matches §4 step 3, transport states, errors visible |
| 2 | `lumaField` + `slotCarve` + debug mask overlay (grid painted over stage) | unit: CPU-reference parity (luma weights, invert/contrast/offset, threshold/softness, interval merge/dilate/invert, cover-fit mapping) |
| 3 | `textFlow` + `domRenderer`, `.ts-stack-container` editable textarea, `.ts-stats-overlay` | unit: cursor handoff, slot widths, exhaustion; e2e: text wraps a synthetic bright box at 60 fps |
| 4 | Inside mode, padding, smoothing, colors, blend modes (DOM + canvas parity) | unit+e2e per control; reset-to-default restores output |
| 5 | `pngExport`, `proResExport` (deterministic + live) | e2e: PNG valid/size; .mov parses (ftyp/moov, frame count, fps, profile fourcc); webcam record via fake device |
| 6 | Full UI audit against TextureMosaic (`.ts-*` states, focused-input guard U7, custom CSS log in `decisions.md`) | all states (default/hover/active/disabled/error/empty/loaded); data-testid coverage |
| 7 | `netlify.toml`, production build verified locally (`vite preview` + subfolder), then deploy | e2e against the built `dist/` over HTTP |

Each step ends with `tests/REPORT.md` (what passed, screenshots, perf numbers, "Not verified" list) and the user's Keep/Tweak/Rework review (spec §8.3). Review feedback is recorded in `decisions.md`.

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `getImageData` sync stall on GPU-backed canvas | `willReadFrequently: true`; tiny grid; extract only on new video frame (measured live in stats overlay) |
| Slot flicker on noisy video | `thresholdSoft` hysteresis + `temporalSmooth` (§4 steps 4–5); debug mask overlay to tune |
| DOM/canvas blend-mode mismatch | single `blendModes.ts` mapping table; e2e pixel spot-checks on the export canvas |
| Long ProRes exports blocking UI | worker pool with backpressure + progress/cancel; WASM memory stays ~64 MB regardless of length |
| Webcam untestable headlessly | Playwright fake device for e2e; real hardware listed under "Not verified" |
| Font measurement drift (pretext caveats) | named font stacks only, `document.fonts.load(family, text)` before prepare, whole-px sizes, `lang` set on `<html>` |
