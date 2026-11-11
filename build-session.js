// A draft owns its tool/options/tiles. Only confirm() may call the city-writing adapter.
// No pointer event is a transaction, and a consumed id can never be submitted twice.
function touchNudgeDelta(direction, rotation = 0) {
  const directions = { nw: [0, -1], ne: [-1, 0], se: [0, 1], sw: [1, 0] };
  let [dr, dc] = directions[direction] || [0, 0];
  for (let turn = 0; turn < ((rotation % 4) + 4) % 4; turn++) [dr, dc] = [-dc, dr];
  return { dr: dr || 0, dc: dc || 0 };
}

function createBuildSession(adapter, { onChange = () => {} } = {}) {
  let sequence = 0;
  let draft = null;
  let busy = false;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const publish = () => { onChange(getState()); return getState(); };
  function getState() { return draft ? copy(draft) : null; }
  function refresh() {
    if (draft && !busy) draft.plan = adapter.preview(copy(draft));
    return publish();
  }
  function begin(tool, options = {}, owner = null) {
    if (busy) return getState();
    draft = { id: ++sequence, owner, tool, options: copy(options), start: null, end: null, activeEnd: 'start', ready: false, plan: null };
    return publish();
  }
  function select(tile, range = false) {
    if (!draft || busy || !Number.isInteger(tile?.row) || !Number.isInteger(tile?.col)) return getState();
    if (!draft.start || !range) {
      draft.start = { row: tile.row, col: tile.col };
      draft.end = { ...draft.start };
      draft.activeEnd = range ? 'end' : 'start';
      draft.ready = !range;
    } else {
      draft[draft.activeEnd] = { row: tile.row, col: tile.col };
      draft.ready = true;
    }
    return refresh();
  }
  function setOptions(options) {
    if (!draft || busy) return getState();
    Object.assign(draft.options, copy(options));
    return refresh();
  }
  function setActiveEnd(end) {
    if (draft && !busy && ['start', 'end'].includes(end)) draft.activeEnd = end;
    return publish();
  }
  function nudge(dr, dc) {
    if (!draft?.start || busy) return getState();
    const key = draft.activeEnd;
    const tile = draft[key];
    draft[key] = { row: tile.row + dr, col: tile.col + dc };
    if (draft.tool !== 'road' && !draft.tool.startsWith('zone-') && !(draft.tool === 'bulldoze' && draft.options.range)) draft.end = { ...draft.start };
    return refresh();
  }
  function cancel() {
    if (busy) return false;
    draft = null;
    publish();
    return true;
  }
  function confirm(id, owner = null) {
    if (busy || !draft || draft.id !== id || draft.owner !== owner || !draft.ready) return { ok: false, reason: 'stale' };
    busy = true;
    try {
      const candidate = copy(draft);
      const plan = adapter.preview(candidate); // funds, unlocks, occupation and costs are live
      if (!plan.ok) {
        draft.plan = plan;
        return { ok: false, reason: plan.reason || 'blocked' };
      }
      // A changed demolition/placement must be shown again before it can be approved.
      if (!candidate.plan || plan.signature !== candidate.plan.signature) {
        draft.plan = plan;
        return { ok: false, reason: 'changed' };
      }
      draft = null; // consume BEFORE writing: also protects against re-entrant double taps
      return adapter.commit(candidate, plan);
    } finally {
      busy = false;
      publish();
    }
  }
  return { begin, select, setOptions, setActiveEnd, nudge, refresh, cancel, confirm, getState };
}
