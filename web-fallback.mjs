// Matched assets are served directly by Cloudflare; only missing paths reach this handler.
export default {
  fetch() {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  },
};
