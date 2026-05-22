# Coastline Tile Mapping

This document summarizes the shoreline tile rules discussed for the current map generator.

## Goal

- Keep land coastlines natural.
- Keep beach-style shorelines visually readable.
- Prevent map-edge water from auto-growing a beach ring.
- Make use of currently loaded but unused mixed corner tiles.

## Key Decision Order

1. Detect whether the tile is on a map edge.
2. Detect whether the tile is water, beach, or land.
3. Classify adjacency topology: straight edge, corner, narrow inlet, or complex mixed edge.
4. Choose the most specific tile family available.

Map-edge water must be handled before generic shoreline logic.

## Complete Tile Reference

| Scenario | Adjacency Shape | Recommended Tile Family | Existing Key / Asset | Purpose |
|---|---|---|---|---|
| Map-edge water | Pure water on outer border | Water body | `water_full` | Keep the outer water frame intact |
| Map-edge water | One side touches the map edge | Boundary water edge | `water_edge_n`, `water_edge_e`, `water_edge_s`, `water_edge_w` | Seal the border directionally without turning it into beach |
| Map-edge water | Outer border corner | Boundary water corner | `water_corner_ne`, `water_corner_se`, `water_corner_sw`, `water_corner_nw` | Shape the outer water frame corner |
| Map-edge water | Water cut into land near the edge | Mixed water corner | `water_corner_land_ne`, `water_corner_land_se`, `water_corner_land_sw`, `water_corner_land_nw` | Handle bays, narrow channels, and inward cuts |
| Land shoreline | One side touches water | Basic beach edge | `beach_edge_n`, `beach_edge_e`, `beach_edge_s`, `beach_edge_w` | Basic shoreline transition |
| Land shoreline | Two adjacent sides touch water | Basic beach corner | `beach_corner_ne`, `beach_corner_se`, `beach_corner_sw`, `beach_corner_nw` | Simple shoreline turn |
| Land shoreline | Three or more sides are affected by water or mixed topology | Mixed beach corner | `beach_corner_water_ne`, `beach_corner_water_se`, `beach_corner_water_sw`, `beach_corner_water_nw` | Remove spikes and smooth awkward turns |
| Land shoreline | Broad, continuous sandy coast | Beach fill | `beach_full` | Wide beach stretches and small sand bars |
| Sand-beach shoreline | Low-slope land next to water | Beach body and edge | `beach_full` + `beach_edge_*` | Stable sand coast bands |
| Sand-beach shoreline | Sand coast turn | Beach corner | `beach_corner_*` | Natural curve at shoreline bends |
| Sand-beach shoreline | Sand coast with inward water cut | Mixed beach corner | `beach_corner_water_*` | Soften concave shoreline shapes |
| Inland water | Water touching land on one side | Water edge | `water_edge_*` | Lakes, rivers, and inland shore outlines |
| Inland water | Water turning a corner | Water corner | `water_corner_*` | Regular inland water bends |
| Inland water | Narrow inlet or strong concave mix | Mixed water corner | `water_corner_land_*` | Better fit for bays and narrow openings |

## Rules by Category

### 1. Land Shoreline Rules

- Use `beach_edge_*` for a single water-adjacent side.
- Use `beach_corner_*` for a simple two-side adjacent corner.
- Use `beach_corner_water_*` when the shape becomes irregular, concave, or spike-like.
- Use `beach_full` only when the beach is broad enough to read as a continuous sandy band.

### 2. Sand-Beach Rules

- Treat beach as a transition band rather than a one-tile hard boundary.
- Let slope-based beach creation decide where beach starts.
- Use ordinary beach edges and corners for clean coast curves.
- Promote difficult shapes to mixed beach corners instead of forcing a normal corner.

### 3. Map-Edge Water Rules

- If a water tile is on the outer map boundary, keep it as water.
- Do not auto-convert outer water into beach.
- Prefer `water_full`, `water_edge_*`, or `water_corner_*` for the border frame.
- Use `water_corner_land_*` only for inward cuts, not for the outer border by default.

## Unused Tiles and Their Intended Role

These tiles are loaded but not currently selected by the shoreline key logic:

- `water_corner_land_ne`
- `water_corner_land_se`
- `water_corner_land_sw`
- `water_corner_land_nw`
- `beach_corner_water_ne`
- `beach_corner_water_se`
- `beach_corner_water_sw`
- `beach_corner_water_nw`

Recommended use:

- `water_corner_land_*` should absorb concave water shapes and narrow inlets.
- `beach_corner_water_*` should absorb convex or spike-like shoreline shapes.

## Practical Priority Order

1. Map-edge water first.
2. Inland water or shoreline second.
3. Regular edge and corner tiles third.
4. Mixed corner tiles for awkward or high-frequency topologies.

## Outcome Target

- Land shoreline stays readable and less jagged.
- Beach shoreline becomes smoother and more natural.
- Map-edge water remains water instead of spawning a beach ring.
- Mixed corner tiles get a real function in shoreline shaping.
