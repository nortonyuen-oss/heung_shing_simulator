# City Builder Classic

City Builder Classic is a SimCity 2000-style city builder with a local SQLite save system, isometric map view, and a classic windowed UI.

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

## Requirements

- Node.js 18 or newer

## Run

```bash
npm install
npm start
```

Open http://localhost:3000/ in your browser.

## Controls

- Use the left tool palette to place roads, zones, infrastructure, and power plants.
- Use the overlay buttons to switch map views.
- Use the rotate controls to change the map orientation.
- Click tiles or buildings to inspect details.

## Notes

- The game uses a local SQLite-backed save server.
- Map overlays, plant aging, and power shortages are part of the current gameplay loop.