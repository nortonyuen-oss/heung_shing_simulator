# The City of Heung Shing v3.7.0 — 貨櫃碼頭！

「貨櫃碼頭！」主題版本。

## Highlights

- Added animated cargo vessels for visible container ports, with empty, half-loaded and full cargo states in all four isometric directions.
- Vessels enter from open water, approach and berth parallel to the quay, exchange cargo, sound their horn, then retrace a safe departure route.
- Calibrated all four harbor artwork orientations so the vessel model centre aligns with the true quay centre while preserving the intended shore clearance.
- The final three inbound tiles and first three outbound tiles remain parallel to the quay; farther out, routes follow the real connected waterway without treating the quay line as an infinite wall.
- Added camera-aware route caching and viewport gating so ocean pathfinding is reused and off-screen ports add negligible frame cost.
- Corrected near-berth layer ordering for the close LL/LR orientations so vessels remain visible in front of the harbor artwork where required.
- Added bilingual Chinese/English city nameplates with selectable colours, plus broader viewport culling and frame-rate limits for smoother large-city rendering.

## Compatibility

- Existing container ports begin vessel activity automatically when they are visible and the simulation is running.
- Vessel movement is visual only and does not change port income, cargo simulation, terrain or city balance.
- Existing cities remain compatible and the save format version is unchanged.
- Desktop releases package optimized lossless WebP model assets while keeping the editable PNG sources in the repository.
- Save format version: 15.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE
