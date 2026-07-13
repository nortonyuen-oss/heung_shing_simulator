# The City of Heung Shing v3.1.6

Forum image rendering correction for desktop packages.

## Fixes

- Fixed the city-state sanitizer that discarded every current `UI/news/*.webp` forum image path before the renderer created its `<img>` elements.
- Legacy `UI/News/*.png` save references now migrate to the case-correct optimized WebP assets.
- Added a release regression test covering both current and legacy forum image paths.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 14 (unchanged from v3.1.0).
