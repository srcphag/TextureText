# TextureText

Editable text that flows around the luminance of an image, a video, or a webcam feed.

TextureText samples the source into a downscaled luminance grid, carves horizontal
slots around (or inside) bright regions, and lays out text into the surviving gaps
using [`@chenglou/pretext`](https://github.com/chenglou/pretext). The composed scene
is the post-processed source — invert / contrast / offset, quantized to the grid
resolution — so the preview, the stage, and the exports all agree.

## Features

- **Sources**: image, video, or webcam, with transport controls for video.
- **Shape**: inside / outside flow, threshold, softness, padding, temporal smoothing,
  luma grid resolution, minimum slot width.
- **Text**: editable content, repeat toggle, font family / size / line height,
  text and background colors, 16 canvas blend modes.
- **Presets**: full-scene JSON save / export / import with Base64-embedded media.
  Every `.json` file in `presets/` is auto-discovered in the preset dropdown.
  The app boots into `pyramid1`; `?preset=<id>` deep-links another repo preset and
  `?preset=none` starts from the built-in default scene.
- **Export**: PNG snapshot and ProRes `.mov` (via `prores-wasm-encoder`), both
  rendering the exact stage composition at working resolution.

## Development

```bash
npm install
npm run dev        # http://localhost:5190
npm run build      # type-check + production build into dist/
npm test           # Vitest unit tests + Playwright e2e tests
```

## Deployment

The site is a static Vite build served from `dist/`. `netlify.toml` pins the build
command, publish directory, Node version, and the `camera=(self)` permission policy
needed by the webcam source.

## Docs

- `specification/specification.md` — product specification and decisions.
- `decisions.md` — chronological decision and bugfix log.
- `tests/REPORT.md` — test and review report.
