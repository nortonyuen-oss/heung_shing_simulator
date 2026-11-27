# Release Update Checklist

Use this checklist whenever the game, models, music, website, or desktop builds need to be shipped as one synchronized release.

## 1. Check Current State

```bash
git status --short --branch
gh release list --repo nortonyuen-oss/heung_shing_simulator --limit 5
```

- Do not overwrite unrelated local changes.
- Confirm the latest public version before choosing the next version.
- Choose a theme name for every release and store it in `package.json` as `releaseTheme`.
- Use a new patch version for release/build fixes, for example `2.0.1` after `2.0.0`.

## 2. Update Game Assets And Fallbacks

When adding, removing, renaming, or resizing models:

- Update building/service definitions in `constants.js`.
- Update asset fallback lists in `model-catalog.js`.
- Update save migration fallback logic in `save.js` if old saves may reference old sprite keys.
- Confirm every referenced model/music file exists on disk.

Useful checks:

```bash
rg "oldSpriteKey|old/file/name|2.0.0"
node --check constants.js
node --check model-catalog.js
node --check save.js
```

## 2b. Memory Budget (must pass)

Norton, 2026-11-28: a phone browser closed the game after a while of play - the game held ~1.2 GB
(building night art, a suspension bridge's cables). The game's own memory on a phone must stay
within `MEMORY_BUDGET_MB.check` in `memory-budget.js`: **textures 420 MB, JavaScript heap 150 MB,
500 MB together**.

```bash
npm run build:web
npm run test:memory
```

It plays the built browser game in a phone-sized Chrome: the 太子 showcase city with a 懸索橋 over
its longest stretch of sea, at speed through several days and nights, the camera moving about.
It prints each sample (textures by kind, the heap after a garbage collection) and the peaks, and
writes `.data/memory-check/report.json`. A FAIL blocks the release: look at the kind that grew
(`buildingNight`, `bridges`, `festivals`, `zoneBuildings`...) and fix it, or - only with Norton's
say-so - change the budget.

The browser's own processes are not the game's and are not measured (a phone cannot report them).

Building art reaches a phone GPU-compressed (ASTC 6x6, a ninth of RGBA): `npm run build:web` makes
the copies (`scripts/compressed-textures.js`, ~2-3 min the first time, cached in `.data/astc-cache`)
and `gpu-texture-compression.js` loads them on a phone whose browser has ASTC. The check runs that
way by default (Chrome draws with SwiftShader, which has ASTC as a phone does). Run it once more with
`MEMORY_TEST_GPU_TEXTURES=off` for a phone without ASTC, which loads the WebP - that must pass too.

## 3. Bump Version Everywhere

```bash
npm version 2.0.0 --no-git-tag-version
```

Then update visible version text:

- `README.md`
- `docs/index.html`
- `i18n.js`
- `index.html`
- `RELEASE_NOTES.md`

Use the same theme name in:

- `package.json` as `releaseTheme`
- the first `RELEASE_NOTES.md` heading, in the form `# The City of Heung Shing v2.0.0 — Theme Name`
- `README.md`
- `docs/index.html`
- the `i18n.js` offline fallback and `index.html` fallback text

The installer workflow uses the first `RELEASE_NOTES.md` heading as the GitHub Release title.

Also update the website release notes and counters:

- Add the new release as the FIRST entry in `SITE_CHANGELOG["zh-HK"]` (`docs/i18n.js`) - `{ version, date, dateLabel, title, items }` - then add matching translated entries keyed by the same version string to `SITE_CHANGELOG_TRANSLATIONS["zh-TW"|"en"|"ja"]`. Missing translations fall back to the zh-HK text, so don't skip zh-TW/en/ja - the page will look "fixed" but silently show Chinese to non-Chinese readers. Nothing is hand-authored in the HTML: `docs/site-pages.js` renders the newest three as the home page's 最新密令 (`data-render="latest-orders"`, NEW! for 21 days) and every release, grouped by major version, on `docs/changelog.html` (`data-render="release-history"`).
- Update the hero version badge/description (`hero.versionBadge` / `hero.versionDesc` in `docs/i18n.js`, all 4 languages: zh-HK, zh-TW, en, ja) to the new version and a one-line summary of what's new.
- Bump the `?v=YYYYMMDD-N` cache-busting query string on every `site-1999.css` / `site-*.js` / `i18n.js` / `web-play.js` / `site.js` reference whenever any of those files change - one token for all of them, in every page that loads them (`docs/*.html`). Forgetting this means visitors' browsers (and possibly the CDN) keep serving the stale cached file even after the new one is deployed - for `i18n.js` specifically, this makes any new `data-i18n` key render as the literal key name (e.g. "hero.versionBadge") instead of real text, since the old dictionary doesn't have it yet.
- If a chapter's district, title or board art changed, re-run `node scripts/build-site-assets.js` (regenerates `docs/assets/site/` and `docs/site-campaign.js` from the game's files).
- Confirm the `data-download-link` platform keys in `docs/index.html` still match the asset matchers in `docs/site.js`.

Quick search:

```bash
rg "1\.1\.0|2\.0\.0" README.md docs/index.html i18n.js index.html package.json package-lock.json
```

## 4. Keep Desktop Build Outputs In Sync

The installer workflow must build all platforms:

- macOS Apple Silicon DMG: `The.City.of.Heung.Shing-<version>-arm64.dmg`
- macOS Intel DMG: `The.City.of.Heung.Shing-<version>-x64.dmg`
- Windows installer EXE: `The.City.of.Heung.Shing.Setup.<version>.exe`
- Windows portable EXE: `The.City.of.Heung.Shing.<version>.exe`

For Windows auto-update, the release must also include the public NSIS setup artifact, its matching `*.exe.blockmap`, and `latest.yml`. The release workflow patches `latest.yml` so the updater uses the same no-spaces setup filename shown on the website.

The website links in `docs/index.html` must point to the same filenames under:

```text
https://github.com/nortonyuen-oss/heung_shing_simulator/releases/latest/download/
```

## 5. Validate Before Commit

```bash
node --check i18n.js
node --check constants.js
node --check model-catalog.js
node --check save.js
node --check main.js
git diff --check
git status --short --branch
```

Review the diff and make sure only intended files are staged:

```bash
git diff --stat
git diff --cached --stat
```

## 6. Commit, Tag, And Push

```bash
git add <changed-files>
git commit -m "Release v2.0.0"
git tag v2.0.0
git push origin main
git push origin v2.0.0
```

Do not include `.vscode/` or `test-results/` unless there is a specific reason.

## 7. Watch GitHub Actions

```bash
gh run list --repo nortonyuen-oss/heung_shing_simulator --workflow "Deploy Website" --limit 3
gh run list --repo nortonyuen-oss/heung_shing_simulator --workflow "Build Installers" --limit 5
gh run watch <run-id> --repo nortonyuen-oss/heung_shing_simulator
```

Expected result:

- `Deploy Website` succeeds.
- `Build Installers` succeeds.
- Build matrix includes Windows, macOS ARM64, and macOS x64.
- Publish release job succeeds.

## 8. Verify Release And Website

```bash
gh release view v2.0.0 --repo nortonyuen-oss/heung_shing_simulator --json tagName,name,url,assets
curl -fsSL https://nortonyuen-oss.github.io/heung_shing_simulator/ | rg "2\.0\.0|arm64|x64|The\.City\.of\.Heung\.Shing"
gh release list --repo nortonyuen-oss/heung_shing_simulator --limit 3
```

Confirm the latest release has all four files:

- `The.City.of.Heung.Shing-2.0.0-arm64.dmg`
- `The.City.of.Heung.Shing-2.0.0-x64.dmg`
- `The.City.of.Heung.Shing.Setup.2.0.0.exe`
- `The.City.of.Heung.Shing.2.0.0.exe`

Confirm Windows auto-update files are also present:

- `latest.yml`
- `The.City.of.Heung.Shing.Setup.<version>.exe.blockmap`

## 9. If Release Publish Fails

Common causes:

- Artifact filename changed.
- Release job cannot find the repository.
- A tag/release already exists.

Preferred fixes:

- Make the workflow discover `.dmg` and `.exe` files instead of hard-coding builder output names.
- Use `gh release create --repo "$GITHUB_REPOSITORY"`.
- If a tag was pushed but no release was created, fix the workflow, move the tag to the fixed commit, and force-push the tag.

```bash
git tag -f v2.0.0 HEAD
git push origin v2.0.0 --force
```

Only force-push a tag when the broken tag has not produced a valid public release.

## 10. Final Local Check

```bash
git status --short --branch
```

Expected:

- `main` is aligned with `origin/main`.
- Only intentionally ignored/untracked local files remain.
