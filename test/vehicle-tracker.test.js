const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const tracker = require('../vehicle-tracker.js');

test('tracker maintenance cadence is 15 fps for four windows and adapts fairly above four', () => {
  assert.equal(tracker.getVehicleTrackerTargetFps(1), 15);
  assert.equal(tracker.getVehicleTrackerTargetFps(4), 15);
  assert.equal(tracker.getVehicleTrackerTargetFps(5), 12);
  assert.equal(tracker.getVehicleTrackerTargetFps(8), 7);
  assert.equal(tracker.getVehicleTrackerTargetFps(20), 5);
  assert.equal(tracker.getVehicleTrackerTargetKey('transport', 'bus_8'), 'transport:bus_8');
});

test('live trackers use shared Phaser cameras and foreground surfaces without private loops or a second game', () => {
  const moduleSource = source('vehicle-tracker.js');
  assert.match(moduleSource, /scene\.cameras\.add\(/);
  assert.match(moduleSource, /camera\.centerOn\(info\.x, info\.y\)/);
  assert.match(moduleSource, /Phaser\.Cameras\?\.Scene2D\?\.Events/);
  assert.match(moduleSource, /VEHICLE_TRACKER_CONFIG\.budgetMs/);
  assert.match(moduleSource, /roundRobinCursor/);
  assert.match(moduleSource, /spatialBuckets/);
  assert.match(moduleSource, /objectCullKey/);
  assert.match(moduleSource, /syncVehicleTrackerObjectCameraFilters/);
  assert.match(moduleSource, /class="vehicle-tracker-surface"/);
  assert.match(moduleSource, /presentVehicleTrackerSurface\(scene, tracker\)/);
  assert.match(moduleSource, /context\.drawImage\([\s\S]*?sourceCanvas,[\s\S]*?sourceX,[\s\S]*?sourceY/);
  assert.doesNotMatch(moduleSource, /requestAnimationFrame\s*\(/);
  assert.doesNotMatch(moduleSource, /setInterval\s*\(/);
  assert.doesNotMatch(moduleSource, /createElement\(['"]iframe['"]\)/);
  assert.doesNotMatch(moduleSource, /new Phaser\.Game/);
});

test('live tracker cameras stay composited between scheduled maintenance frames', () => {
  const moduleSource = source('vehicle-tracker.js');
  const renderEnd = moduleSource.slice(
    moduleSource.indexOf('function recordVehicleTrackerRenderEnd'),
    moduleSource.indexOf('function ensureVehicleTrackerCamera'),
  );
  const beginFrame = moduleSource.slice(
    moduleSource.indexOf('function beginVehicleTrackerFrame'),
    moduleSource.indexOf('function syncVehicleTrackerTargetsBeforeRender'),
  );
  assert.doesNotMatch(renderEnd, /setVehicleTrackerCameraVisible\(tracker, false\)/);
  assert.doesNotMatch(beginFrame, /tracker\.scene = scene;\s*setVehicleTrackerCameraVisible\(tracker, false\)/);
  assert.match(beginFrame, /if \(tracker\.minimized\) setVehicleTrackerCameraVisible\(tracker, false\)/);
  assert.match(moduleSource, /now - tracker\.lastScheduledAt >= interval/);
  assert.match(moduleSource, /if \(tracker\.maintenanceDue\)[\s\S]*?updateVehicleTrackerCameraObjectCulling/);
  assert.match(moduleSource, /updateVehicleTrackerDynamicObjectCulling\(scene, tracker\)/);
});

test('tracker manager supports duplicate focus, minimise cleanup and target lifecycle cleanup', () => {
  const moduleSource = source('vehicle-tracker.js');
  assert.match(moduleSource, /vehicleTrackerManager\.trackers\.get\(key\)/);
  assert.match(moduleSource, /setVehicleTrackingWindowMinimized\(tracker, false\)/);
  assert.match(moduleSource, /tracker\.minimized/);
  assert.match(moduleSource, /scene\.cameras\.remove\(tracker\.camera, true\)/);
  assert.match(moduleSource, /tracker\.surfaceElement = null/);
  assert.match(moduleSource, /function closeAllVehicleTrackingWindows\(/);
  assert.match(moduleSource, /transport\.tracker\.unavailable/);
  assert.match(source('transport-ui.js'), /closeAllVehicleTrackingWindows\(\)/);
  assert.match(source('main.js'), /function fullReset\(scene\) \{[\s\S]*?closeAllVehicleTrackingWindows\(\)/);
});

test('the one game update loop schedules trackers and culls the union of independent camera views', () => {
  const main = source('main.js');
  assert.match(main, /updateGameClock\(this, delta\);[\s\S]*?beginVehicleTrackerFrame\(this, time, delta\)/);
  assert.match(main, /syncVehicleTrackerTargetsBeforeRender\(this, time\);[\s\S]*?updateTerrainViewportCulling\(this\)/);
  assert.match(main, /getActiveWorldViewportCameras/);
  assert.match(main, /getVehicleTrackerCullCameras\(scene\)/);
  assert.match(main, /const terrainBounds = viewportCameras\.map/);
});

test('tracker target adapters cover owned buses, ambient road vehicles, vessels and aircraft', () => {
  const moduleSource = source('vehicle-tracker.js');
  assert.match(moduleSource, /type === 'transport'/);
  for (const kind of ['traffic', 'vessel', 'aircraft']) {
    assert.match(moduleSource, new RegExp(`type === '${kind}'`));
  }
  assert.match(source('traffic-visuals.js'), /registerVehicleTrackingSprite\(vehicle, 'traffic'\)/);
  assert.match(source('vessel-visuals.js'), /registerVehicleTrackingSprite\(event, 'vessel'\)/);
  assert.match(source('aircraft-visuals.js'), /registerVehicleTrackingSprite\(event, 'aircraft'\)/);
});

test('tracker module loads after vehicle systems and before the main Phaser scene', () => {
  const html = source('index.html');
  assert.match(
    html,
    /traffic-visuals\.js[\s\S]*?transport-visuals\.js[\s\S]*?vessel-visuals\.js[\s\S]*?aircraft-visuals\.js[\s\S]*?vehicle-tracker\.js[\s\S]*?main\.js/,
  );
});
