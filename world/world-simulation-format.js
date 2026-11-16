(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-config') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (config) {
  'use strict';
  const { WORLD, chunkBounds, parseChunkId } = config;
  const WORLD_DAY_MS = 60000, WORLD_TILE_TRAVEL_MS = Object.freeze({ road: 2500, rail: 1250 }), WORLD_STOP_MS = 2000, MAX_WORLD_TIME_MS = 1e12;
  const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
  function emptyWorldSimulation(now = Date.now()) {
    return { version: 1, elapsedMs: 0, lastWallMs: now, paused: true, speed: 1, regions: [], services: [],
      ledger: { income: 0, expense: 0, unpaid: 0 }, lastDay: { income: 0, expense: 0 } };
  }
  function validateWorldSimulation(value, world = WORLD, check = (ok, message) => { if (!ok) throw new Error(message); }) {
    check(value?.version === 1 && integer(value.elapsedMs, 0, MAX_WORLD_TIME_MS) && integer(value.lastWallMs)
      && typeof value.paused === 'boolean' && [1, 4, 16].includes(value.speed), 'Invalid world simulation clock');
    check(value.ledger && ['income', 'expense', 'unpaid'].every(key => integer(value.ledger[key]))
      && value.lastDay && ['income', 'expense'].every(key => integer(value.lastDay[key])), 'Invalid world simulation finances');
    check(Array.isArray(value.regions) && value.regions.length <= Math.ceil(world.width / 64) * Math.ceil(world.height / 64)
      && Array.isArray(value.services) && value.services.length <= 64, 'Invalid world simulation records');
    const regions = new Set(), services = new Set(), point = cell => cell && integer(cell.col, 0, world.width - 1) && integer(cell.row, 0, world.height - 1);
    for (const region of value.regions) {
      check(typeof region?.chunkId === 'string' && /^s:\d+:\d+$/.test(region.chunkId), 'Invalid simulation region ID');
      const pos = parseChunkId(region.chunkId, 's'), bounds = chunkBounds(world, 's', pos.x, pos.y);
      check(bounds && bounds.id === region.chunkId && !regions.has(region.chunkId) && integer(region.population, 0, bounds.width * bounds.height * 24), 'Invalid regional population'); regions.add(region.chunkId);
    }
    for (const service of value.services) {
      check(typeof service?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(service.id) && !services.has(service.id)
        && typeof service.name === 'string' && service.name.length <= 64 && ['road', 'rail'].includes(service.mode)
        && point(service.from) && point(service.to) && (service.from.col !== service.to.col || service.from.row !== service.to.row), 'Invalid transport service'); services.add(service.id);
      check(['active', 'blocked'].includes(service.status) && integer(service.progressMs, 0, MAX_WORLD_TIME_MS)
        && integer(service.completedLegs) && Array.isArray(service.path) && service.path.length <= 8192, 'Invalid transport progress');
      if (service.status === 'blocked') check(service.path.length === 0, 'Blocked service has a path');
      else {
        check(service.path.length >= 2, 'Invalid service path'); const seen = new Set();
        for (let i = 0; i < service.path.length; i++) {
          const cell = service.path[i], previous = service.path[i - 1], key = `${cell?.row}:${cell?.col}`;
          check(point(cell) && integer(cell.elevation, 0, 8) && !seen.has(key), 'Invalid service path cell'); seen.add(key);
          if (previous) check(Math.abs(previous.col - cell.col) + Math.abs(previous.row - cell.row) === 1, 'Disconnected service path');
        }
        check(service.path[0].col === service.from.col && service.path[0].row === service.from.row
          && service.path.at(-1).col === service.to.col && service.path.at(-1).row === service.to.row, 'Invalid service endpoints');
        check(service.progressMs < 2 * ((service.path.length - 1) * WORLD_TILE_TRAVEL_MS[service.mode] + WORLD_STOP_MS), 'Invalid service cycle');
      }
    }
    return value;
  }
  function servicePosition(service, extraMs = 0) {
    if (service.status !== 'active' || service.path.length < 2) return null;
    const tileMs = WORLD_TILE_TRAVEL_MS[service.mode], travel = (service.path.length - 1) * tileMs, leg = travel + WORLD_STOP_MS;
    const phase = (service.progressMs + Math.max(0, extraMs)) % (leg * 2), backward = phase >= leg;
    const fraction = Math.min(travel, backward ? phase - leg : phase) / tileMs;
    const distance = backward ? service.path.length - 1 - fraction : fraction;
    const i = Math.min(service.path.length - 2, Math.floor(distance)), mix = distance - i, a = service.path[i], b = service.path[i + 1];
    return { col: a.col + (b.col - a.col) * mix, row: a.row + (b.row - a.row) * mix,
      elevation: a.elevation + (b.elevation - a.elevation) * mix, nextCol: backward ? a.col : b.col, nextRow: backward ? a.row : b.row };
  }
  return { WORLD_DAY_MS, WORLD_TILE_TRAVEL_MS, WORLD_STOP_MS, MAX_WORLD_TIME_MS, emptyWorldSimulation, validateWorldSimulation, servicePosition };
});
