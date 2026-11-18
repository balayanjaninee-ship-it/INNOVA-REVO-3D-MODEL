import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areAnyPartsOpen,
  clampSteeringDeg,
  computeFourViewRects,
  dampValue,
  DEFAULT_VEHICLE_STATE,
  formatPlateDisplay,
  getPaintFinish,
  PAINT_FINISHES,
  PANELCO_BRAND,
  resolveDecalInkHex,
  resolveTaglineColorHex,
  setAllArticulation,
  STEERING_LIMIT_DEG,
  validateFleetForm,
} from './vehicleConfig';

test('computeFourViewRects tiles 100% of usable viewport in exact PANELCO III order', () => {
  const rects = computeFourViewRects(1440, 900, 64, 120);
  assert.equal(rects.length, 4);
  assert.deepEqual(
    rects.map((r) => r.id),
    ['right', 'left', 'front', 'rear'],
  );

  const [right, left, front, rear] = rects;
  assert.equal(right.width + left.width, 1440);
  assert.equal(front.width + rear.width, 1440);
  assert.equal(right.height + front.height, 900 - 64 - 120);
  assert.equal(left.height + rear.height, 900 - 64 - 120);

  // Right side camera on -X so front (+Z) points right; left side camera on +X so front points left
  assert.ok(right.cameraPosition[0] < 0);
  assert.ok(left.cameraPosition[0] > 0);
  assert.ok(front.cameraPosition[2] > 0);
  assert.ok(rear.cameraPosition[2] < 0);

  // Top row has larger WebGL y than bottom row (origin bottom-left)
  assert.ok(right.y > front.y);
  assert.equal(right.y, front.y + front.height);
});

test('resolveDecalInkHex adapts ink contrast for light vs dark paints and sketch mode', () => {
  assert.equal(resolveDecalInkHex('white-pearl', 'studio', 'color'), '#0f172a');
  assert.equal(resolveDecalInkHex('alumina-bronze', 'studio', 'color'), '#0f172a');
  assert.equal(resolveDecalInkHex('red-mica', 'studio', 'color'), '#f8fafc');
  assert.equal(resolveDecalInkHex('attitude-black', 'night', 'color'), '#f8fafc');
  assert.equal(resolveDecalInkHex('red-mica', 'sketch', 'color'), '#111827');
});

test('resolveTaglineColorHex matches PANELCO III logo green in color mode and ink in sketch mode', () => {
  assert.equal(PANELCO_BRAND.greenHex, '#019240');
  assert.equal(resolveTaglineColorHex('white-pearl', 'studio', 'color'), '#019240');
  assert.equal(resolveTaglineColorHex('alumina-bronze', 'studio', 'color'), '#019240');
  assert.equal(resolveTaglineColorHex('red-mica', 'studio', 'color'), PANELCO_BRAND.greenLightHex);
  assert.equal(resolveTaglineColorHex('attitude-black', 'night', 'color'), PANELCO_BRAND.greenLightHex);
  assert.equal(resolveTaglineColorHex('white-pearl', 'sketch', 'color'), '#111827');
  assert.equal(resolveTaglineColorHex('white-pearl', 'studio', 'monochrome'), '#111827');
});

test('steering clamping enforces realistic Innova lock limits', () => {
  assert.equal(clampSteeringDeg(45), STEERING_LIMIT_DEG);
  assert.equal(clampSteeringDeg(-90), -STEERING_LIMIT_DEG);
  assert.equal(clampSteeringDeg(14.6), 15);
  assert.equal(clampSteeringDeg(Number.NaN), 0);
});

test('articulation helpers toggle open/closed states cleanly', () => {
  assert.equal(areAnyPartsOpen(DEFAULT_VEHICLE_STATE.articulation), false);
  const allOpen = setAllArticulation(true);
  assert.equal(areAnyPartsOpen(allOpen), true);
  assert.equal(allOpen.hood, true);
  assert.equal(allOpen.tailgate, true);
  assert.equal(areAnyPartsOpen(setAllArticulation(false)), false);
});

test('dampValue moves monotonically toward target and snaps near convergence', () => {
  const step1 = dampValue(0, 1, 8, 0.016);
  assert.ok(step1 > 0 && step1 < 1);
  const step2 = dampValue(step1, 1, 8, 0.016);
  assert.ok(step2 > step1);
  assert.equal(dampValue(0.9999, 1, 8, 0.016), 1);
});

test('validateFleetForm rejects blank required fields instead of silently substituting defaults', () => {
  const invalid = validateFleetForm({
    driverName: ' ',
    dateTime: '',
    plateNumber: '',
    bodyNumber: '',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.driverName);
  assert.ok(invalid.errors.dateTime);
  assert.ok(invalid.errors.plateNumber);

  const valid = validateFleetForm({
    driverName: 'Maria Santos',
    dateTime: '2026-11-17 09:00 AM',
    plateNumber: 'SAA 3841',
    bodyNumber: 'P3-014',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('formatPlateDisplay prioritizes plate number, then body number, then INNOVA', () => {
  assert.equal(
    formatPlateDisplay({
      driverName: 'Test',
      dateTime: 'Now',
      plateNumber: ' saa 3841 ',
      bodyNumber: 'p3-014',
    }),
    'SAA 3841',
  );
  assert.equal(
    formatPlateDisplay({
      driverName: 'Test',
      dateTime: 'Now',
      plateNumber: '',
      bodyNumber: 'p3-022',
    }),
    'P3-022',
  );
  assert.equal(
    formatPlateDisplay({
      driverName: 'Test',
      dateTime: 'Now',
      plateNumber: '',
      bodyNumber: '',
    }),
    'INNOVA',
  );
});

test('paint catalog covers all uploaded reference finishes', () => {
  assert.ok(PAINT_FINISHES.length >= 5);
  assert.equal(getPaintFinish('white-pearl').name, 'White Pearl CS');
  assert.equal(getPaintFinish('alumina-bronze').name, 'Alumina Bronze');
  assert.equal(getPaintFinish('red-mica').name, 'Red Mica Metallic');
});
