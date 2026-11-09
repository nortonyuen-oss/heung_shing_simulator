// Portable cities contain game state, never credentials or local slot identities.
(function (root) {
  'use strict';
  const FORMAT = 'heung-shing-city-save';
  const MAX_BYTES = 20 * 1024 * 1024;
  function fail(message) { throw new Error(message); }
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function validate(payload, decode, width, height) {
    if (!object(payload) || !object(payload.save_data) || !object(payload.save_data.city)) fail('Invalid city data');
    if (![14, 15].includes(payload.save_data.version)) fail('This save format is not supported. Use a compatible game version.');
    const data = decode(payload.save_data);
    for (const name of ['mapData', 'heightMap', 'bridgeMap', 'roadUnderlayMap', 'zoneMap', 'zoneDensityMap', 'treeMap']) {
      if (!Array.isArray(data[name]) || data[name].length !== height
        || data[name].some(row => !Array.isArray(row) || row.length !== width)) fail(`Invalid ${name} dimensions`);
    }
    if (!object(data.buildingData) || Object.keys(data.buildingData).length > width * height) fail('Invalid buildings');
    for (const key of Object.keys(data.buildingData)) {
      const match = key.match(/^(\d+):(\d+)$/);
      if (!match || +match[1] >= height || +match[2] >= width) fail('Invalid building location');
      const record = data.buildingData[key];
      if (!object(record) || typeof record.type !== 'string' || record.type.length > 80) fail('Invalid building record');
      for (const field of ['footprintCols', 'footprintRows']) {
        if (record[field] !== undefined && (!Number.isInteger(record[field]) || record[field] < 1 || record[field] > Math.max(width, height))) fail('Invalid building footprint');
      }
      for (const field of ['spriteKey', 'assetId', 'sourceFileName']) {
        if (record[field] !== undefined && record[field] !== null && (typeof record[field] !== 'string' || record[field].length > 512)) fail('Invalid building identity');
      }
    }
    for (const name of ['powerSources', 'powerLineSet', 'lowDensityLockSet']) {
      if (!Array.isArray(data[name]) || data[name].length > width * height) fail(`Invalid ${name}`);
      for (const id of data[name]) {
        const match = typeof id === 'string' && id.match(/^(\d+):(\d+)$/);
        if (!match || +match[1] >= height || +match[2] >= width) fail(`Invalid ${name} location`);
      }
    }
    for (const name of ['population', 'year', 'month', 'budget']) {
      if (!Number.isFinite(payload[name])) fail(`Invalid ${name}`);
    }
    if (!Number.isInteger(payload.month) || payload.month < 1 || payload.month > 12
      || !Number.isInteger(payload.year) || payload.year < 1 || payload.year > 999999
      || payload.population < 0 || typeof payload.city_name !== 'string' || payload.city_name.length > 120) fail('Invalid city metadata');
    return payload;
  }
  function make(payload, gameVersion) {
    const clean = JSON.parse(JSON.stringify(payload));
    delete clean.save_data.autosave;
    return { format: FORMAT, formatVersion: 1, gameVersion, saveDataVersion: clean.save_data.version,
      exportedAt: new Date().toISOString(), payload: clean };
  }
  function parse(text, decode, width, height) {
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('Save exceeds the 20 MiB limit');
    const envelope = JSON.parse(text, (key, value) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Invalid save property');
      return value;
    });
    if (!object(envelope) || envelope.format !== FORMAT || envelope.formatVersion !== 1) fail('Not a supported .heungshing file');
    if (envelope.saveDataVersion !== envelope.payload?.save_data?.version) fail('Save version mismatch');
    validate(envelope.payload, decode, width, height);
    delete envelope.payload.save_data.autosave;
    return envelope;
  }
  function filename(name) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `香城_${String(name || 'My City').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 60)}_${stamp}.heungshing`;
  }
  function download(envelope) {
    const text = JSON.stringify(envelope);
    const blob = new Blob([text], { type: 'application/json' });
    if (blob.size > MAX_BYTES) fail('Save exceeds the 20 MiB limit');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename(envelope.payload.city_name);
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  root.HeungShingPortableSave = { make, parse, validate, download, filename, MAX_BYTES };
  if (typeof module !== 'undefined') module.exports = root.HeungShingPortableSave;
})(globalThis);
