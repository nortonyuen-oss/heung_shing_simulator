# The City of Heung Shing v2.0.0

This major release brings cloud-assisted district news and a richer living-city simulation to 香城模擬器.

## AI and city life

- Adds optional Ollama Cloud news generation with Hong Kong-style editorial language and a rule-based fallback.
- Adds simulated weather, heavy rain, typhoon stages, and citizen activity that feed both the ticker and AI context.
- Keeps local Ollama execution disabled so the game does not consume player CPU or memory for model inference.
- Stores the selected cloud model, AI setting, and API key locally with encryption.

## Player-defined districts

- Adds bilingual Hong Kong-style district signs with Chinese and English names.
- Each sign defines a 36-tile district whose traffic, education, health, pollution, land value, population, and facilities feed local news.
- Query mode can edit signs; Settings can show or hide them without changing simulation data.
- Sign placement, editing, removal, and visibility changes now autosave safely to the current city slot.

## Installation and API privacy

- No Ollama API key is included in the source repository or release installers.
- After installation, open **Settings → AI News**, paste your own Ollama API key, choose an available model, and enable AI headlines.
- macOS uses Electron safeStorage backed by the system credential service; Windows uses the corresponding protected system storage.
- The game remains fully playable without an API key through simulated and rule-based news.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 12.
