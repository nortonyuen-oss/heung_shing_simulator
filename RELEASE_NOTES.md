# The City of Heung Shing v3.1.4

Critical patch. v3.1.3 broke all new discussion forum posts — fixed here.

## Fix

- The v3.1.3 image-path fix called a helper function (`normalizeForumImagePath`) that, due to a packaging oversight, was never actually included in that release. As a result, every attempt to create a forum post — the monthly discussion post, resolution-outcome announcements, all of it — threw an error and silently failed. New games and existing saves alike stopped generating any forum content. The function is now defined directly where it's used, with no missing dependency.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 14 (unchanged from v3.1.0).
