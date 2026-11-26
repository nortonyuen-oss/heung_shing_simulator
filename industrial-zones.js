'use strict';

// Science-park land is a specialization of industrial zoning, like housing types on RES.
// Ordinary industry keeps its existing education-driven conversion path.
function normalizeIndustrialType(value) {
  return value === 'science' ? 'science' : 'regular';
}

function normalizeIndustrialZones(raw, width = Infinity, height = Infinity) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, code] of Object.entries(raw)) {
    const match = /^(\d+):(\d+)$/.exec(id);
    if (match && +match[1] < height && +match[2] < width && code === 1) out[id] = 1;
  }
  return out;
}

function getIndustrialZoneType(row, col) {
  return zoneMap[row]?.[col] === ZONE_IND && city.industrialZones?.[`${row}:${col}`] === 1 ? 'science' : 'regular';
}

function setIndustrialZoneType(row, col, type) {
  if (!city.industrialZones || typeof city.industrialZones !== 'object' || Array.isArray(city.industrialZones)) city.industrialZones = {};
  if (normalizeIndustrialType(type) === 'science') city.industrialZones[`${row}:${col}`] = 1;
  else delete city.industrialZones[`${row}:${col}`];
}

function getSelectedIndustrialType() {
  return normalizeIndustrialType(typeof selectedIndustrialType !== 'undefined' ? selectedIndustrialType : 'regular');
}

function getIndustrialGrowthDemand(row, col, record = null) {
  const science = getIndustrialZoneType(row, col) === 'science'
    || (typeof isScienceParkIndustrialRecord === 'function' && isScienceParkIndustrialRecord(record));
  return science ? (city.demandScienceI ?? city.demandI ?? 0) : (city.demandRegularI ?? city.demandI ?? 0);
}

// Capacity, rather than the current science-park share, determines unmet demand. This lets
// the first park grow. Local consumption and businesses also need manufacturing/logistics
// even after the workforce becomes highly educated. Shared infrastructure penalties apply
// to both tracks; cleaner research buildings receive a smaller pollution penalty.
function calculateIndustrialDemand(inputs = {}) {
  const unit = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const bounded = (value) => Math.max(-1, Math.min(1, value));
  const positive = (value) => Math.max(0, Number(value) || 0);
  const population = positive(inputs.population);
  const labour = positive(inputs.labourForce);
  const basic = unit(inputs.basicEducation);
  const higher = unit(inputs.higherEducation);
  const research = unit(inputs.researchSupport);
  const activity = unit(Math.log10(population / 500 + 1) / 2);
  const traditionalTarget = Math.max(positive(inputs.lowEduWorkers) * 0.70,
    labour * (0.20 + 0.08 * activity) + positive(inputs.commercialJobs) * 0.16);
  const scienceTarget = labour * (0.40 * higher + 0.05 * basic + 0.10 * research)
    + positive(inputs.commercialJobs) * higher * 0.06;
  const gap = (target, jobs) => bounded((target - positive(jobs)) / Math.max(80, target));
  const scienceGap = gap(scienceTarget, inputs.scienceJobs);
  // Education amplifies expansion opportunities. Never amplify a negative gap with
  // education: that would perversely make new graduates reduce research demand.
  const sciencePressure = scienceGap > 0 ? scienceGap * (0.15 + 0.85 * higher) : scienceGap;
  const pollution = unit(positive(inputs.pollution) / 200);
  const shared = Number(inputs.sharedAdjustment) || 0;
  return {
    regular: bounded(0.22 + 0.50 * gap(traditionalTarget, inputs.regularJobs)
      + 0.14 * activity + 0.10 * basic - 0.10 * higher - 0.22 * pollution
      + (Number(inputs.regularPolicyBonus) || 0) + shared),
    science: bounded(-0.20 + 0.10 * basic + 0.25 * higher + 0.12 * research
      + 0.06 * activity + 0.62 * sciencePressure
      - 0.06 * pollution + shared),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeIndustrialType, normalizeIndustrialZones, calculateIndustrialDemand };
}
