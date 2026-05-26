# City Builder Classic

City Builder Classic is a SimCity 2000-style city builder with a local SQLite save system, isometric map view, and a classic windowed UI.

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

## Electricity System

- Different building types consume different amounts of electricity.
- Different power plants have different output, upkeep, pollution, fire risk, and usable lifespan.
- Old plants gradually lose output and eventually become abandoned.
- Power shortages slow growth and can stop city expansion.
- The electricity overlay shows city power status and load.

<img width="1081" height="722" alt="image" src="https://github.com/user-attachments/assets/f591c047-768d-4117-8dd6-63a1b41d33c4" />


## Requirements

- Node.js 18 or newer

## Run

```bash
npm install
npm start
```

Open http://localhost:3000/ in your browser.

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
