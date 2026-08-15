# Multi-vehicle tracking viewport architecture

This note records the v1.0 implementation mapped from
`Heung_Shing_Multi_Vehicle_Tracking_Viewport_Spec_v1.0.md`.

## Existing architecture found

- `main.js` owns one Phaser Scene and the only game update loop
  (`updateGameFrame`). The authoritative calendar advances through
  `updateGameClock`; tracker code never advances it.
- Terrain, buildings and vehicles already share one Phaser Display List,
  depth bands and Texture Manager. Terrain is retained in `tileSprites` and
  only camera-local tiles are attached to the Display List.
- Owned buses are authoritative entities in `transport-expansion.js` and are
  projected to shared sprites by `transport-visuals.js`.
- Ambient road traffic, vessels and aircraft are visual entities in their
  respective `*-visuals.js` state registries. They remain the source of truth
  for those visuals; a tracker does not clone or advance them.

## Viewport boundary

`vehicle-tracker.js` adds one Phaser 2D Camera per open target. Each camera has
its own viewport rectangle, scroll position and 1.6 zoom, but renders the same
Scene, objects, textures, masks and depth values as the main camera. The
320 x 180 area in each DOM window presents that Camera's own rendered rectangle
through a lightweight foreground backing canvas. This presentation surface is
necessary so the live view stays above menus and screen controls when a window
overlaps them; it never crops the main Camera. There is no second game
instance, renderer, asset load, iframe or simulation.

The target key is `<vehicle-type>:<vehicle-id>`. Opening an existing key
restores and focuses its existing window. Windows can be dragged, minimised,
restored and closed independently. Camera, foreground surface and pointer
listeners are destroyed when a window closes. All windows are cleared when the
transport/world state is reset or loaded.

Supported resolver types are:

- `transport`: purchased buses, including route, current leg and passengers;
- `traffic`: ambient road vehicles;
- `vessel`: active harbour vessel events;
- `aircraft`: active airport events.

The bus fleet UI is the player-facing entry point. Inspect-mode clicks on
ambient road vehicles, vessels and aircraft use the same generic manager.

## Scheduling and culling

`beginVehicleTrackerFrame` runs once inside `updateGameFrame`. One fair
round-robin scheduler targets a 15 FPS maintenance cadence for one to four
visible windows and 5–12 FPS above four, prioritises the focused window, and
admits status/layout/static-culling work against a 4 ms estimated budget. The
Camera itself stays composited on every Phaser display frame: because the main
Camera repaints the shared canvas, switching a tracker Camera off between
maintenance frames would expose the main view through the transparent tracker
viewport and cause flashing. A minimised window disables its Camera entirely.

Terrain culling uses the union of separate camera rectangles rather than a
large box between distant cameras. Main-camera filter bits keep tracker-only
terrain out of the main render list. Tracker camera filters are initially
seeded once, then updated from shared world-space buckets when the target
crosses a tile; only the small dynamic-vehicle registry is checked between
scheduled maintenance passes. New Display List objects and newly activated
terrain tiles get their camera bits incrementally.

`getVehicleTrackerDebugSnapshot()` exposes tracker count, render count and
rate, render/cull milliseconds, deferrals, viewport dimensions, render scale,
visible tiles and visible entities. It is pull-only and produces no production
console or UI output.

## Verification record

Baseline on the development Electron instance and save `旺角` before this
change (228 frames): frame p50 16.8 ms, p95 19.1 ms, average main render 4.14
ms, 609 active terrain tiles and 912 rendered objects. A later no-tracker
control after the change retained a 16.7 ms frame p50; long simulation tasks in
that run made its averages unsuitable for comparison.

Component measurements after spatial filtering:

- one tracker camera: normally about 0.4–1.8 ms per draw;
- steady tracker object cull: normally 0–0.8 ms;
- 140–190 rendered entities and roughly 100–130 terrain tiles per tracker in
  the representative city;
- render scale 1.0 on the development Electron instance (below the 1.5 cap);
- minimising a tracker removes its camera from scheduling and closing it
  removes the Phaser Camera.

Automated coverage is in `test/vehicle-tracker.test.js`, with culling regression
coverage in `test/renderer-performance.test.js`. Manual checks cover duplicate
focus, independent main/tracker camera movement, drag, minimise/restore,
close/reopen, unavailable targets, multiple bus targets and load/reset cleanup.

## Known limits

- Ambient traffic is intentionally visual-only in the existing game. A tracked
  ambient vehicle is retained outside the main camera while its tracker is
  open, but it is not persisted in saves.
- Tracker compositing cannot exceed the actual Phaser main-loop rate. Under a
  heavily blocked simulation frame the scheduler preserves simulation
  correctness and main input before tracker maintenance work.
- Tracker window positions are not persisted in v1.0.
