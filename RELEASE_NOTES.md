# The City of Heung Shing v3.0.0

This major release adds a full Legislative Council, ties AI news to named council characters, and rebuilds the weather system with real typhoon signals and live visual effects.

## Legislative Council (Phase 1)

- Adds 10 named officials and councillors with distinct beliefs, focus issues, and rule-based opinions that react to real city data (budget, tax, crime, pollution, health, and more).
- Council overview and Acts & Ordinances tabs open once the Legislative Council is built and the city has enough population; opinions stay locked until then.
- Officials and councillors can be renamed by the player; stable internal IDs keep news, votes, and comments consistent across renames.
- Policy actions generate rule-based council news immediately, with an optional AI-authored version layered on top when Ollama Cloud is enabled.

## AI news, now with characters

- Adds a `council_character` story type so AI news can voice specific officials — policy reactions, on-demand "profile feature" pieces, and typhoon signal announcements from the Observatory Director.
- AI output is validated against the authoritative facts the game engine already decided (no invented numbers, policies, or characters); a rule-based fallback always covers the same event if AI is disabled or fails.
- Newspaper "Extra" front pages celebrate milestones — Legislative Council opening, Stock Exchange listing, and Typhoon Signal No. 8+ bulletins — using the same rule-first pipeline.

## Weather system rebuild

- Typhoons are now named from the real Western North Pacific tropical cyclone list (Chinese and Japanese names included) and progress through realistic 1→3→8→(9→10)→8→3→1 signal arcs driven directly by simulated wind speed.
- Rainstorm warnings (Amber/Red/Black) are derived from simulated rainfall using Hong Kong Observatory-style thresholds.
- A topbar weather chip shows live condition, temperature, humidity, and active signal/rainstorm badges using official-style HKO iconography; click it for a detail legend.
- Adds screen-space rain particles and lightning with thunder, both tied to the same storm-severity ladder as the sky-darkening effect — rain falls vertically in calm weather and leans further with rising wind speed.
- A new Settings toggle lets players disable rain/lightning visual effects for lower-end machines while keeping the (near-zero-cost) sky darkening.
- Adds a zoom-aware Hong Kong ambient soundscape: zooming into dense commercial/residential blocks fades in matching urban or residential room tone, layered with rain/typhoon audio when the weather turns.

## Balance and fixes

- Rebalances nuclear power plant pollution to better reflect its real lifecycle footprint relative to coal.
- Fixes a topbar weather dialog bug where reopening it kept appending old readings instead of showing only the current weather.
- Fixes screen-space weather effects (darkening, rain, lightning) not covering the full viewport when zoomed out.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 13.
