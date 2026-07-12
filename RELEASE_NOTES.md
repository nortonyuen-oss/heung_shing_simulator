# The City of Heung Shing v3.1.0

This release redesigns the Legislative Council into a categorised chamber experience, brings AI-generated commentary to the Heung Shing Forum, and fixes the reliability issues behind both AI systems.

## Legislative Council: chamber redesign

- Acts & Ordinances is no longer one long scrolling list — the 18 permanent bills are grouped into six collapsible categories (Finance & Economy, Public Safety & Transport, Environment & Urban Planning, Education & Science, Social Welfare, Governance Reform), plus a dedicated Special Resolutions group for the one-off funding motions (Cash Handout, Tour Everywhere, the MENA concert, the Mui Kin-kwok match, the AI anti-drug girl group, and Fantasy fing Heung Shing).
- Every bill and resolution now shows the portrait of the official or councillor who moved it, chosen from each character's real focus areas and interests.
- The policy/resolution detail view and the in-progress council session both open with a "podium" header using the real chamber interior artwork and the mover's portrait; an active session shows its real debate/decision stage instead of a plain status line.
- Official advice and councillors' initial positions are laid out as alternating left/right cards instead of a stacked list, reading more like an actual floor debate.

## Heung Shing Forum: AI commentary

- Forum posts can now get AI-generated comments — 2 to 3 from citizens and 1 to 2 in-character replies from named officials, clearly badged apart from the rule-based ones.
- Fixed the root cause of AI comments silently never appearing: reasoning-capable cloud models were spending their entire token budget on hidden "thinking" and leaving nothing for the actual reply. Generation now detects this, learns which models do it, and automatically falls back to a working model instead of failing silently.
- The forum popup now updates live if AI comments finish generating after the dialog is already open, instead of requiring it to be reopened.

## Settings and menus

- Music volume and a new separate City Ambience volume (the background traffic/rain/typhoon soundscape) are now both remembered between sessions.
- The Settings and View menus were reorganised: display toggles (district signs, weather visual effects) moved into View; the redundant speed controls and Budget Panel shortcut (already available on the top bar and HUD) were removed from Settings.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 14.
