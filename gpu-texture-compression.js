// GPU-compressed building art on phones (Norton 2026-11-28: 可以點樣再減 texture).
//
// The web build ships each building picture twice: the WebP every browser can show, and an ASTC
// copy (scripts/compressed-textures.js) a phone's GPU keeps compressed - a ninth of the memory. On a
// phone ('low' memory profile, memory-budget.js) whose browser has ASTC, a building picture the game
// asks for with load.image comes as the ASTC copy instead; anywhere else, or if the copy fails to
// load, the WebP comes as before. The game asks for pictures the same way either way.
//
// A compressed texture has no picture behind it to read pixels from. Its source keeps a stand-in
// with the picture's size (so getSourceImage().width/height still answer) and the texture an alpha
// mask the build made, which getPixelAlpha answers from - clicks on buildings, 盂蘭 fire placement.
//
// ?gpuTextures=off (or =on, to try it in a computer's browser) and localStorage
// 'heungShing.gpuTextures' override the choice.

const GPU_TEXTURE_PREFERENCE_KEY = 'heungShing.gpuTextures';
const gpuTextureFailures = new Set();
let gpuTextureLookup = null;
let gpuTextureLookupManifest = null;

function getGpuTexturePreference() {
  try {
    const query = new URLSearchParams(globalThis.location?.search || '').get('gpuTextures');
    if (query === 'on' || query === 'off') return query;
    const stored = globalThis.localStorage?.getItem(GPU_TEXTURE_PREFERENCE_KEY);
    if (stored === 'on' || stored === 'off') return stored;
  } catch {
    // (no storage, no location: the default)
  }
  return null;
}

// Whether this browser on this device loads building art compressed.
function gpuTexturesEnabled(renderer) {
  if (globalThis.HEUNG_SHING_CONFIG?.platform !== 'web') return false;
  if (!renderer?.gl || !renderer.compression?.ASTC) return false;
  if (typeof DecompressionStream !== 'function' || typeof Response !== 'function') return false;
  const preference = getGpuTexturePreference();
  if (preference) return preference === 'on';
  return typeof getMemoryProfile === 'function' && getMemoryProfile() === 'low';
}

function normalizeGpuTexturePath(value) {
  const path = String(value ?? '').split('?')[0].split('#')[0].replace(/^\/+/, '');
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

// The compressed copy of a picture, by its logical path or its shipped path.
function getGpuTextureUrl(url) {
  const manifest = typeof modelAssetManifest !== 'undefined' ? modelAssetManifest : null;
  if (!manifest?.entries) return null;
  if (gpuTextureLookupManifest !== manifest) {
    gpuTextureLookupManifest = manifest;
    gpuTextureLookup = new Map();
    Object.entries(manifest.entries).forEach(([logical, entry]) => {
      const astc = entry?.compressed?.astc;
      if (!astc) return;
      gpuTextureLookup.set(normalizeGpuTexturePath(logical), astc);
      if (entry.packagedPath) gpuTextureLookup.set(normalizeGpuTexturePath(entry.packagedPath), astc);
    });
  }
  return gpuTextureLookup.get(normalizeGpuTexturePath(url)) || null;
}

async function inflateGpuTexture(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

// The alpha mask from the KTX's key/value data: [w, h, scale] (uint16) and a byte a cell.
function readGpuTextureAlphaMask(buffer) {
  const view = new DataView(buffer);
  const kvBytes = view.getUint32(12 + 12 * 4, true);
  let at = 64;
  const end = at + kvBytes;
  while (at + 4 <= end) {
    const size = view.getUint32(at, true);
    const body = new Uint8Array(buffer, at + 4, size);
    const nul = body.indexOf(0);
    const key = String.fromCharCode(...body.subarray(0, Math.max(0, nul)));
    if (key === 'HSAlphaMask' && size >= nul + 7) {
      const head = new DataView(buffer, at + 4 + nul + 1, 6);
      const w = head.getUint16(0, true), h = head.getUint16(2, true), scale = head.getUint16(4, true);
      const start = at + 4 + nul + 7;
      // (a copy: a view would keep the whole file alive)
      if (start + w * h <= at + 4 + size) return { w, h, scale, data: new Uint8Array(buffer.slice(start, start + w * h)) };
    }
    at += 4 + size + ((4 - (size % 4)) % 4);
  }
  return null;
}

function parseGpuTexture(buffer) {
  const textureData = Phaser.Textures.Parsers.KTXParser(buffer);
  if (!textureData?.mipmaps?.length) throw new Error('not a compressed texture');
  return { textureData, alphaMask: readGpuTextureAlphaMask(buffer) };
}

// After Phaser made the texture: mipmapped filtering (Phaser sets LINEAR for every compressed
// texture: it cannot know the chain is whole), the size stand-in and the alpha mask, and the file's
// bytes let go (Phaser 3.60 does not rebuild textures from their data after a lost context).
function finishGpuTexture(renderer, texture, parsed) {
  const source = texture?.source?.[0];
  if (!source) return;
  const levels = parsed.textureData.mipmaps;
  const last = levels[levels.length - 1];
  const gl = renderer?.gl;
  if (gl && source.glTexture && last && last.width === 1 && last.height === 1) {
    gl.activeTexture(gl.TEXTURE0);
    const bound = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, source.glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, bound);
  }
  source.hsGpuBytes = levels.reduce((sum, level) => sum + (level.data?.byteLength || 0), 0);
  parsed.textureData.mipmaps = [];
  source.image = { width: source.width, height: source.height, hsCompressed: true, hsAlphaMask: parsed.alphaMask };
  texture.hsAlphaMask = parsed.alphaMask;
}

function isGpuCompressedTexture(texture) {
  return !!texture?.source?.[0]?.compressionAlgorithm;
}

function installGpuTextureCompression() {
  const Loader = globalThis.Phaser?.Loader;
  const TextureManager = globalThis.Phaser?.Textures?.TextureManager;
  if (!Loader?.LoaderPlugin || !Loader.FileTypesManager || !TextureManager || Loader.LoaderPlugin.prototype.__hsGpuTextures) return;

  // Phaser hands each loader its file types as the loader is made (FileTypesManager.install), so the
  // 'image' type is replaced there - this runs before the game makes its scenes.
  const types = {};
  Loader.FileTypesManager.install(types);
  const originalImage = types.image;
  if (typeof originalImage !== 'function') return;

  // (its own file type: a WebP of the same key can then join the same load when this one fails)
  class GpuTextureFile extends Loader.File {
    constructor(loader, key, url, fallbackUrl) {
      super(loader, {
        type: 'gputexture', cache: loader.textureManager, extension: 'ktxz', responseType: 'arraybuffer', key, url,
      });
      this.hsFallbackUrl = fallbackUrl;
    }

    // A copy that will not do - a missing file, a bad decode, a format the GPU lacks - gives way to
    // the WebP for good, in this same load: the loader is not done while a file waits in its list.
    fallBack() {
      if (this.hsFellBack) return;
      this.hsFellBack = true;
      gpuTextureFailures.add(this.key);
      if (this.loader?.isLoading?.() && this.hsFallbackUrl) originalImage.call(this.loader, this.key, this.hsFallbackUrl);
    }

    onProcess() {
      this.state = Loader.FILE_PROCESSING;
      inflateGpuTexture(this.xhrLoader.response).then((buffer) => {
        this.data = parseGpuTexture(buffer);
        this.onProcessComplete();
      }).catch(() => {
        this.fallBack();
        this.onProcessError();
      });
    }

    onLoad(xhr, event) {
      if (xhr?.status >= 400 || (event?.target && event.target.status !== 200 && event.target.status !== 0)) this.fallBack();
      super.onLoad(xhr, event);
    }

    onError() {
      this.fallBack();
      super.onError();
    }

    addToCache() {
      if (!this.data) return;
      const renderer = this.loader.systems.game.renderer;
      const textureData = this.data.textureData;
      // (Phaser makes a compressed texture only when its data names the format - without it the
      // texture comes out blank - as its own CompressedTextureFile does)
      if (!renderer?.supportsCompressedTexture?.('ASTC', textureData.internalFormat)) {
        this.fallBack();
        return;
      }
      textureData.format = renderer.getCompressedTextureName('ASTC', textureData.internalFormat);
      const texture = this.cache.addCompressedTexture(this.key, textureData);
      if (texture) finishGpuTexture(renderer, texture, this.data);
      else this.fallBack();
    }
  }

  Loader.FileTypesManager.register('image', function image(key, url, xhrSettings) {
    // (a failed copy - a missing file, a bad decode - falls back to the WebP for good)
    if (typeof key === 'string' && typeof url === 'string' && !gpuTextureFailures.has(key)
      && gpuTexturesEnabled(this.systems?.game?.renderer)) {
      const compressed = getGpuTextureUrl(url);
      if (compressed) {
        this.addFile(new GpuTextureFile(this, key, compressed, url));
        return this;
      }
    }
    return originalImage.call(this, key, url, xhrSettings);
  });
  Loader.LoaderPlugin.prototype.__hsGpuTextures = true;

  // The alpha mask answers for a compressed texture (by the same frame arithmetic as Phaser's).
  const originalGetPixelAlpha = TextureManager.prototype.getPixelAlpha;
  TextureManager.prototype.getPixelAlpha = function getPixelAlpha(x, y, key, frame) {
    const textureFrame = this.getFrame(key, frame);
    const source = textureFrame?.source;
    if (!source?.compressionAlgorithm) return originalGetPixelAlpha.call(this, x, y, key, frame);
    const mask = source.texture?.hsAlphaMask;
    if (!mask) return null;
    const cut = textureFrame.data.cut;
    const px = x - textureFrame.x + cut.x, py = y - textureFrame.y + cut.y;
    if (px < cut.x || px >= cut.r || py < cut.y || py >= cut.b) return null;
    const mx = Math.min(mask.w - 1, Math.floor(px / mask.scale)), my = Math.min(mask.h - 1, Math.floor(py / mask.scale));
    return mask.data[my * mask.w + mx];
  };
}

if (typeof globalThis.Phaser !== 'undefined') installGpuTextureCompression();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    gpuTexturesEnabled, getGpuTextureUrl, normalizeGpuTexturePath, readGpuTextureAlphaMask,
    parseGpuTexture, finishGpuTexture, isGpuCompressedTexture, installGpuTextureCompression, gpuTextureFailures,
  };
}
