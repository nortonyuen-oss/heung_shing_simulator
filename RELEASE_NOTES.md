# The City of Heung Shing v3.7.2 — 貨櫃碼頭！

穩定性同效能修復版本。

## Highlights

- Fixed a simulation-tick performance bug: `computeHappiness` and the health-metrics pass rebuilt every residential tile's tree-canopy and scenic-view score from scratch on every single tick (every 5s, or 1.25s at 4x speed), duplicating an uncached full-map radius scan already known to cause long GC pauses in mature cities. Scores are now cached for the game month and shared between both systems, matching the caching strategy already used for zone-growth land value.
- Added renderer crash/hang recovery to the desktop app: if the game's display process crashes or stops responding for more than a few seconds, the app now offers to reload it in place instead of leaving a frozen, unrecoverable window that required a force-quit.
- Added a close (✕) button to the hidden performance test-mode panel, so it can be dismissed directly instead of repeating the five-rapid-click icon gesture.

## Compatibility

- All three fixes are internal engine/tooling changes; city balance, save format and gameplay are unaffected.
- Existing cities remain compatible and the save format version is unchanged.
- Save format version: 15.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE
