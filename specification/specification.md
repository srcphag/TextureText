# TextureText — Specification

Status: v0.1 · 2026-10-26
Derived from `specification/Constitution.md`. Modeled on the TextureMosaic / TextureStack spec family. The tech stack and architecture are **not decided here**: the agent decides them and records each choice in `specification/developmentPlan.md`. The UI follows the rules of the TextureMosaic project (its spec §7 and `decisions.md` Custom CSS Log).

Reference files:
- `specification/Constitution.md` — user constitution. **Source of truth** for scope.
- TextureMosaic project (`github.com/srcphag/TextureMosaic`) — reference for UI rules, project structure, testing harness and review workflow.
- `@chenglou/pretext` — text layout engine reference (`github.com/chenglou/pretext`), incl. the `somnai-dreams.github.io/pretext-demos` editorial demo this app generalizes.

---

## 1. Goal

A web app that flows a fixed input text around the luminance shape of an input **image, video, or live webcam feed**. The text wraps **inside or outside** the luma shape. The source has real-time **luminance adjustment and invert controls**, visible in the source preview. The text layer has its own **text/background color selectors** and composes over the processed source with a **blend-mode dropdown** (default: none/normal). The output can be saved as **PNG** or **ProRes .mov** (via `prores-wasm-encoder`). The UI uses `letieu/terminal.css` and follows the TextureMosaic UI rules. Developed on localhost, deployed as a static site on Netlify.

It is an artistic tool. The agent proves it works. The user judges how it looks and feels.

## 2. Decision status

| Area                                                                             | Status                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Behavior, inputs, controls (§3)                                                  | Decided                                             |
| Luma-to-shape pipeline contract (§4)                                             | Decided                                             |
| Constraints (§5)                                                                 | Decided                                             |
| Tech stack, architecture, libraries, project structure, build, test tooling (§6) | **Decided by the agent** (see `developmentPlan.md`) |
| UI: terminal.css + TextureMosaic rules (§7)                                      | Decided by the user                                 |
| Testing split and done rule (§8)                                                 | Decided                                             |

---

## 3. Behavior (functional spec)

Pipeline: **one media source** (switch video/image/webcam) → **luma processing** (invert → contrast → threshold band → offset, all real-time) → **luma field grid** → **per-line slot carving** → **pretext line layout** → **text layer** (color + blend mode) composited over the **processed source** → stage canvas/DOM → **export** (PNG / ProRes).

| # | Decision |
|---|---|
| D1 | One media source slot with three input types: `webcam` / `video file` / `image file`. Switching does not reload the page. Loaded videos loop. |
| D2 | One **working resolution** for the stage (default 1280×720, selectable). The source is cover-fitted to it; the luma grid and text region map to the same rect. |
| D3 | Live update: every animation frame while a video/webcam plays; for images, only when a control changes. Luma re-extraction only when a new video frame arrives (`requestVideoFrameCallback` where available). |
| D4 | The input text is **editable in the UI** (textarea) with a bundled default text. Re-prepares on change (debounced). Empty text = no text layer, not an error. |
| D5 | Text flow mode: **inside** the luma shape (text fills bright regions) or **outside** (text wraps around bright regions into dark areas). Runtime toggle, plus global luma `invert`. |
| D6 | All controls update in real time and each has reset-to-default. The source preview shows the **processed** signal (all luma adjustments applied), per TextureMosaic U10. |
| D7 | Errors (unsupported file, webcam denied, canvas readback failure, font load failure) are visible in the UI, never only in the console. |
| D8 | Bottom playback bar: one transport for the source — video shows play/pause, progress and time; webcam shows a red track and `Live`; image/empty shows a static grey track (TextureMosaic D14 pattern). |
| D9 | Text layer styling: **text color** and **background color** selectors, plus a **blend-mode dropdown** (`none`/normal default; multiply, screen, overlay, darken, lighten, difference, exclusion, hard-light, soft-light, color-dodge, color-burn, hue, saturation, color, luminosity). Background color fills the text layer behind the glyphs (transparent when unset). |
| D10 | **PNG export**: snapshot of the composited stage at working resolution. |
| D11 | **ProRes export**: (a) **deterministic render** for video/image sources — user sets duration (s), fps, resolution (defaults to working resolution), ProRes profile (default HQ); the video source restarts from t=0 and frames are rendered offline as fast as the encoder pool allows; (b) **live start/stop record** for webcam sources. Output downloads as `.mov`. |
| D12 | The interactive stage uses DOM text lines; export renders the same computed lines to canvas (`fillText`). Both must produce matching geometry from the same layout state. |
| D13 | With no media loaded, the stage shows a neutral empty state and the text flows in a plain full-width column. |
| D14 | The composed source image is always the **post-processed** luma image (invert/contrast/offset, grid-quantized): the Inputs preview and the stage overlay draw the same canvas that shapes the text. With `blendMode === 'none'` the overlay is hidden (only `bgColor` + text); any active blend mode composites it over the text. Raw media elements stay hidden (decoders only). |
| D15 | **Full-scene JSON presets** (`TextureTextPresetV1`): save / export / import complete scenes — name, canvas size, input text, all parameter groups, export settings, and the source slot with Base64-embedded media (webcam → PNG frame fallback). Repo presets are auto-discovered from `presets/*.json` (Vite `import.meta.glob`, lazy fetch); session presets live in the dropdown alongside them. |
| D16 | The app boots with a repo preset applied (`DEFAULT_PRESET_ID`, currently `pyramid1`) rather than the bare built-in scene. `?preset=<id>` deep-links any repo preset and `?preset=none` starts from the built-in default scene (used by the e2e suite). A failed fetch/decode shows the error toast and leaves the built-in scene. |

### Parameters

| UI name | App name | Type | Range | Default | Description |
|---|---|---|---|---|---|
| input text | `inputText` | text | — | bundled default | Text flowed around the shape; repeats or truncates to fill (see D4) |
| flow mode | `flowMode` | int | 0/1 | 0 | 0 = outside (text in dark areas), 1 = inside (text in bright areas) |
| invert | `invertLuma` | float 0/1 | 0/1 | 0 | Invert source luma before processing |
| contrast | `contrast` | float | 0..4 | 1 | Luma contrast around 0.5 before threshold |
| threshold | `threshold` | float | 0..1 | 0.5 | Luma level that separates shape from background |
| threshold softness | `thresholdSoft` | float | 0..0.5 | 0.05 | Feather of the threshold band (reduces edge flicker) |
| offset | `lumaOffset` | float | -1..1 | 0 | Added to luma before threshold |
| padding | `shapePadding` | float px | 0..40 | 8 | Dilation of blocked intervals around the shape |
| smoothing | `temporalSmooth` | float | 0..0.95 | 0.3 | Frame-to-frame luma grid lerp (0 = off) |
| font size | `fontSize` | float px | 8..64 | 18 | Body text size |
| line height | `lineHeight` | float px | 8..96 | 26 | Line band height; also the luma grid row pitch |
| font family | `fontFamily` | select | preset list | serif stack | Canvas-parsable font stack |
| text color | `textColor` | color | — | `#e8e4dc` | Glyph fill |
| background color | `bgColor` | color + unset | — | unset | Text-layer background fill (transparent when unset) |
| blend mode | `blendMode` | select | CSS blend list | none | Text-layer composite mode over processed source |
| grid resolution | `gridCellPx` | float px | 2..16 | 4 | Luma grid column pitch |
| resolution width/height | `workingWidth/Height` | int | presets + manual | 1280×720 | Stage working resolution (D2) |
| export duration | `exportDuration` | float s | 1..60 | 5 | Deterministic ProRes length (video/image) |
| export fps | `exportFps` | float | 23.976/24/25/30/60 | 30 | ProRes frame rate |
| export profile | `proResProfile` | select | Proxy/LT/422/HQ/4444/4444XQ | HQ | ProRes profile |

---

## 4. Luma-to-shape contract

The behavior below is fixed. Whatever the implementation, the shape the text sees is defined as:

1. **Grid**: `rows = floor(stageHeight / lineHeight)`, `cols = floor(stageWidth / gridCellPx)`. Row `r` corresponds exactly to text band `[r·lineHeight, (r+1)·lineHeight)`.
2. **Sample**: draw the current source frame cover-fitted into the grid canvas; read back RGBA; per cell `luma = dot(rgb, (0.2126, 0.7152, 0.0722)) / 255`.
3. **Process** (in order, matching the visible preview): optional invert → `l = clamp((luma − 0.5)·contrast + 0.5, 0, 1)` → `l = clamp(l + lumaOffset, 0, 1)`.
4. **Temporal smoothing**: `field[i] = mix(prevField[i], l[i], 1 − temporalSmooth)`.
5. **Solid test**: cell is solid when `field` is above `threshold` (with `thresholdSoft` feather, applied hysteresis-style per cell). **Outside mode**: solid cells are blocked intervals. **Inside mode**: solid cells are the allowed slots (blocked = complement).
6. **Intervals**: per grid row, merge contiguous solid runs, dilate by `shapePadding`, merge overlaps, clamp to the stage rect.
7. **Layout**: for each text band, carve the row's intervals out of the text region into slots ≥ a minimum viable width; lay out one line per slot with pretext (`layoutNextLine`), carrying the cursor across slots and bands; stop when text is exhausted or the stage is full.

**Rules**

- Text measurement must come from pretext (`prepareWithSegments` once per text/font change; per-frame layout is pure arithmetic). No DOM measurement in the hot loop.
- The processed luma pipeline (step 3) is the same math that drives the visible source preview (CSS filter or canvas re-draw), so preview and shape always agree.
- Interactive DOM stage and export canvas consume the same per-frame line list (D12).

---

## 5. Constraints (non-functional spec)

- Runs fully in the browser. No media is uploaded anywhere.
- Starts as a local app (`localhost`); then deployed as a **static site on Netlify**. No server code.
- Desktop Chrome and Firefox. Safari best effort.
- **Performance target: 60 fps** with a 1920×1080 video source at 1280×720 working resolution on a mid-range laptop; **minimum 30 fps**. Per-frame JS budget ~3.5 ms (luma extraction ≤ 1 ms at default grid; pretext layout ≤ 1 ms; DOM writes ≤ 1.5 ms).
- Text reflow must stay sub-millisecond for ≤ 2000 lines (pretext guarantee); the stats overlay proves it live.
- Only local/user-supplied media for video and image (CORS-tainted canvases are rejected with a visible error, D7).
- Webcam requires HTTPS or localhost; Netlify deploy sends `Permissions-Policy: camera=(self)`.
- ProRes export uses Web Workers (encoder pool); the UI stays responsive with a progress indicator during export.
- Setup runs with three commands: install, test, run.
- Folders and filenames use camelCase where possible (repo `AGENTS.md`).

---

## 6. Delegated to the agent

The agent decides: language, build tool, project structure, dependencies, test tooling, Netlify configuration — recorded with reasons and alternatives in `specification/developmentPlan.md`.

**Rules for deciding** (same as TextureMosaic §6)

1. Decide before building; record the choice, the reason, and the alternatives considered.
2. Satisfy §3 to §5. Do not change the behavior to fit a tool. If a tool forces a change, tell the user.
3. Prefer few dependencies, mainstream and maintained tools, and a setup one person can run with three commands.
4. Do not lock the §4 shape contract into a framework. The luma/carve/layout logic must stay portable plain TypeScript.
5. Only ask the user about decisions that change what they see or do. Everything else is logged.
6. Reusing the TextureMosaic project structure (TypeScript + Vite + Vitest + Playwright, debug API, `terminal.css` UI, decisions/spec workflow) is allowed and encouraged.

---

## 7. UI: terminal.css + TextureMosaic rules

**Source of truth:** `letieu/terminal.css` v0.0.4 (`JetBrains Mono` monospace, ANSI palette) + the exact Figma tokens and `.ts-*` component system from `TextureMosaic` (`src/ui/terminal.css`, `src/ui/styles.css`, `src/ui/app-ui.ts`). Built with the full TextureMosaic UI from step 1 (matching TextureMosaic U1).

**Rules** (inherited from TextureMosaic §7)

1. The TextureMosaic Figma layout and `.ts-*` styles win visually. `terminal.css` provides the base components (`.button`, `.control`, `.input`, `.textarea`, `.select`, `.progress`, `.toast`). Custom CSS is limited to the TextureMosaic `.ts-*` system plus any TextureText-specific additions, each logged in `decisions.md`.
2. Reuse the exact TextureMosaic CSS custom properties:
   - `--ts-bg-outer: #050505`, `--ts-bg-stage: #0d0d0d`, `--ts-cyan: #8be9fd`, `--ts-text: #cccccc`, `--ts-muted: #666666`, `--ts-border: #333333`, `--ts-canvas-border: #666666`, `--ts-gap-panel: 20px`, `--ts-gap-inner: 8px`.
3. **The UI must be swappable.** Logic and state live apart from presentation. Every control and button has a stable `data-testid`.
4. Every component state is implemented: default, hover, active (`.button.is-primary` cyan fill `#8be9fd` with `#000000` text), disabled (`.is-disabled` `opacity: 0.42`), error (`.toast.is-danger` in `.toast-container`), plus empty and loaded states (`.is-loaded` cyan border) of the source preview and text input container.
5. **Focused input preservation (TextureMosaic U7):** live animation frame updates must never overwrite the `.value` of a focused numeric/text input while the user is typing; apply resolution/numeric edits on `Enter` or `change`.

**3-Column Studio Grid (`#app`: `grid-template-columns: 319px 1fr 270px; height: 100vh; width: 100vw`)**

- **Left `Inputs` column (`.ts-panel-inputs`, `319px`, `border-right: 1px solid #161616`, `padding: 14px 20px`)**:
  - Heading: `.ts-section-heading` → `.ts-section-title` (`Inputs`).
  - `control input` block (`.ts-source-block`): `.ts-source-grid` (`126px 96px`, `gap: 12px`) with vertical `.ts-source-buttons` (`webcam`, `video file`, `image file`, each `height: 21px`) on the left and a `96×96` `.ts-source-preview` box on the right (`MEDIA_GLYPH_SVG` + `add image` empty state; when loaded, `.is-loaded` cyan border, cover-cropped **processed** luma preview `<img />`, and bottom `.ts-preview-badge` filename).
  - `text input` block (`.ts-source-block`, `flex: 1; min-height: 0`): `.ts-block-header` with `.ts-field-label` (`text input`) and `.ts-field-count` (character/word count), `.ts-header-actions` (`reset text` / `clear` `.button.ts-btn-small`), and a full-height bordered container (`.ts-stack-container.is-loaded`) holding the editable `<textarea class="textarea">`.
- **Center `Stage` column (`.ts-panel-stage`, `background: #0d0d0d`, `padding: 20px 30px`)**:
  - Top `<header class="ts-section-heading">`: `.ts-section-title` (`TextureText v0.1`), `.ts-section-meta` (`1280 X 720 PX`), and `.ts-header-actions` with `.button.ts-btn-small` buttons: `stats`, `reset all`, `snapshot png` (`.is-primary`), and `export prores` (`.is-primary`).
  - Center `.ts-canvas-stage`: aspect-fitted stage container (`border: 1px solid var(--ts-canvas-border)`, `background: #000000`) holding the processed source layer + blended text layer, plus the toggleable `.ts-stats-overlay` (`FPS`, `FRAME`, `LINES`, `REFLOW`, `RES`).
  - Bottom `<footer class="ts-playback">`: `.ts-transports` → `.ts-transport` with clickable `.progress` bar (`.is-static` `#d9d9d9` for image/none, `.is-live` `#ef2828` + `Live` label for webcam), `24×24` `.ts-media-btn` (`▶` / `❚❚`), `.ts-field-label` status (`Video Input` / `Webcam` / `Image` / `None`), and `.ts-time-display` (`00:00 / 00:00`).
- **Right `Parameters` column (`.ts-panel-params`, `270px`, `border-left: 1px solid #161616`, `padding: 16px 20px`, scrollable)**:
  - Heading: `.ts-section-heading` → `.ts-section-title` (`Parameters`).
  - Parameter groups (`.ts-param-group`) with `.ts-block-header` (`.ts-field-label` + `.ts-reset-inline` `rst` / `rst all`), using TextureMosaic's `.ts-control-box` (`.ts-control-split` `[prefix | right-aligned value]` + `.ts-slider-row` `[.ts-slider | ↺]`), `.ts-dual-controls` (`1fr 1fr`), `.ts-mode-row`, `.ts-toggle-row`, and `.ts-preset-select`:
    1. `canvas size` (`x` / `y` dual controls + `rst`).
    2. `control` (`contrast`, `offset`, `threshold`, `softness` sliders + `invert color` `.ts-toggle-row`).
    3. `shape` (`flow mode` 2-way `.ts-mode-row` `outside` / `inside`, `padding` & `smoothing` sliders, `grid px` slider).
    4. `text` (`font` `.ts-preset-select`, `size` & `line h` dual controls, `text color` & `bg color` split color controls with `clear` for transparent bg, `blend` `.ts-preset-select`).
    5. `export` (`profile` `.ts-preset-select`, `fps` & `duration` dual controls, `record / render mov` action button + progress readout).

---

## 8. Testing

### 8.1 Who checks what

| Agent verifies (automated) | The user judges (manual) |
|---|---|
| Code checks and build | Look of the UI and the composited output |
| §4 shape math vs a plain-code CPU reference | Feel of the text flow around real media |
| Every control does what §3 says | Feel of sliders, blend modes, source switching |
| Export files are valid (PNG size/content, .mov structure) | Fit with the creative workflow |
| Error handling, serving, performance measurement | Smoothness on their own machine |

### 8.2 What the agent must verify

- **Shape pipeline** vs CPU reference: luma weights (pure R/G/B), invert, contrast 1/0/>1, offset clamp, threshold + softness hysteresis, interval merge/dilate/overlap, inside vs outside mode, cover-fit mapping on non-16:9 sources.
- **Text layout**: line slots match band intervals; cursor handoff across slots and bands has no gaps/duplication; text exhaustion and stage-full stops; empty text; font/line-height change re-layout; deterministic fixtures give identical line lists.
- **App**: source switching (image/video/webcam-fake), every control changes output and reset restores it, processed preview matches §4 step 3, errors visible, no console errors on load, transport states (D8).
- **Export**: PNG is valid, right size, non-empty; deterministic ProRes render produces a valid .mov of the requested frame count/fps/profile (parse header); webcam live-record path start/stop.
- **Serving**: production build loads over HTTP as a static site (root and subfolder), no missing files or console errors.
- **Performance**: measure and report only (fps, reflow ms, extraction ms at 1080p); never fails the build.

**Support the app must provide for testing:** debug access in test builds only (read/set params, load fixtures, read the line list and luma grid, frame counter), a controllable clock, deterministic fixtures, a `?demo=1` demo scene, and the stats overlay in the review build.

### 8.3 The user's review

Same as TextureMosaic: after agent tests pass, the agent starts a **review build** and hands over the URL, a short summary and `tests/REPORT.md` with screenshots. The user rates each area **Keep**, **Tweak** or **Rework** (Look / Output / Feel / Flow / Machine). For each Tweak or Rework the agent writes the decision in `decisions.md`, updates this document, adds tasks, and adds a regression test if the feedback was about behavior.

### 8.4 Flow and rules

Same as TextureMosaic §8.4: a step is **done** only when automated checks pass **and** the user accepts the review; the agent never edits a test to make it pass without writing why in the report; a user-found bug gets a failing test first; anything not verifiable headlessly (e.g. real webcam) goes under "Not verified" in the report.

---

## 9. Build order, future features, out of scope

**Suggested order** (each step ends with the agent test report and the user's review):
1. Stage + source slot (image/video/webcam) with processed preview, and its tests.
2. Luma grid extraction + interval carving vs CPU reference, with debug mask overlay.
3. Pretext layout around the shape (outside mode), editable text, stats overlay.
4. Inside mode, threshold softness, padding, smoothing, blend modes, colors.
5. PNG export; deterministic ProRes export (video/image); webcam live record.
6. UI pass to TextureMosaic conventions.
7. Netlify deploy.

**Future features** (not in v1, but v1 must not block them): multiple simultaneous sources, video-rate animated text content, per-line color mapping from source color.

**Out of scope for v1:** saving/loading projects, multi-user, mobile layout, audio, remote (non-local) media URLs.
