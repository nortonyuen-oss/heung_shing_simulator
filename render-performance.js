// Render performance: workarounds for Phaser 3.60's costs in a dense city - the vertex
// upload shim for ANGLE-over-Metal, the adaptive display-list depth sort, and the atlas that
// lets roadside props batch together. See docs/performance-notes.md. Split out of main.js.

// Phaser 3.60 uploads every render batch with gl.bufferSubData into the one vertex buffer it
// owns. On Chromium's ANGLE-over-Metal (every Mac) that write lands on a buffer the GPU is
// still reading, so the driver stalls the GPU process until the previous draw has finished:
// ~150 uploads a frame in a dense city cost ~0.35ms each, and 旺角 sat at 14 fps with the
// JavaScript side idle. Replacing that upload with gl.bufferData (a fresh, driver-streamed
// allocation of just the used bytes) measured 14 -> 59 fps on an Intel Iris Plus 655 with the
// same scene, so the shim rewrites exactly that call: ARRAY_BUFFER, offset 0, a typed-array
// view. Phaser's only other partial upload (GameObjects.Shader) has the same shape and is
// equally happy. Installed once per WebGL context, before the first frame renders.
function installVertexUploadShim(renderer) {
  const gl = renderer?.gl;
  if (!gl || gl.__vertexUploadShim || typeof gl.bufferSubData !== 'function') return false;
  const arrayBuffer = gl.ARRAY_BUFFER;
  const dynamicDraw = gl.DYNAMIC_DRAW;
  const original = gl.bufferSubData;
  gl.bufferSubData = function shimmedBufferSubData(target, offset, data, ...rest) {
    if (target === arrayBuffer && offset === 0 && rest.length === 0 && ArrayBuffer.isView(data)) {
      return gl.bufferData(target, data, dynamicDraw);
    }
    return original.call(gl, target, offset, data, ...rest);
  };
  gl.__vertexUploadShim = true;
  return true;
}

// Phaser 3.60 re-sorts the scene's whole display list (a merge sort, StableSort) on the next
// render after ANY child's depth is set - even to the value it already had. Every object in
// the city lives in that one list (~10,600 on 太子), and moving vehicles and their lamps set
// their depth every frame, so the full sort ran every frame: 5.5 ms a frame on average at
// zoom 1, 127 ms at worst, more than Phaser's own render pass.
//
// Only ~100 objects actually change depth in a few seconds, so the sort now works on those
// alone. The depth setter of every class in the list is wrapped to record which objects
// changed (and to ignore a set to the same value), as is the list's add. At sort time the
// recorded objects are pulled out in one pass - the rest of the list is still sorted - and
// put back by binary search. Even a scan of the whole list is slow here: reading _depth off
// ~10,000 objects of a dozen classes is a megamorphic load each, ~3 ms a scan under load.
// Anything else (too many moved objects, a sort queued for a reason not seen) falls back to
// an insertion sort over the list, and past ADAPTIVE_DEPTH_SORT_MAX_DESCENTS out-of-order
// neighbours (a view rotation, a rebuild) to Phaser's own merge sort.
const ADAPTIVE_DEPTH_SORT_MAX_DESCENTS = 128;
const ADAPTIVE_DEPTH_SORT_MAX_MOVED = 256;
const ADAPTIVE_DEPTH_SORT_SEARCH_MOVED = 24;

// `items` is sorted by _depth except for the objects in `moved`: pull those out, then put each
// back after every object of a lower or equal depth. Objects of equal depth keep their order
// except that a moved one lands after the unmoved ones of its depth.
function reinsertMovedByDepth(items, moved) {
  let pulled;
  if (moved.size <= ADAPTIVE_DEPTH_SORT_SEARCH_MOVED) {
    // A handful (usually one or two objects a frame): find each with the native indexOf, which
    // compares references only - far cheaper than a JS pass over ~10,000 objects.
    const found = [];
    moved.forEach((item) => {
      const index = items.indexOf(item);
      if (index >= 0) found.push([item, index]);
    });
    found.sort((a, b) => b[1] - a[1]); // from the back, so the earlier indices stay valid
    found.forEach(([, index]) => items.splice(index, 1));
    pulled = found.reverse().map(([item]) => item); // back in their old order
  } else {
    pulled = [];
    let write = 0;
    for (let read = 0; read < items.length; read++) {
      const item = items[read];
      if (moved.has(item)) pulled.push(item);
      else items[write++] = item;
    }
    items.length = write;
  }
  if (pulled.length > 1) {
    const order = new Map(pulled.map((item, index) => [item, index]));
    pulled.sort((a, b) => (a._depth - b._depth) || (order.get(a) - order.get(b)));
  }
  for (const item of pulled) {
    const depth = item._depth;
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (items[mid]._depth <= depth) lo = mid + 1;
      else hi = mid;
    }
    items.splice(lo, 0, item);
  }
  return pulled.length;
}

// Sorts `items` by _depth in place, keeping the order of equal depths, and returns true - or
// returns false without touching them when they are too far from sorted for it to pay.
function sortNearlySortedByDepth(items, maxDescents = ADAPTIVE_DEPTH_SORT_MAX_DESCENTS) {
  const count = items.length;
  let descents = 0;
  for (let i = 1; i < count; i++) {
    if (items[i - 1]._depth > items[i]._depth && ++descents > maxDescents) return false;
  }
  if (descents === 0) return true;
  for (let i = 1; i < count; i++) {
    const item = items[i];
    const depth = item._depth;
    if (items[i - 1]._depth <= depth) continue;
    let j = i - 1;
    while (j >= 0 && items[j]._depth > depth) {
      items[j + 1] = items[j];
      j--;
    }
    items[j + 1] = item;
  }
  return true;
}

function installAdaptiveDepthSort(displayList) {
  if (!displayList || displayList.__adaptiveDepthSort || typeof displayList.depthSort !== 'function') return false;
  const fullSort = displayList.depthSort;
  const moved = new Set();
  const wrappedPrototypes = new WeakSet();
  let tracking = true; // false once a class's depth setter could not be wrapped
  displayList.__depthMoved = moved;

  // Wrap the depth setter of the class `gameObject` belongs to (once per class).
  const track = (gameObject) => {
    let proto = gameObject ? Object.getPrototypeOf(gameObject) : null;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'depth')) proto = Object.getPrototypeOf(proto);
    if (!proto || wrappedPrototypes.has(proto)) return;
    wrappedPrototypes.add(proto);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'depth');
    if (!descriptor || typeof descriptor.set !== 'function' || descriptor.configurable === false) {
      tracking = false;
      return;
    }
    Object.defineProperty(proto, 'depth', {
      ...descriptor,
      set(value) {
        if (value === this._depth) return; // Phaser would queue a full sort for this
        const list = this.displayList;
        if (list && list.__depthMoved) list.__depthMoved.add(this);
        descriptor.set.call(this, value);
      },
    });
  };
  displayList.list.forEach((item) => { track(item); moved.add(item); });
  ['add', 'addAt'].forEach((method) => {
    const original = displayList[method];
    if (typeof original !== 'function') return;
    displayList[method] = function trackedAdd(child, ...rest) {
      (Array.isArray(child) ? child : [child]).forEach((item) => {
        if (!item) return;
        track(item);
        moved.add(item);
      });
      return original.call(this, child, ...rest);
    };
  });

  displayList.depthSort = function adaptiveDepthSort() {
    if (!this.sortChildrenFlag) return;
    if (tracking && moved.size > 0 && moved.size <= ADAPTIVE_DEPTH_SORT_MAX_MOVED) {
      reinsertMovedByDepth(this.list, moved);
      moved.clear();
      this.sortChildrenFlag = false;
      return;
    }
    moved.clear();
    if (sortNearlySortedByDepth(this.list)) {
      this.sortChildrenFlag = false;
      return;
    }
    fullSort.call(this);
  };
  displayList.__adaptiveDepthSort = true;
  return true;
}

// Roadside props (furniture, railings, lamp posts, signal poles, bridge parapets, bus stops) are
// ~60 small textures scattered through the depth order among the buildings, and Phaser's batch
// breaks whenever it runs out of its 16 texture units: hiding them alone took a zoom-1 frame
// from 57 to 38 draw calls (62 -> 29 at zoom 1.5), each draw one more vertex upload - the cost
// the ANGLE/Metal shim above is about. Once they have loaded, they are copied into one atlas
// canvas and every prop key is rebuilt as a frame of it, so they share a single GPU texture
// and batch together. The keys stay: code keeps calling setTexture(key), and reads a prop's
// size off its base frame (texture.get()), never its source image. Keys must not be removed
// afterwards - their textures share the atlas source.
const PROP_ATLAS_KEY = '__street_prop_atlas';
const PROP_ATLAS_WIDTH = 2048;
const PROP_ATLAS_PADDING = 4; // transparent px around each frame, so mip levels do not bleed

function getStreetPropAtlasKeys() {
  const groups = [
    typeof STREET_FURNITURE_TEXTURE_FILES !== 'undefined' ? STREET_FURNITURE_TEXTURE_FILES : null,
    typeof PEDESTRIAN_RAILING_TEXTURE_FILES !== 'undefined' ? PEDESTRIAN_RAILING_TEXTURE_FILES : null,
    typeof STREET_LAMP_TEXTURE_FILES !== 'undefined' ? STREET_LAMP_TEXTURE_FILES : null,
    typeof TRAFFIC_SIGNAL_TEXTURE_FILES !== 'undefined' ? TRAFFIC_SIGNAL_TEXTURE_FILES : null,
    typeof BRIDGE_PARAPET_TEXTURE_FILES !== 'undefined' ? BRIDGE_PARAPET_TEXTURE_FILES : null,
  ];
  const keys = groups.flatMap((files) => (files ? Object.keys(files) : []));
  ['ul', 'ur', 'll', 'lr'].forEach((corner) => keys.push(`bus_stop_${corner}`));
  return keys;
}

// Shelf-packs rectangles (tallest first) into a fixed width; returns positions and the
// power-of-two height the atlas needs, or null if one does not fit the width.
function layoutPropAtlas(items, width = PROP_ATLAS_WIDTH, padding = PROP_ATLAS_PADDING) {
  const order = [...items].sort((a, b) => (b.height - a.height) || (b.width - a.width));
  const placed = new Map();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of order) {
    const w = item.width + padding * 2;
    const h = item.height + padding * 2;
    if (w > width) return null;
    if (x + w > width) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    placed.set(item.key, { x: x + padding, y: y + padding });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  const used = y + rowHeight;
  let height = 1;
  while (height < used) height *= 2;
  return { placed, width, height };
}

function packStreetPropTextures(scene) {
  const manager = scene?.textures;
  if (!manager || manager.exists(PROP_ATLAS_KEY) || typeof document === 'undefined'
    || typeof Phaser === 'undefined' || !Phaser.Textures?.Texture) return 0;
  const items = [];
  getStreetPropAtlasKeys().forEach((key) => {
    if (!manager.exists(key)) return;
    const texture = manager.get(key);
    // Only plain single-image textures: one source, just the base frame.
    if (texture.source?.length !== 1 || texture.frameTotal > 1) return;
    const image = texture.getSourceImage?.();
    if (!image?.width || !image?.height) return;
    items.push({ key, image, width: image.width, height: image.height });
  });
  if (items.length < 2) return 0;
  const layout = layoutPropAtlas(items);
  const maxSize = scene.game?.renderer?.gl?.getParameter?.(scene.game.renderer.gl.MAX_TEXTURE_SIZE) || 4096;
  if (!layout || layout.height > maxSize) return 0;
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  items.forEach((item) => {
    const at = layout.placed.get(item.key);
    context.drawImage(item.image, at.x, at.y);
  });
  const atlas = manager.addCanvas(PROP_ATLAS_KEY, canvas);
  const sharedSource = atlas?.source?.[0];
  if (!sharedSource) return 0;
  items.forEach((item) => {
    const at = layout.placed.get(item.key);
    manager.remove(item.key); // frees the prop's own GPU texture
    const texture = new Phaser.Textures.Texture(manager, item.key, []);
    texture.source.push(sharedSource);
    texture.add('__BASE', 0, at.x, at.y, item.width, item.height);
    manager.list[item.key] = texture;
  });
  return items.length;
}
