# The City of Heung Shing v3.1.3

Patch release. Fixes broken forum news images and reduces how often the forum posts filler chatter.

## Fix

- 15 forum "special event" images (typhoon, rainstorm, academic ranking, singer scandal, free ice cream, night drone show, and others) still pointed at their old pre-WebP-migration `.png` paths, which no longer exist on disk — every one of them showed as a broken image. All references now point at the real `.webp` files, and the image-path validator that builds each forum post now reuses the same normalization used elsewhere, instead of a separate check that only accepted the old format.
- The discussion forum generated a new post every single in-game month, even when nothing notable happened, which added up to unnecessary churn over a long game. It now only posts every month when something actually triggers it (a typhoon, a new policy, a stat threshold, a seasonal event, etc.); if nothing did, it falls back to at most once every 3 months.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 14 (unchanged from v3.1.0).
