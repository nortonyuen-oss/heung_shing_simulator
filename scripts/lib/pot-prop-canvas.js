// Finish a baked prop texture on a power-of-two canvas.
//
// Phaser only builds mipmaps for power-of-two textures (render.mipmapFilter, main.js), and
// the roadside props (signal poles, lamp posts, bridge parapets) are drawn at a small fraction
// of their art size, so a non-power-of-two bake point-samples into jaggies in a dev launch
// (the release pipeline pads to a power of two itself). This takes a straight-alpha RGBA
// buffer with a known anchor pixel, scales it by `scale` (lanczos, alpha-aware) and lays it
// on a `size` x `size` canvas with the anchor at `anchor`, returning the new raw buffer.
const sharp = require('sharp');

async function finishOnPowerOfTwoCanvas(pixels, width, height, { scale, size, sourceAnchor, anchor }) {
  const scaledW = Math.max(1, Math.round(width * scale));
  const scaledH = Math.max(1, Math.round(height * scale));
  const scaled = await sharp(pixels, { raw: { width, height, channels: 4, premultiplied: false } })
    .resize(scaledW, scaledH, { kernel: 'lanczos3', fit: 'fill' })
    .raw().toBuffer();
  // Where the source anchor landed in the scaled image, and where it must sit on the canvas.
  const left = Math.round(anchor.x - sourceAnchor.x * scale);
  const top = Math.round(anchor.y - sourceAnchor.y * scale);
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < scaledH; y++) {
    const ty = y + top;
    if (ty < 0 || ty >= size) continue;
    for (let x = 0; x < scaledW; x++) {
      const tx = x + left;
      if (tx < 0 || tx >= size) continue;
      scaled.copy(out, (ty * size + tx) * 4, (y * scaledW + x) * 4, (y * scaledW + x) * 4 + 4);
    }
  }
  return out;
}

module.exports = { finishOnPowerOfTwoCanvas };
