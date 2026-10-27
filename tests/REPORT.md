# TextureText — Test Report

## Step 1 — TextureMosaic Studio Shell + Source Slot (2026-10-27)

**Review build:** `npm run dev` → http://localhost:5190/

### What passed

**Unit (Vitest, 15 tests):**
- `lumaOf` Rec.709 weights (pure R/G/B), white/black.
- `processLuma` §4 step-3 order: identity, invert, contrast 0 / >1 clamping, offset clamping, combined ordering.
- `coverFit` crop math: wider/taller/equal aspect, 16:9 no-op.

**E2E (Playwright Chromium, 8 tests):**
- Loads the 3-column TextureMosaic studio layout (`#app`: `319px 1fr 270px`, `.ts-panel-inputs`, `.ts-panel-stage`, `.ts-panel-params`) with empty states (`MEDIA_GLYPH_SVG` + `add image` / `load a source to begin`), zero console errors.
- Image file loads; `.ts-source-preview` gains `.is-loaded` cyan border and shows the processed luma signal; transport is static grey (`#d9d9d9`) with `Image` status.
- `invert color` `.ts-toggle-row` button toggles `.is-primary` and flips preview pixels exactly (`255 − v`); `↺` reset restores pixels and unsets `.is-primary`.
- `contrast` `.ts-control-box` slider `0` flattens preview to grey 128 (±1); split numeric input (`contrast-number`) stays in sync; `↺` reset restores slider.
- Video file (`.webm`) loads, autoplays, transport `.ts-media-btn` toggles between `❚❚` and `▶`.
- Webcam (fake device) shows red `Live` track (`#ef2828`), `Webcam` status, and a non-blank live preview.
- Unsupported file (`.txt`) shows a visible `.toast.is-danger` error toast in `.toast-container` and dismisses on `✕`.
- `.ts-stats-overlay` toggles and reports `FPS` and `RES` (`1280×720`).

**Test change log (spec §8.4):**
- Updated `tests/e2e/step1.spec.ts` assertions from the temporary `.tt-*` controls (checkbox `invert-toggle`, `play`/`pause` text button) to `TextureMosaic`'s exact `.ts-*` components (`.ts-toggle-row` `.button.is-primary` for `invert color`, `.ts-media-btn` `▶`/`❚❚` + `disabled` state, `transport-status` `None`/`Image`/`Video Input`/`Webcam`, and `.toast.is-danger` dismiss button) per user instruction U8.

**Build:** `npm run build` clean (tsc + vite), dist ≈ 11.3 kB JS + 11.8 kB CSS (gzip ≈ 6.9 kB total).

### Performance
Not measured yet (meaningful from step 3 with live reflow; stats overlay already shows FPS and frame time).

### Not verified
- Real webcam hardware (e2e uses Chromium's fake media device).
- Firefox/Safari (Chromium only so far).
- `npm audit` reports 3 vulnerabilities in dev dependencies (vite/playwright chain); dev-only, no runtime impact — review before Netlify deploy.

### Known limitations
- `shape` refinements and `export` group arrived together with the text layer (steps 3–5 merged into this build per U1-style continuous build); ProRes `.mov` output is wired but not yet verified end-to-end.

## Bugfix round (2026-10-27, user-reported)

Three user-found bugs, each got a failing test first (`tests/e2e/bugfixes.spec.ts`), then the fix (decisions U11–U13):

1. **Resolution selector** — stage box reshapes to the working resolution (contain-fit via ResizeObserver) and text reflows/re-scales immediately. ✅
2. **Mixed line styles** — all visible `.ts-flow-line` elements share the current font/line-height/color after any shrink-then-regrow sequence. ✅
3. **Blend modes over source** — source media is the visible stage backdrop; the text layer blends over it via `mix-blend-mode`; canvas exports draw the same source frame first. ✅

**Test change log (§8.4):** `step1.spec.ts` media-visibility assertions flipped from hidden to visible (U13 behavior change); `bugfixes.spec.ts` added (3 regression tests). Full suite: 21/21 unit + 11/11 e2e green; `npm run build` clean.

## Composition rework (2026-10-27, user-requested, U14)

The composed source image is now always the **post-processed** luma image (invert/contrast/offset, grid-`px` quantized) — the same canvas that shapes the text:

- **Shared processed canvas**: `lumaField.ts` writes the processed grayscale luma back into its extraction canvas each frame; the Inputs preview and the stage overlay both draw from it (`image-rendering: pixelated`).
- **Layering**: `bgColor` → text (normal blend) → `#stageProcessedCanvas` overlay with `mix-blend-mode`, contained by `isolation: isolate` on the stage. With `blendMode === 'none'` the overlay is hidden: only `bgColor` + text show. Raw `#stageVideo`/`#stageImage` stay hidden permanently.
- **Export parity (D12)**: `canvasRenderer` draws `bgColor` → text (`source-over`) → processed image with `globalCompositeOperation = blendMode` for both PNG and ProRes.
- **Tests**: `step1.spec.ts` media assertions flipped back to hidden (logged behavior change); `bugfixes.spec.ts` composition test rewritten to assert overlay hidden at `none`, visible + blended at `difference`, and holding the post-processed image at working resolution. Full suite green: 21/21 unit, 11/11 e2e.

## Preset system (2026-10-27, U15)

Ported the TextureMosaic full-scene JSON preset system (plan: `specification/presetsPlan.md`):

- `src/engine/presets.ts`: `TextureTextPresetV1` validation (app/version/canvas size/params/source slot), `import.meta.glob` repo discovery with lazy `?url` fetch, Base64 media embedding (image/video original blob; webcam → PNG frame fallback), `buildPresetFromState` / `collectSourceSlot` / `applyPreset`, JSON download.
- `sourceManager` tracks the loaded `File` (`getCurrentFile()`) for embedding.
- Parameters-panel `presets` group (dropdown + name + save / import / export) wired in `appUi.ts`; debug API gains `exportPreset` / `importPreset`.
- Repo preset `presets/defaultScene.json` restores the default scene.

**Unit (Vitest, 7 tests):** build-from-state validity, JSON round-trip, rejection of wrong app / version / canvas size / text / flowMode / blendMode / source slots, `dataUrlToBlob` decode.

**E2E (Playwright, 6 tests):** repo preset listed and applies (restores defaults after drift); session preset save + re-select restores scene (invert, blend mode); export downloads a valid `.json`; import of an exported preset restores the embedded image source; crafted preset file applies to every control (text, invert, threshold, blend, flow mode, export settings); invalid JSON shows a dismissible error toast.

Full suite green: 28/28 unit, 17/17 e2e; `npm run build` clean.
