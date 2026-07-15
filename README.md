# 香城模擬器 (The City of Heung Shing) v3.1.8

香城模擬器 (The City of Heung Shing) v3.1.8 is a SimCity 2000-style city builder with a local SQLite save system, isometric map view, cloud-assisted district news, and a classic windowed UI.

<img width="1438" height="792" alt="image" src="https://github.com/user-attachments/assets/ec3cab6e-48af-4976-b00a-097bc901e429" />

## Features

- Zone residential, commercial, and industrial districts.
- Build roads, parks, fire stations, police stations, and power plants.
- Build and render bridge decks over water using isometric bridge textures.
- Rotate the main map view and inspect the city with multiple overlay maps.
- Manage budget, taxes, loans, department funding, and city policies.
- Save and load cities locally through the bundled Node.js server.
- View power plant age, output, loading, maintenance cost, and retirement warnings.
- Use overlays for pollution, crime, fire risk, population, land value, electricity, and power plants.
- Place bilingual Hong Kong-style district signs; each sign defines a 36-tile local news area whose traffic, education, health, pollution, land value, and population feed AI headlines. Select Query and click a sign to edit both names.
- Simulate Hong Kong-style weather, typhoons, citizen activity, and district-aware news tickers.

## Electricity System

- Different building types consume different amounts of electricity.
- Different power plants have different output, upkeep, pollution, fire risk, and usable lifespan.
- Old plants gradually lose output and eventually become abandoned.
- Power shortages slow growth and can stop city expansion.
- The electricity overlay shows city power status and load.

<img width="1081" height="722" alt="image" src="https://github.com/user-attachments/assets/f591c047-768d-4117-8dd6-63a1b41d33c4" />


## Requirements

- Node.js 22 LTS

## Run

```bash
npm install
npm start
```

Open http://localhost:3000/ in your browser.

## Desktop Development

### Optional AI news

AI headlines are optional and use Ollama Cloud with `gpt-oss:20b` preferred.
Local model execution is disabled so the game cannot consume player CPU or
memory. All simulation and rule-based news continue to work without a cloud
account, and models are not bundled into the Windows or macOS installers.

No API key is included in this repository, GitHub Actions, or any installer.
After installing the game, each player opens **Settings → AI News**, pastes
their own Ollama API key once, chooses an available model, and enables AI
headlines.

Packaged builds encrypt the Ollama Cloud API key and AI choices with Electron
`safeStorage` (macOS Keychain or Windows DPAPI). Browser development stores the
same settings in an AES-256-GCM encrypted file under `.data/`, protected by a
separate owner-only key file. The provider uses Node's built-in `fetch`, so it
adds no native dependency or platform-specific path to the `.exe` or `.dmg`
build.

The browser development flow stays the same. To test the installable desktop version locally:

```bash
npm run electron:dev
```

Desktop saves are stored in the operating system user data folder instead of the project `.data` folder.

## Desktop Updates

Installed Windows desktop builds check the latest GitHub Release after launch and can download NSIS updates in the background. When an update is ready, the app asks the player to restart and install it.

macOS builds currently show a download-page prompt instead of installing automatically because true macOS auto-update requires a signed app.

## Build Installers

macOS:

```bash
npm run dist:mac
```

Windows:

```bash
npm run dist:win
```

The installers are written to `release/`. Build Windows installers on Windows, or use the included GitHub Actions workflow.

For Windows auto-update, the GitHub Release must include the public NSIS setup file, `latest.yml`, and the matching setup `.blockmap`. The workflow patches `latest.yml` so the updater uses the same no-spaces setup filename shown on the website.

## Release Flow

Use semantic versions in `package.json`:

- `2.0.1` for bug fixes
- `2.1.0` for gameplay/content updates
- `3.0.0` for breaking save-format changes

To trigger CI installer builds:

```bash
git tag v2.0.0
git push origin v2.0.0
```

## Download Website

The static download site lives in `docs/` and is designed for GitHub Pages. It links to the latest GitHub Release assets:

- `The.City.of.Heung.Shing-2.0.0-arm64.dmg`
- `The.City.of.Heung.Shing-2.0.0-x64.dmg`
- `The.City.of.Heung.Shing.Setup.2.0.0.exe`
- `The.City.of.Heung.Shing.2.0.0.exe`

To publish a new version:

1. Build the installers.
2. Create a GitHub Release for the matching tag.
3. Upload the installer files from `release/`.
4. Push `docs/` to `main`; the `Deploy Website` workflow publishes the site.

## Asset Optimization

Large model packs can increase first-load time. You can generate optimized WebP versions for residential/commercial/industrial/government model folders:

```bash
npm run optimize:assets
```

Optional environment variables:

- `ASSET_MAX_DIMENSION` (default `1024`)
- `ASSET_WEBP_QUALITY` (default `82`)

Example:

```bash
ASSET_MAX_DIMENSION=900 ASSET_WEBP_QUALITY=80 npm run optimize:assets
```

## Controls

- Use the left tool palette to place roads, zones, infrastructure, and power plants.
- Use the overlay buttons to switch map views.
- Use the rotate controls to change the map orientation.
- Click tiles or buildings to inspect details.

## Notes

- The game uses a local SQLite-backed save server.
- Map overlays, plant aging, and power shortages are part of the current gameplay loop.
