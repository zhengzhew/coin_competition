import assert from 'node:assert/strict';
import { warehouseLevels, WarehouseSession } from '../shared/dist/index.js';

// Reference driver uses the same discrete manual inputs as the UI.
// It never moves bodies directly or sets delivery eligibility flags.
const results = [];
for (const level of warehouseLevels) {
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
  for (const [i, zone] of level.scene_config.zones.entries()) {
    const object = s.snapshot().objects[i];
    if (i === 0) {
      tap('grab'); wait(1.5);
      assert.equal(s.snapshot().holding, object.id, 'initial contact grasp');
      // Leave the tight starting corner along the forward axis. Chasing lateral
      // millimetres here can turn the loaded gripper back into the left wall.
      turn(0); straight(s.snapshot().x, 80);
    } else {
      // Approach the row from the open central aisle, facing toward the bottom edge.
      // Keep full turns away from the right wall; approach the last cube diagonally.
      const stagingX = Math.min(object.x, 102);
      drive(s.snapshot().x, 80); drive(stagingX, 80);
      if (object.x > 102) {
        drive(stagingX, 75);
        straight(106, 83); straight(108, 90); straight(108, object.z - 11.9); turn(Math.PI);
      } else { drive(object.x, object.z - 11.9); turn(Math.PI); }
      tap('grab'); wait(1.5);
      assert.equal(s.snapshot().holding, object.id, `pick ${object.id}`);
      if (object.x > 102) {
        straight(108, 90, true); straight(106, 83, true); straight(102, 75, true); drive(102, 80, true);
      } else drive(stagingX, 80, true);
      turn(0);
    }
    // Fill the far row first, keeping the near row and lower aisle clear.
    const cargoX = zone.x, cargoZ = zone.z, targetZ = cargoZ + 11.9;
    drive(cargoX, 80); turn(0); drive(cargoX, targetZ); turn(0);
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
    tap('release'); wait(2);
    if (process.env.WAREHOUSE_TRACE) console.log('release', level.demo_id, i, s.snapshot().objects);
    assert(s.snapshot().collected.includes(object.id), `place ${object.id}: ${JSON.stringify(s.snapshot())}`);
    if (!s.snapshot().completed) {
      drive(cargoX, 80, true);
      if (process.env.WAREHOUSE_TRACE) console.log('exit', level.demo_id, i, s.snapshot().objects);
    }
  }
  assert.equal(s.phase, 'completed', `${level.demo_id}: ${JSON.stringify(s.snapshot())}`);
  assert.equal(s.snapshot().collected.length, level.scene_config.objects.length, 'every box is required');
  assert.equal(new Set(Object.values(s.snapshot().delivered)).size, level.scene_config.objects.length, 'one box per zone');
  results.push({ level: level.demo_id, seconds: +s.elapsed.toFixed(2), delivered: s.snapshot().collected.length });
  console.log(JSON.stringify(results.at(-1)));
}
console.log(`All ${results.length} warehouse reference routes completed through manual physics.`);
