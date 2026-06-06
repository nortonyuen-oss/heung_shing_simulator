# Release Update Checklist

Use this checklist whenever the game, models, music, website, or desktop builds need to be shipped as one synchronized release.

## 1. Check Current State

```bash
git status --short --branch
gh release list --repo nortonyuen-oss/heung_shing_simulator --limit 5
```

- Do not overwrite unrelated local changes.
- Confirm the latest public version before choosing the next version.
- Use a new patch version for release/build fixes, for example `1.0.6` after `1.0.5`.

## 2. Update Game Assets And Fallbacks

When adding, removing, renaming, or resizing models:

- Update building/service definitions in `constants.js`.
- Update asset fallback lists in `model-catalog.js`.
- Update save migration fallback logic in `save.js` if old saves may reference old sprite keys.
- Confirm every referenced model/music file exists on disk.

Useful checks:

```bash
rg "oldSpriteKey|old/file/name|1.0.6"
node --check constants.js
node --check model-catalog.js
node --check save.js
```

## 3. Bump Version Everywhere

```bash
npm version 1.0.6 --no-git-tag-version
```

Then update visible version text:

- `README.md`
- `docs/index.html`
- `i18n.js`
- `index.html`

Also update the website release notes and counters:

- Add the new release summary to the changelog section in `docs/index.html`.
- Confirm the `data-download-link` platform keys in `docs/index.html` still match the asset matchers in `docs/site.js`.

Quick search:

```bash
rg "1\.0\.3|1\.0\.4" README.md docs/index.html i18n.js index.html package.json package-lock.json
```

## 4. Keep Desktop Build Outputs In Sync

The installer workflow must build all platforms:

- macOS Apple Silicon DMG: `The.City.of.Heung.Shing-<version>-arm64.dmg`
- macOS Intel DMG: `The.City.of.Heung.Shing-<version>-x64.dmg`
- Windows installer EXE: `The.City.of.Heung.Shing.Setup.<version>.exe`
- Windows portable EXE: `The.City.of.Heung.Shing.<version>.exe`

For Windows auto-update, the release must also include the original electron-builder NSIS setup artifact, its matching `*.exe.blockmap`, and `latest.yml`. Do not edit or rename the artifact referenced by `latest.yml`.

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
git commit -m "Release v1.0.6"
git tag v1.0.6
git push origin main
git push origin v1.0.6
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
gh release view v1.0.6 --repo nortonyuen-oss/heung_shing_simulator --json tagName,name,url,assets
curl -fsSL https://nortonyuen-oss.github.io/heung_shing_simulator/ | rg "1\.0\.4|arm64|x64|The\.City\.of\.Heung\.Shing"
gh release list --repo nortonyuen-oss/heung_shing_simulator --limit 3
```

Confirm the latest release has all four files:

- `The.City.of.Heung.Shing-1.0.6-arm64.dmg`
- `The.City.of.Heung.Shing-1.0.6-x64.dmg`
- `The.City.of.Heung.Shing.Setup.1.0.6.exe`
- `The.City.of.Heung.Shing.1.0.6.exe`

Confirm Windows auto-update files are also present:

- `latest.yml`
- Original `The City of Heung Shing Setup <version>.exe`
- Original `The City of Heung Shing Setup <version>.exe.blockmap`

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
git tag -f v1.0.6 HEAD
git push origin v1.0.6 --force
```

Only force-push a tag when the broken tag has not produced a valid public release.

## 10. Final Local Check

```bash
git status --short --branch
```

Expected:

- `main` is aligned with `origin/main`.
- Only intentionally ignored/untracked local files remain.
