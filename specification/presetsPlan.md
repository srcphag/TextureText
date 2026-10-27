# TextureText — Preset System Plan (U15)

Port of the TextureMosaic preset system (`src/engine/presets.ts` + presets UI group, TextureMosaic U11).

## Tasks

1. `presets/defaultScene.json` — repo preset (default text + params, no media).
2. `src/engine/presets.ts` — `TextureTextPresetV1` (app/version/name, canvas size, text, all 4 param groups, export settings, serialized source slot with Base64-embedded media; webcam → PNG frame fallback), `import.meta.glob('../../presets/*.json', ?url, eager)` repo discovery + lazy fetch, `validatePreset`, dataUrl/blob helpers, `buildPresetFromState` / `collectSourceSlot` / `applyPreset`.
3. `src/engine/sourceManager.ts` — track the loaded `File` (`getCurrentFile()`) for media embedding.
4. `index.html` — presets group at top of Parameters panel (`.ts-control-split` + `.ts-preset-select` dropdown, name input, save/import/export) + hidden `.json` file input.
5. `src/ui/appUi.ts` — repo + session preset wiring (dropdown, save/export download, import file picker), errors as `.toast.is-danger`.
6. `src/engine/debugApi.ts` — `exportPreset` / `importPreset` test hooks.
7. Tests — unit (`tests/unit/presets.test.ts`: validation, round-trip, dataUrl helpers) + e2e (`tests/e2e/presets.spec.ts`: repo preset applies, session save/restore, export downloads valid `.json`, import restores params+text+media, invalid file toast).
8. Docs — `decisions.md` U15, `specification.md` (D15 + §9), `tests/REPORT.md`.
9. Verify: `npm run build`, `npm test`.
