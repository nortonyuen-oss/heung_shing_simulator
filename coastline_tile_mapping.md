# Coastline Tile Mapping

This document summarizes the shoreline tile rules discussed for the current map generator.

## Goal

- Keep land coastlines natural.
- Keep beach-style shorelines visually readable.
- Prevent map-edge water from auto-growing a beach ring.
- Keep mixed corner tiles available for future topology refinement, but do not use them for the default shoreline pass.

## Key Decision Order

1. Detect whether the tile is on a map edge.
2. Detect whether the tile is water, beach, or land.
3. Classify adjacency topology: straight edge, corner, narrow inlet, or complex mixed edge.
4. Choose the most specific tile family available.

Map-edge water must be handled before generic shoreline logic.
Exact outer-border tiles should not use shoreline edge/corner sprites.

## Complete Tile Reference

| Scenario | Adjacency Shape | Recommended Tile Family | Existing Key / Asset | Purpose |
|---|---|---|---|---|
| Map-edge water | Pure water on outer border | Water body | `water_full` | Keep the outer water frame intact |
| Map-edge water | One side touches the map edge | Boundary water edge | `water_edge_n`, `water_edge_e`, `water_edge_s`, `water_edge_w` | Seal the border directionally without turning it into beach |
| Map-edge water | Outer border corner | Boundary water corner | `water_corner_ne`, `water_corner_se`, `water_corner_sw`, `water_corner_nw` | Shape the outer water frame corner |
| Map-edge water | Water cut into land near the edge | Mixed water corner | `water_corner_land_ne`, `water_corner_land_se`, `water_corner_land_sw`, `water_corner_land_nw` | Handle bays, narrow channels, and inward cuts at the shoreline |
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
- For two-side adjacent water corners, first check the matching diagonal tile:
	- If the diagonal is water, use `beach_corner_water_*` (small i corner near water).
	- If the diagonal is not water, use `beach_corner_*` (larger c corner).
- Use `beach_corner_water_*` when the shape becomes irregular, concave, or spike-like.
- Use `beach_full` only when the beach is broad enough to read as a continuous sandy band.

### 2. Sand-Beach Rules

- Treat beach as a transition band rather than a one-tile hard boundary.
- Let slope-based beach creation decide where beach starts.
- Use ordinary beach edges and corners for clean coast curves.
- Promote difficult shapes to mixed beach corners instead of forcing a normal corner.

### 3. Map-Edge Water Rules

- If a water tile is on the outer map boundary, keep it as `water_full`.
- Do not auto-convert outer water into beach.
- Do not use `water_edge_*` or `water_corner_*` on the exact outer border.
- Use `water_corner_land_*` only for inward cuts, not for the outer border by default.

## Mixed Corner Tiles and Their Role

These tiles are loaded and preserved as optional assets for future refinement:

- `water_corner_land_ne`
- `water_corner_land_se`
- `water_corner_land_sw`
- `water_corner_land_nw`
- `beach_corner_water_ne`
- `beach_corner_water_se`
- `beach_corner_water_sw`
- `beach_corner_water_nw`

Recommended use:

- `water_corner_land_*` can later absorb concave shoreline shapes and narrow inlets.
- `beach_corner_water_*` can later absorb convex or spike-like shoreline shapes.

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
