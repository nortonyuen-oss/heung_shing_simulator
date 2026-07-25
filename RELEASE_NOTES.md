# The City of Heung Shing v3.4.0

Visible traffic and road-performance release.

## Highlights

- Added 19 visual traffic models across buses, private cars, minibuses, taxis, trucks and vans, with 76 direction-specific sprites and vehicle-specific city scale factors.
- Added left-hand traffic that follows connected roads, uses separate directional lanes, rounds junction turns and maintains spacing behind slower vehicles.
- Connected vehicle density to the visible `trafficMap`, with weighted hotspot spawning and a bounded 28-vehicle viewport cap.
- Added continuous vehicle movement across elevated roads, terrain slopes, crests, bridge ramps and bridge decks.
- Added realistic grade behaviour: vehicles slow to 82% uphill and 94% downhill while retaining the correct screen-facing texture through every map rotation.
- Added zoom-gated, lazy-loaded and viewport-only traffic rendering so off-screen vehicles and low-zoom traffic do not consume simulation resources.
- Improved large-map responsiveness with live camera terrain culling, bounded spawn and route-transition work, batched depth updates and incremental traffic asset loading.

## Compatibility

- Existing cities load without migration.
- Traffic vehicles are session-only visual representatives and are not written into saves.
- Save format version: 15.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE
