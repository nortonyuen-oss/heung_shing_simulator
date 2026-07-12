# The City of Heung Shing v3.1.2

Patch release. Fixes a request-flood bug that could make forum images and audio appear broken.

## Fix

- When the AI news backend was unavailable (e.g. a rate-limited or exhausted API key), the Heung Shing Forum retried every pending post's AI comment generation on every trigger with no backoff — up to 60 requests per sweep, repeated. This saturated the local server's connection pool and could starve unrelated requests (forum/newspaper images, and briefly audio) behind the queue, making them appear permanently broken even though the underlying files were fine.
- AI News now has a proper circuit breaker shared across all three AI features (news ticker, council character news, forum comments): 3 consecutive failures anywhere turns AI News off entirely instead of each feature quietly retrying forever in the background. A toast explains what happened. Re-enabling AI News from Settings resets the counter and immediately fires a fresh test request, which is itself subject to the same 3-strikes rule.

## Downloads

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows installer EXE
- Windows portable EXE

Save format version: 14 (unchanged from v3.1.0).
