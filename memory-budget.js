// Memory budgets (Norton 2026-11-28: 手機瀏覽器玩一陣就閃退 - 運作時耗用的資源全部壓到500MB以下).
//
// A phone browser kills a tab that holds too much; a big city at night held ~900 MB of textures (545
// of them building night art, every model in four night variants, never let go) and a 懸索橋 ~80 more.
// The game's own share - its textures and its JavaScript heap - is kept within these budgets, and
// scripts/check-memory-budget.js measures it before every release (docs/release-update-checklist.md).
//
// Three profiles: 'low' - a phone or tablet in a browser (or a device that says it has 4 GB or less);
// 'web' - a computer's browser; 'desktop' - the Electron app.

const MEMORY_BUDGET_MB = Object.freeze({
  // the release check's limits, for the game's own use on a phone (a big city, a 懸索橋, day and night)
  // (a big city's day art alone - its buildings, landmarks, roads and props - is ~280 MB, so the
  // textures' share is the bigger one)
  check: Object.freeze({ textures: 420, heap: 150, total: 500 }),
  // building night art kept loaded (beyond what is on screen now) / zone building art
  nightTextures: Object.freeze({ low: 64, web: 192, desktop: 640 }),
  zoneTextures: Object.freeze({ low: 112, web: 160, desktop: 192 }),
});

let memoryProfileCache = null;

function getMemoryProfile() {
  if (memoryProfileCache) return memoryProfileCache;
  const config = globalThis.HEUNG_SHING_CONFIG;
  if (config?.platform !== 'web') return (memoryProfileCache = 'desktop');
  let low = false;
  try {
    const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(globalThis.navigator?.userAgent || '')
      || globalThis.navigator?.userAgentData?.mobile === true;
    const memory = Number(globalThis.navigator?.deviceMemory);
    low = coarse || mobileUa || (Number.isFinite(memory) && memory > 0 && memory <= 4);
  } catch {
    low = false;
  }
  return (memoryProfileCache = low ? 'low' : 'web');
}

function getMemoryBudgetBytes(kind) {
  const table = MEMORY_BUDGET_MB[kind];
  if (!table) return Infinity;
  return (table[getMemoryProfile()] ?? table.desktop) * 1024 * 1024;
}

// The bytes a texture holds on the GPU: four a pixel, a third more with its mip chain (power-of-two
// sizes only - Phaser builds mipmaps for those).
function estimateTextureBytes(texture) {
  let bytes = 0;
  (texture?.source || []).forEach((source) => {
    // (the picture held, not the size it is drawn at: a phone's night art is held at half size)
    const w = Number(source?.image?.width || source?.width) || 0, h = Number(source?.image?.height || source?.height) || 0;
    const pot = (v) => v > 0 && (v & (v - 1)) === 0;
    bytes += w * h * 4 * (pot(w) && pot(h) ? 4 / 3 : 1);
  });
  return bytes;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MEMORY_BUDGET_MB, getMemoryProfile, getMemoryBudgetBytes, estimateTextureBytes };
}
