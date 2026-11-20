// Matched assets are served directly by Cloudflare; only missing paths reach this handler.
//
// The Android app (android/twa) is a Trusted Web Activity on this site: before Chrome opens the game
// full screen it checks that the site vouches for the app's signing key, here (Digital Asset Links).
// Served by the Worker rather than as a file, so no asset upload rule about dot-folders can lose it.
import assetLinks from './android/assetlinks.json';

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/.well-known/assetlinks.json') {
      return new Response(JSON.stringify(assetLinks), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  },
};
