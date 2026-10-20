import assert from 'node:assert/strict';
import { warehouseLevels, WarehouseSession } from '../shared/dist/index.js';

// Reference driver uses the same discrete manual inputs as the UI.
// It never moves bodies directly or sets delivery eligibility flags.
const results = [];
// Explicit, reviewable routes compare strategies; these are not optimal-route claims.
// Each tuple is [cargo ID, region ID, placement X, optional world Z].
// Repeated regions use separate real cells; tight corner cells receive only one box.
const plans = [
  { level: 1, name: 'single-delivery', drops: [['1', 'A', 84]] },
  { level: 2, name: 'shared-three-cell-region', drops: [['1', 'A', 94], ['2', 'A', 106]] },
  { level: 3, name: 'crossed-corners', drops: [['1', 'B', 108, 12], ['3', 'A', 12, 12]] },
  { level: 3, name: 'split-by-distance', drops: [['1', 'A', 12, 12], ['3', 'B', 108, 12]] },
  { level: 4, name: 'three-box-corners', drops: [['1', 'A', 12, 12], ['2', 'C', 24, 12], ['4', 'B', 108, 12]] },
  { level: 4, name: 'four-box-middle-band', drops: [['1', 'C', 24, 12], ['2', 'C', 36, 12], ['3', 'D', 84, 12], ['4', 'D', 96, 12]] },
  { level: 5, name: 'four-box-exact-target', drops: [['1', 'A', 12, 12], ['2', 'C', 24, 12], ['3', 'E', 48, 12], ['6', 'B', 108, 12]] },
  { level: 5, name: 'five-box-over-target', drops: [['1', 'A', 12, 12], ['2', 'C', 24, 12], ['3', 'C', 36, 12], ['5', 'F', 72, 12], ['6', 'D', 96, 12]] },
  { level: 5, name: 'six-box-exact-target', drops: [['1', 'C', 24, 12], ['2', 'C', 36, 12], ['3', 'E', 48, 12], ['4', 'F', 72, 12], ['5', 'D', 84, 12], ['6', 'D', 96, 12]] },
  { level: 6, name: 'six-box-exact-target', drops: [['1', 'A', 12, 12], ['5', 'C', 24, 12], ['6', 'C', 36, 12], ['7', 'D', 84, 12], ['8', 'D', 96, 12], ['4', 'B', 108, 12]] },
  { level: 6, name: 'seven-box-over-target', drops: [['1', 'A', 12, 12], ['5', 'C', 24, 12], ['6', 'C', 36, 12], ['7', 'D', 84, 12], ['8', 'D', 96, 12], ['4', 'D', 96, 24], ['2', 'C', 24, 24]] },
  { level: 6, name: 'eight-box-exact-target', aisle: 60, drops: [['1', 'C', 24, 12], ['5', 'C', 36, 12], ['6', 'C', 24, 24], ['7', 'D', 84, 12], ['8', 'D', 96, 12], ['4', 'D', 96, 24], ['3', 'F', 72, 12], ['2', 'C', 12, 36]] },
];
for (const plan of plans.filter(plan => !process.env.WAREHOUSE_PLAN || `${plan.level}/${plan.name}`.includes(process.env.WAREHOUSE_PLAN))) {
  const level = warehouseLevels[plan.level - 1], aisle = plan.aisle ?? 48;
  let clock = 0;
  const s = new WarehouseSession(level, () => clock); s.start();
  const tick = (count = 1) => { for (let i = 0; i < count; i++) { clock += 1000 / 120; s.tick(1 / 120); } };
  const tap = action => { s.press('action', action); s.release('action'); };
  const wait = seconds => tick(Math.ceil(seconds * 120));
  const turn = heading => {
    s.clearInputs();
    for (let i = 0; i < 2000; i++) {
      const p = s.snapshot(), e = Math.atan2(Math.sin(heading - p.heading), Math.cos(heading - p.heading));
      if (Math.abs(e) < .006) { s.clearInputs(); wait(.1); return; }
      s.press('turn', e > 0 ? 'turn_right' : 'turn_left'); tick(); s.release('turn');
      if (Math.abs(e) < .1) wait(.025);
    }
    throw new Error(`turn failed: ${JSON.stringify(s.snapshot())}`);
  };
  const drive = (x, z, backwards = false) => {
    s.clearInputs();
    for (let i = 0; i < 6000; i++) {
      const p = s.snapshot(), distance = Math.hypot(x - p.x, z - p.z);
      if (distance < .06) { s.clearInputs(); wait(.1); return; }
      const heading = Math.atan2(x - p.x, p.z - z) + (backwards ? Math.PI : 0);
      const e = Math.atan2(Math.sin(heading - p.heading), Math.cos(heading - p.heading));
      if (Math.abs(e) > .012) turn(heading);
      s.press('drive', backwards ? 'backward' : 'forward'); tick();
      if (distance < 1) { s.release('drive'); wait(.05); }
    }
    throw new Error(`drive ${x},${z}: ${JSON.stringify(s.snapshot())}`);
  };
  const straight = (x, z, backwards = false) => {
    const start = s.snapshot(), dx = x - start.x, dz = z - start.z, length = Math.hypot(dx, dz);
    if (length < .05) return;
    turn(Math.atan2(dx, -dz) + (backwards ? Math.PI : 0));
    const origin = s.snapshot();
    for (let k = 0; k < 6000; k++) {
      const p = s.snapshot(), remaining = length - ((p.x - origin.x) * dx + (p.z - origin.z) * dz) / length;
      if (remaining < .04) { s.clearInputs(); wait(.1); return; }
      s.press('drive', backwards ? 'backward' : 'forward'); tick();
      if (remaining < 1) { s.release('drive'); wait(.05); }
    }
    throw new Error('Straight approach was blocked');
  };
  for (const [i, [id, zoneId, cargoX, dropZ]] of plan.drops.entries()) {
    const zone = level.scene_config.zones.find(z => z.id === zoneId);
    const object = s.snapshot().objects.find(o => o.id === id);
    if (i === 0) {
      straight(object.x - 11.9, s.snapshot().z);
      tap('grab'); wait(1);
      assert.equal(s.snapshot().holding, object.id, 'initial contact grasp');
      // Leave the tight starting corner along the forward axis. Chasing lateral
      // millimetres here can turn the loaded gripper back into the left wall.
      turn(0); straight(s.snapshot().x, aisle);
    } else {
      // Approach the row from the open central aisle, facing toward the bottom edge.
      // Keep full turns away from the right wall; approach the last cube diagonally.
      const stagingX = Math.min(object.x, 102);
      drive(s.snapshot().x, aisle); drive(stagingX, aisle);
      if (object.x > 102) {
        drive(stagingX, 75);
        straight(106, 83); straight(108, 90); straight(108, object.z - 11.9); turn(Math.PI);
      } else { straight(object.x, object.z - 11.9); turn(Math.PI); }
      tap('grab'); wait(1);
      assert.equal(s.snapshot().holding, object.id, `pick ${object.id}`);
      if (object.x > 102) {
        straight(108, 90, true); straight(106, 83, true); straight(102, 75, true); drive(102, aisle, true);
      } else straight(stagingX, aisle, true);
    }
    // Approach far regions from below, near regions from above. Reverse out along
    // that approach so neither the chassis nor the gripper pushes delivered cargo.
    const cargoZ = dropZ ?? zone.z, heading = cargoZ > aisle ? Math.PI : 0;
    const targetZ = cargoZ + Math.cos(heading) * 11.9;
    drive(cargoX, aisle, cargoX > 102 || cargoX < 18); turn(heading); straight(cargoX, targetZ); turn(heading);
    // Use the visible cargo position to correct sliding within the real fingers.
    for (let k = 0; k < 1200; k++) {
      const cargo = s.snapshot().objects.find(o => o.id === object.id);
      const error = cargoZ - cargo.z;
      if (Math.abs(error) < .03) break;
      const forward = error * -Math.cos(s.snapshot().heading) > 0;
      s.press('adjust', forward ? 'forward' : 'backward'); tick(); s.release('adjust'); wait(.06);
      if (k === 1199) throw new Error(`cargo adjustment failed: ${JSON.stringify(s.snapshot())}`);
    }
    assert.equal(s.snapshot().holding, object.id, `carry ${object.id}`);
    tap('release'); wait(1);
    if (process.env.WAREHOUSE_TRACE) console.log('release', level.demo_id, i, s.snapshot().objects);
    assert(s.snapshot().collected.includes(object.id), `place ${object.id}: ${JSON.stringify(s.snapshot())}`);
    if (!s.snapshot().completed) {
      straight(cargoX, aisle, true);
      if (process.env.WAREHOUSE_TRACE) console.log('exit', level.demo_id, i, s.snapshot().objects);
    }
  }
  assert.equal(s.phase, 'completed', `${level.demo_id}: ${JSON.stringify(s.snapshot())}`);
  assert.equal(s.snapshot().collected.length, plan.drops.length, 'all planned releases remain valid');
  if (level.targetScore !== undefined) assert(s.snapshot().score >= level.targetScore);
  else assert.equal(s.snapshot().collected.length, level.requiredCount);
  const elapsed = s.elapsed; clock += 10_000; s.press('after-finish', 'forward'); s.tick(.1);
  assert.equal(s.elapsed, elapsed, 'reaching the target freezes time and controls');
  results.push({ level: level.demo_id, strategy: plan.name, seconds: +s.elapsed.toFixed(2),
    delivered: s.snapshot().collected.length, score: s.snapshot().score });
  console.log(JSON.stringify(results.at(-1)));
}
if (!process.env.WAREHOUSE_PLAN) {
  const time = name => results.find(result => result.strategy === name).seconds;
  assert(time('split-by-distance') < time('crossed-corners'), 'distance-based allocation should improve this reference route');
}
console.log(`All ${results.length} warehouse reference strategies completed through manual physics.`);
