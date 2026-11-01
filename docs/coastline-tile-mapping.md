# Coastline Tile Mapping

This document reflects the current implemented coastline tile logic.

## Goal

- Keep map-edge water clean without accidental beach framing.
- Keep diagonal shoreline transitions continuous.
- Separate small shoreline corners (i) from larger inner corners (c).

## Current Runtime Rules

### 1. Water Tile Rules

- Exact map edge water tile always uses `water_full`.
- Non-edge water uses `water_full`, `water_edge_*`, `water_corner_*` through cardinal adjacency.
- `water_corner_land_*` is loaded but not selected by current default water pass.

### 2. Beach Generation Rules

Beach tiles are created in two passes:

1. Slope pass:
	- Low-slope tiles adjacent to water become `BEACH`.
2. Corner infill pass:
	- Inner land-like tiles can be promoted to `BEACH` when they match a corner continuity pattern.
	- This makes tiles below i-corners more likely to become c-corners instead of staying land.

### 3. Shoreline Key Selection Rules

For a beach tile:

1. If tile is on exact map edge -> `beach_full`.
2. If tile has a two-edge water corner and matching water diagonal:
	- Use small i-corner key: `beach_corner_water_*`.
	- Then rotate i-corner suffix 90 degrees counter-clockwise.
3. Otherwise compute shoreline edges and pick regular shoreline key.
	- If this is a regular two-edge corner, use `beach_corner_*`.
	- Then rotate c-corner suffix 180 degrees.

## Direction Mapping

### i Corner Mapping (`beach_corner_water_*`)

Base corner suffix is computed from water-edge pair, then rotated CCW 90:

- `ne -> nw`
- `se -> ne`
- `sw -> se`
- `nw -> sw`

### c Corner Mapping (`beach_corner_*`)

Base corner suffix is computed from shoreline-edge pair, then rotated 180:

- `ne -> sw`
- `se -> nw`
- `sw -> ne`
- `nw -> se`

## Tile Usage Reference

| Layer | Tile Type | Key Family | When Used |
|---|---|---|---|
| Water body | Water | `water_full` | Always on exact map border, and regular full-water areas |
| Water edge | Water | `water_edge_*` | Interior water transitions |
| Water corner | Water | `water_corner_*` | Interior water corners |
| Beach edge | Beach | `beach_edge_*` | Single-edge shoreline transition |
| Beach corner (c) | Beach | `beach_corner_*` | Regular inner shoreline corners after 180 rotation |
| Beach small corner (i) | Beach | `beach_corner_water_*` | Near-water small corners after CCW 90 rotation |
| Beach fill | Beach | `beach_full` | Broad beach body and exact map-edge beach fallback |

## Practical Notes

- Map-edge water behavior is intentionally strict to avoid edge artifacts.
- The i/c split now depends on corner context plus diagonal water check.
- Corner infill is the main mechanism that converts potential land gaps under i-corners into beach corners for a more continuous diagonal coast.
