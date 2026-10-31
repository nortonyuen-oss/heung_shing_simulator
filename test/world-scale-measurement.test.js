const assert = require('node:assert/strict');
const test = require('node:test');
const { measureReference, pickRecommendation, UP } = require('../scripts/measure-world-scale.js');
const near = (a, b, e = 1e-5) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('vertical metres and map-axis metres use different projection factors', () => {
  const vertical = measureReference({ id: 'floor', axis: 'vertical', a: [10, 200], b: [10, 100], realM: [10, 10, 10], pixelError: 0 }, 1000);
  near(vertical.targetScreenScale[1], UP / 10);
  near(vertical.targetSquareLotTiles[1], UP, 0.0002);
  const axis = measureReference({ id: 'field', axis: 'sw', a: [200, 100], b: [100, 150], realM: [20, 20, 20], pixelError: 0 }, 1000);
  near(axis.targetScreenScale[1], 0.5);
  near(axis.targetSquareLotTiles[1], 5);
  assert.equal(axis.projectionMismatch, false);
});

test('a span range includes both endpoint errors; an unresolved span has no invented upper bound', () => {
  const ruler = measureReference({ id: 'person', axis: 'vertical', a: [10, 20], b: [10, 10], realM: [1.6, 1.7, 1.8], pixelError: 5 }, 1000);
  near(ruler.targetScreenScale[0], UP * 1.6 / 20);
  assert.equal(ruler.targetScreenScale[2], null);
  assert.throws(() => measureReference({ id: 'diagonal-floor', axis: 'vertical', a: [0, 0], b: [10, 20], realM: [3, 3, 3] }, 1000), /sideways/);
});

test('contradictory rulers remain separate and design-only scenarios cannot be directly applied', () => {
  const a = { id: 'runway', referenceRole: 'primary', targetSquareLotTiles: [199, 200, 201], scenarioOnly: true };
  const b = { id: 'bay', referenceRole: 'check', targetSquareLotTiles: [9, 10, 11] };
  const result = pickRecommendation([a, b], { status: 'ambiguous-reference' }, [{ cols: 12 }]);
  assert.equal(result.primary, 'runway');
  assert.equal(result.referenceScaleRatio, 20);
  assert.equal(result.lot, null);
  assert.equal(result.eligibleForDirectResize, false);
  assert.match(result.text, /無單一建議格數/);
  assert.equal(pickRecommendation([], { status: 'ambiguous-reference' }, []).lot, null);
});

test('small objects without registered lots still detect inconsistent scale references', () => {
  const refs = [
    { id: 'body', referenceRole: 'primary', targetSquareLotTiles: null, targetScreenScale: [0.9, 1, 1.1] },
    { id: 'wheel', referenceRole: 'check', targetSquareLotTiles: null, targetScreenScale: [9, 10, 11] },
  ];
  const result = pickRecommendation(refs, { status: 'measured-with-assumed-reference' }, []);
  assert.equal(result.referenceScaleRatio, 10);
  assert.equal(result.status, '參照衝突');
  assert.equal(result.eligibleForDirectResize, false);
});
