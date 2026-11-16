(function (root) {
  'use strict';
  class WorldConstructionUi {
    constructor({ scene, adapter, construction, delta, session, simulation, message, restoreView = () => {} }) {
      Object.assign(this, { scene, adapter, construction, delta, session, simulation, message, restoreView });
      this.tool = 'browse'; this.start = null; this.draft = null; this.sequence = 0; this.busy = false;
      this.guide = scene.add.graphics().setDepth(900000);
      this.controls = document.getElementById('construction-controls');
      document.getElementById('build-tool').onchange = event => { this.tool = event.target.value; this.cancel(); };
      document.getElementById('confirm-build').onclick = () => this.confirm();
      document.getElementById('cancel-build').onclick = () => this.cancel();
      document.getElementById('world-save').onclick = () => this.run(async () => { await session.flush(); await this.updateSlots(); });
      document.getElementById('world-load').onclick = () => this.run(async () => { const value = await session.load(document.getElementById('world-slot').value || session.id); restoreView(value.snapshot); await this.updateSlots(); });
      document.getElementById('world-rollback').onclick = () => this.run(async () => { const value = await session.restoreBackup(); restoreView(value.snapshot); });
      document.getElementById('world-export').onclick = () => this.export();
      document.getElementById('world-import').onclick = () => document.getElementById('world-file').click();
      document.getElementById('world-file').onchange = event => this.run(async () => {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > root.HeungShingWorld.WorldSaveFormat.MAX_WORLD_SAVE_BYTES) throw new Error('備份超過 20 MiB。');
        const id = `world-${root.HeungShingWorld.worldUuid()}`, value = await session.importBackup(await file.text(), id);
        restoreView(value.snapshot); await this.updateSlots(); event.target.value = '';
      });
      this.unsubscribe = delta.subscribe(() => this.updateBudget()); this.updateBudget(); this.updateSlots().catch(error => message(error.message, true));
      window.addEventListener('beforeunload', event => { if (delta.dirty) { event.preventDefault(); event.returnValue = ''; } });
      window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); this.run(() => session.flush()); } });
    }
    updateBudget() { document.getElementById('world-budget').textContent = `$${this.delta.header.city.budget.toLocaleString()}`; document.getElementById('world-name').textContent = this.delta.header.city.name; }
    async updateSlots() {
      const rows = await this.session.list(), select = document.getElementById('world-slot'); select.replaceChildren();
      if (!rows.some(row => row.id === this.session.id)) rows.push({ id: this.session.id, city: this.delta.header.city });
      for (const row of rows) { const option = document.createElement('option'); option.value = row.id; option.textContent = `${row.city.name} · ${row.id.slice(-8)}`; option.selected = row.id === this.session.id; select.appendChild(option); }
      try { localStorage.setItem('heung-shing.world-trial.active', this.session.id); } catch {}
    }
    async run(action) {
      if (this.busy) return;
      this.busy = true; this.cancel(); this.controls.inert = true;
      try { return await action(); } catch (error) { this.message(error.message, true); }
      finally { this.busy = false; this.controls.inert = false; }
    }
    cancel() { this.sequence++; this.start = null; this.draft = null; this.guide.clear(); document.getElementById('build-draft').hidden = true; document.getElementById('confirm-build').disabled = false; document.getElementById('confirm-build').textContent = '確定建設'; }
    async tap(x, y) {
      if (this.tool === 'browse' || this.busy) return;
      if (!this.session.storage.writable) { this.message('另一個遊戲分頁正在寫入；請關閉該分頁後重新載入。', true); return; }
      const tapSequence = ++this.sequence;
      const point = mapCameraWorldPoint(this.scene.cameras.main, x, y);
      let tile = this.adapter.unproject(point.x, point.y + 40), cell = { col: Math.round(tile.col), row: Math.round(tile.row) };
      try {
        // Height-aware tile picking uses the same ground-centre/13px elevation convention.
        for (let level = 8; level >= 0; level--) {
          const test = this.adapter.unproject(point.x, point.y + 40 + level * 13), candidate = { col: Math.round(test.col), row: Math.round(test.row) };
          if (!this.construction.inside(candidate)) continue;
          const ground = await this.construction.data.getTile(candidate.col, candidate.row);
          if ((this.delta.entityAt(candidate.col, candidate.row)?.elevation ?? ground.height) === level) { cell = candidate; break; }
        }
        if (tapSequence !== this.sequence) return;
        await this.planAt(cell);
      } catch (error) { this.message(error.message, true); }
    }
    async planAt(cell) {
      const sequence = ++this.sequence, multi = ['road', 'bridge', 'rail', 'zoneR', 'zoneC', 'zoneI'].includes(this.tool);
      if (this.tool.startsWith('route-')) {
        const mode = this.tool.slice(6), node = this.simulation.network.nodeAt(mode, cell);
        if (!node) throw new Error(mode === 'road' ? '請點選道路或橋樑作班次端點。' : '請點選地面路軌作班次端點。');
        if (!this.start) {
          this.start = cell; this.draft = { cells: [{ ...cell, height: node.elevation }], operations: [] }; this.drawDraft(); this.draft = null;
          document.getElementById('build-draft').hidden = false; document.getElementById('confirm-build').disabled = true;
          document.getElementById('build-cost').textContent = '請點選班次終點'; return;
        }
        this.draft = this.simulation.planService(mode, this.start, cell); this.drawDraft();
        document.getElementById('confirm-build').disabled = false; document.getElementById('confirm-build').textContent = '新增班次';
        document.getElementById('build-cost').textContent = `${this.draft.cells.length} 格 · 來回行駛`; document.getElementById('build-draft').hidden = false; return;
      }
      if (this.tool === 'bridge' && !this.start) {
        const tile = await this.construction.data.getTile(cell.col, cell.row);
        if (sequence !== this.sequence || this.busy) return;
        if (!this.construction.inside(cell) || tile.terrainType === 5) throw new Error('請先點選橋樑起點嘅陸地，再選擇對岸終點。');
        this.start = cell; this.draft = { cells: [{ ...cell, height: tile.height }], operations: [] }; this.drawDraft(); this.draft = null;
        document.getElementById('build-draft').hidden = false; document.getElementById('confirm-build').disabled = true;
        document.getElementById('build-cost').textContent = '請點選橋樑對岸終點'; return;
      }
      const start = multi && this.start ? this.start : cell;
      const plan = await this.construction.plan(this.tool, start, cell);
      if (sequence !== this.sequence || this.busy) return;
      if (multi) this.start = start;
      this.draft = plan;
      document.getElementById('confirm-build').disabled = false;
      this.drawDraft();
      document.getElementById('build-draft').hidden = false;
      document.getElementById('build-cost').textContent = `${plan.cells.length} 格 · $${plan.cost.toLocaleString()}${multi ? ' · 再點一下可延伸' : ''}`;
    }
    drawDraft() {
      this.guide.clear().lineStyle(2, 0xffe28a, 1).fillStyle(0xffd25b, .2);
      const entity = this.draft?.operations.find(operation => operation.kind === 'entity')?.value;
      for (const cell of this.draft?.cells || []) {
        const point = this.adapter.project(cell.col, cell.row), y = point.y - 40 - (cell.height ?? entity?.elevation ?? 0) * 13;
        const polygon = [{ x: point.x, y: y - 25 }, { x: point.x + 50, y }, { x: point.x, y: y + 25 }, { x: point.x - 50, y }];
        this.guide.fillPoints(polygon, true); this.guide.strokePoints(polygon, true);
      }
    }
    confirm() {
      if (!this.draft || this.busy) return;
      try {
        if (this.draft.service) { this.simulation.confirmService(this.draft); this.cancel(); this.message('已新增班次；按「開始模擬」運行。'); return; }
        const model = root.HeungShingWorld.WORLD_BUILDINGS[this.draft.tool];
        if (model && !this.scene.textures.exists(model.texture)) throw new Error('建築圖像未能載入，請重新載入後再建設。');
        this.construction.confirm(this.draft); this.cancel(); this.message('建設完成；正在自動儲存。');
      } catch (error) { this.cancel(); this.message(error.message, true); }
    }
    export() {
      try {
        const blob = new Blob([this.session.exportBackup()], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `香城_世界建設備份_${new Date().toISOString().slice(0, 10)}.heungshing`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); this.message('完整世界備份已匯出，包含畫面外嘅建設。');
      } catch (error) { this.message(error.message, true); }
    }
    destroy() { this.unsubscribe(); this.guide.destroy(); }
  }
  Object.assign(root.HeungShingWorld ||= {}, { WorldConstructionUi });
})(globalThis);
