(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./world-save-format') : root.HeungShingWorld,
    typeof module !== 'undefined' && module.exports ? require('./world-simulation-format') : root.HeungShingWorld);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function (formatApi, format) {
  'use strict';
  const { WorldSaveFormat: f } = formatApi;
  const { WORLD_DAY_MS, WORLD_TILE_TRAVEL_MS, WORLD_STOP_MS, MAX_WORLD_TIME_MS, emptyWorldSimulation, servicePosition } = format;
  const money = n => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(n)));
  class WorldSimulation {
    constructor({ delta, network, now = () => Date.now(), writable = () => true, makeId = () => `service-${crypto.randomUUID()}` }) {
      Object.assign(this, { delta, network, now, writable, makeId }); this.regional = new Map(); this.metricRevision = -1; this.routeVersion = -1;
      this.lastTickAt = -Infinity; this.stats = { aggregateRebuilds: 0, dailyPasses: 0, batchedDays: 0 };
      this.unsubscribe = delta.subscribe(event => { if (event.all) { this.metricRevision = this.routeVersion = -1; this.lastTickAt = -Infinity; } });
    }
    ensureMetrics() {
      if (this.metricRevision === this.delta.constructionRevision) return;
      this.network.ensure(); this.regional = new Map(); const jobs = new Map(), homes = new Map();
      const region = id => { if (!this.regional.has(id)) this.regional.set(id, { chunkId: id, capacity: 0, targetPopulation: 0, jobs: 0, maintenance: 0, homes: new Map() }); return this.regional.get(id); };
      const job = (r, component, count) => { r.jobs += count; if (component !== null) jobs.set(component, (jobs.get(component) || 0) + count); };
      for (const chunk of this.delta.chunks.values()) {
        const r = region(chunk.id); r.maintenance += chunk.roads.size;
        for (const cell of chunk.zones.values()) {
          if (this.delta.entityAt(cell.col, cell.row) || this.delta.roadAt(cell.col, cell.row)) continue;
          const component = this.network.roadAccess([cell]);
          if (cell.type === 1) {
            const capacity = cell.density * 8; r.capacity += capacity;
            if (component !== null) { homes.set(component, (homes.get(component) || 0) + capacity); r.homes.set(component, (r.homes.get(component) || 0) + capacity); }
          } else job(r, component, cell.density * (cell.type === 2 ? 6 : 10));
        }
      }
      for (const entity of this.delta.entities.values()) {
        if (entity.kind === 'building') {
          const r = region(entity.ownerChunk); r.maintenance += entity.modelId === 'market2' ? 20 : 30;
          if (entity.modelId === 'market2') job(r, this.network.roadAccess(f.entityCells(entity)), 24);
        } else for (const cell of entity.cells) region(f.storageId(cell.col, cell.row)).maintenance += 2;
      }
      for (const r of this.regional.values()) for (const [component, capacity] of r.homes)
        r.targetPopulation += Math.floor(capacity * Math.min(1, (jobs.get(component) || 0) * 2 / homes.get(component)));
      this.metricRevision = this.delta.constructionRevision; this.stats.aggregateRebuilds++;
    }
    refreshServices(simulation) {
      this.network.ensure(); if (this.routeVersion === this.network.version) return false;
      this.routeVersion = this.network.version; let changed = false;
      for (const service of simulation.services) {
        let path = null; try { path = this.network.findRoute(service.mode, service.from, service.to); } catch {}
        const status = path && path.length > 1 ? 'active' : 'blocked'; if (status === 'blocked') path = [];
        if (service.status !== status || JSON.stringify(service.path) !== JSON.stringify(path)) {
          service.status = status; service.path = path; service.progressMs = 0; changed = true;
        }
      }
      return changed;
    }
    applyTime(simulation, milliseconds, budget) {
      this.ensureMetrics();
      const amount = Math.min(MAX_WORLD_TIME_MS - simulation.elapsedMs, Math.max(0, Math.round(milliseconds)));
      const days = Math.floor((simulation.elapsedMs + amount) / WORLD_DAY_MS) - Math.floor(simulation.elapsedMs / WORLD_DAY_MS);
      simulation.elapsedMs += amount;
      for (const service of simulation.services) if (service.status === 'active') {
        const leg = (service.path.length - 1) * WORLD_TILE_TRAVEL_MS[service.mode] + WORLD_STOP_MS;
        service.completedLegs = money(service.completedLegs + Math.floor((service.progressMs + amount + WORLD_STOP_MS) / leg) - Math.floor((service.progressMs + WORLD_STOP_MS) / leg));
        service.progressMs = (service.progressMs + amount) % (leg * 2);
      }
      if (!days) return budget;
      const populations = new Map(simulation.regions.map(value => [value.chunkId, { ...value }]));
      for (const id of this.regional.keys()) if (!populations.has(id)) populations.set(id, { chunkId: id, population: 0 });
      const expense = [...this.regional.values()].reduce((sum, r) => sum + r.maintenance, 0);
      const settle = (income, count) => {
        const net = (income - expense) * count;
        simulation.ledger.income = money(simulation.ledger.income + income * count);
        simulation.ledger.expense = money(simulation.ledger.expense + expense * count);
        simulation.ledger.unpaid = money(simulation.ledger.unpaid + Math.max(0, -budget - net)); budget = money(budget + net);
        simulation.lastDay = { income, expense };
      };
      // Growth converges in bounded passes; once stable, even years of elapsed time cost
      // one aggregate settlement. No tile loops and no per-day offline catch-up queue.
      for (let day = 0; day < days; day++) {
        let changed = false, total = 0;
        for (const [id, r] of populations) {
          const metric = this.regional.get(id), target = metric?.targetPopulation || 0;
          const growth = Math.max(4, Math.ceil(Math.max(metric?.capacity || 0, r.population) / 20));
          const next = r.population < target ? Math.min(target, r.population + growth) : Math.max(target, r.population - growth);
          changed ||= next !== r.population; r.population = next; total += next;
        }
        this.stats.dailyPasses++; settle(total * 2, 1);
        if (!changed) { const remaining = days - day - 1; settle(total * 2, remaining); this.stats.batchedDays += remaining; break; }
      }
      simulation.regions = [...populations.values()].filter(r => r.population || this.regional.has(r.chunkId)).sort((a, b) => a.chunkId.localeCompare(b.chunkId));
      return budget;
    }
    tick(wall = this.now(), force = false) {
      if (!this.writable() || !this.delta.header.simulation) return;
      if (!force && wall >= this.lastTickAt && wall - this.lastTickAt < 1000) return;
      this.lastTickAt = wall;
      const simulation = f.clone(this.delta.header.simulation), routesChanged = this.refreshServices(simulation);
      const elapsed = simulation.paused ? 0 : Math.max(0, wall - simulation.lastWallMs) * simulation.speed;
      if (!elapsed && !routesChanged) return;
      const budget = this.applyTime(simulation, elapsed, this.delta.header.city.budget); simulation.lastWallMs = Math.max(wall, simulation.lastWallMs);
      this.delta.commitSimulation(simulation, budget, { routesChanged });
    }
    edit(action, { routesChanged = false } = {}) {
      f.check(this.writable(), '另一個遊戲分頁正在寫入；請關閉該分頁後重新載入。');
      this.tick(this.now(), true);
      const simulation = f.clone(this.delta.header.simulation || emptyWorldSimulation(this.now()));
      const budget = action(simulation, this.delta.header.city.budget); simulation.lastWallMs = Math.max(simulation.lastWallMs, this.now());
      this.delta.commitSimulation(simulation, budget ?? this.delta.header.city.budget, { routesChanged });
    }
    setPaused(paused) { this.edit(simulation => { simulation.paused = !!paused; }); }
    setSpeed(speed) { f.check([1, 4, 16].includes(speed), '無效模擬速度。'); this.edit(simulation => { simulation.speed = speed; }); }
    advance(milliseconds) {
      f.check(Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= MAX_WORLD_TIME_MS, '無效推進時間。');
      this.edit((simulation, budget) => { this.refreshServices(simulation); return this.applyTime(simulation, milliseconds, budget); }, { routesChanged: true });
    }
    planService(mode, from, to) {
      f.check(this.writable(), '此分頁目前只可瀏覽。');
      const path = this.network.findRoute(mode, from, to); f.check(path && path.length > 1, '兩點之間未有連通路線，請先鋪路。');
      return { tool: `route-${mode}`, revision: this.delta.constructionRevision, cost: 0, cells: path.map(cell => ({ ...cell, height: cell.elevation })), operations: [],
        service: { id: this.makeId(), name: mode === 'road' ? '巴士班次' : '列車班次', mode, from: { ...from }, to: { ...to }, path, status: 'active', progressMs: 0, completedLegs: 0 } };
    }
    confirmService(plan) {
      f.check(plan?.revision === this.delta.constructionRevision && plan.service, '路網已有新修改，請重新選擇。');
      this.edit(simulation => { f.check(simulation.services.length < 64, '班次數目已達 64。'); simulation.services.push(f.clone(plan.service)); }, { routesChanged: true });
    }
    removeService(id) { this.edit(simulation => { simulation.services = simulation.services.filter(service => service.id !== id); }, { routesChanged: true }); }
    positions(wall = this.now()) {
      const simulation = this.delta.header.simulation; if (!simulation) return [];
      const extra = simulation.paused || !this.writable() ? 0 : Math.min(1000 * simulation.speed, Math.max(0, wall - simulation.lastWallMs) * simulation.speed);
      return simulation.services.map(service => ({ id: service.id, mode: service.mode, position: servicePosition(service, extra) })).filter(entry => entry.position);
    }
    snapshot() {
      this.ensureMetrics(); const simulation = this.delta.header.simulation, regions = simulation?.regions || [], populationByRegion = new Map(regions.map(r => [r.chunkId, r.population]));
      return { elapsedMs: simulation?.elapsedMs || 0, day: Math.floor((simulation?.elapsedMs || 0) / WORLD_DAY_MS) + 1,
        paused: simulation?.paused ?? true, speed: simulation?.speed || 1, population: regions.reduce((sum, r) => sum + r.population, 0),
        jobs: [...this.regional.values()].reduce((sum, r) => sum + r.jobs, 0), capacity: [...this.regional.values()].reduce((sum, r) => sum + r.capacity, 0),
        lastDay: simulation?.lastDay || { income: 0, expense: 0 }, ledger: simulation?.ledger || { income: 0, expense: 0, unpaid: 0 },
        regions: [...this.regional.values()].map(({ homes, ...r }) => ({ ...r, population: populationByRegion.get(r.chunkId) || 0 })),
        services: simulation?.services || [], network: this.network.snapshot(), stats: { ...this.stats } };
    }
    destroy() { this.unsubscribe(); }
  }
  return { WorldSimulation };
});
