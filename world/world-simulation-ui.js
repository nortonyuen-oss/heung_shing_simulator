(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.HeungShingWorld ||= {}, api);
})(globalThis, function () {
  'use strict';
  class WorldTrafficRenderer {
    constructor({ scene, adapter, simulation }) { Object.assign(this, { scene, adapter, simulation }); this.objects = new Map(); this.destroyed = 0; }
    sync(activeIds) {
      const active = new Set(activeIds), wanted = new Set();
      for (const entry of this.simulation.positions()) {
        const p = entry.position;
        if (!active.has(`r:${Math.floor(Math.round(p.col) / 32)}:${Math.floor(Math.round(p.row) / 32)}`)) continue;
        wanted.add(entry.id); let object = this.objects.get(entry.id);
        if (!object) { object = this.scene.add.rectangle(0, 0, entry.mode === 'road' ? 18 : 26, 9, entry.mode === 'road' ? 0xf2cd71 : 0xd4b3ad).setStrokeStyle(1, 0x26342f); this.objects.set(entry.id, object); }
        const point = this.adapter.project(p.col, p.row), next = this.adapter.project(p.nextCol, p.nextRow);
        object.setPosition(point.x, point.y - 40 - p.elevation * 13).setDepth(point.y - p.elevation * 13 + 10).setRotation(Math.atan2(next.y - point.y, next.x - point.x));
      }
      for (const [id, object] of this.objects) if (!wanted.has(id)) { object.destroy(); this.objects.delete(id); this.destroyed++; }
    }
    snapshot() { return { vehicles: this.objects.size, destroyed: this.destroyed }; }
    destroy() { this.objects.forEach(object => object.destroy()); this.objects.clear(); }
  }
  class WorldSimulationUi {
    constructor({ simulation, navigate, message }) {
      Object.assign(this, { simulation, navigate, message }); this.abort = new AbortController(); this.serviceKey = '';
      const bind = (id, name, action) => document.getElementById(id).addEventListener(name, () => {
        try { action(); this.update(); } catch (error) { message(error.message, true); }
      }, { signal: this.abort.signal });
      bind('simulation-toggle', 'click', () => simulation.setPaused(!simulation.snapshot().paused));
      bind('simulation-speed', 'change', () => simulation.setSpeed(Number(document.getElementById('simulation-speed').value)));
      bind('simulation-step', 'click', () => simulation.advance(60000));
      bind('service-remove', 'click', () => simulation.removeService(document.getElementById('world-service').value));
      bind('service-follow', 'click', () => {
        const id = document.getElementById('world-service').value, entry = simulation.positions().find(entry => entry.id === id);
        if (entry) navigate(entry.position.col, entry.position.row); else message('班次路線中斷，請先修復路網。', true);
      });
      if (matchMedia('(max-width: 700px)').matches) document.querySelector('#world-simulation details').open = false;
      this.update();
    }
    update() {
      const s = this.simulation.snapshot(), cash = value => `$${value.toLocaleString()}`, writable = this.simulation.writable();
      document.getElementById('simulation-toggle').textContent = s.paused ? '開始模擬' : '暫停';
      document.getElementById('simulation-speed').value = String(s.speed);
      document.getElementById('simulation-summary').textContent = `第 ${s.day} 日 · ${s.population.toLocaleString()} 人 · ${s.services.length} 班次${!writable ? ' · 只可瀏覽' : s.paused ? ' · 暫停' : ''}`;
      document.getElementById('simulation-stats').textContent = `住宅容量 ${s.capacity.toLocaleString()} · 職位 ${s.jobs.toLocaleString()}\n上日稅收 ${cash(s.lastDay.income)} · 維護 ${cash(s.lastDay.expense)}\n收支 ${cash(s.lastDay.income - s.lastDay.expense)} · 累計未支付 ${cash(s.ledger.unpaid)}`;
      const key = s.services.map(service => `${service.id}:${service.status}`).join('|'), select = document.getElementById('world-service');
      if (key !== this.serviceKey) {
        this.serviceKey = key; const selected = select.value; select.replaceChildren();
        for (const service of s.services) {
          const option = document.createElement('option'); option.value = service.id;
          option.textContent = `${service.name} (${service.from.col},${service.from.row}) → (${service.to.col},${service.to.row})${service.status === 'blocked' ? ' · 中斷' : ''}`; select.appendChild(option);
        }
        if ([...select.options].some(option => option.value === selected)) select.value = selected;
      }
      document.getElementById('service-progress').textContent = s.services.length ? `已完成 ${s.services.reduce((sum, service) => sum + service.completedLegs, 0)} 程` : '從建設工具選「巴士／列車班次」，點選路網起點及終點。';
      if (!writable) document.getElementById('service-progress').textContent = '另一個遊戲分頁正在寫入；關閉該分頁後重新載入即可操作。';
      for (const id of ['simulation-toggle', 'simulation-speed', 'simulation-step', 'service-remove']) document.getElementById(id).disabled = !writable;
      for (const id of ['world-service', 'service-follow']) document.getElementById(id).disabled = !s.services.length;
      document.getElementById('service-remove').disabled = !writable || !s.services.length;
    }
    destroy() { this.abort.abort(); }
  }
  return { WorldTrafficRenderer, WorldSimulationUi };
});
