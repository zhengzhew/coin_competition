import assert from 'node:assert/strict';

// Shared browser checks for DEMO and the farm, which render the same 3D scene.
export async function verifySimulationCamera(page, screenshotPath) {
  const canvas = page.locator('canvas[data-third-scene]');
  const button = name => page.getByRole('button', { name, exact: true });
  const read = () => canvas.evaluate(el => ({
    view: el.dataset.view,
    camera: el.dataset.camera.split(',').map(Number),
    target: el.dataset.target.split(',').map(Number),
    vehicle: el.dataset.vehicle.split(',').map(Number),
  }));
  const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
  const offset = pose => pose.camera.map((n, i) => n - pose.target[i]);
  const settle = async () => {
    let previous = await read(), stable = 0;
    for (let n = 0; n < 80; n++) {
      await page.waitForTimeout(100);
      const current = await read();
      stable = distance(current.camera, previous.camera) < .02 && distance(current.target, previous.target) < .02 ? stable + 1 : 0;
      if (stable >= 3) return current;
      previous = current;
    }
    throw new Error('Camera did not settle');
  };
  const drag = async (mouseButton = 'left', dx = 65, dy = 25) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    const x = box.x + box.width * .45, y = box.y + box.height * .5;
    await page.mouse.move(x, y); await page.mouse.down({ button: mouseButton });
    await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up({ button: mouseButton });
    return settle();
  };
  const locked = pose => {
    assert.ok(Math.abs(pose.target[0] - pose.vehicle[0]) < .02 && Math.abs(pose.target[2] - pose.vehicle[2]) < .02, 'focus remains on the robot');
  };
  await page.waitForFunction(() => !!document.querySelector('canvas[data-third-scene]')?.dataset.camera);
  await button('复位').click();
  const initial = await settle();
  const panned = await drag('right');
  assert.ok(distance(panned.target, initial.target) > 1, 'right drag moves the map focus');
  assert.ok(Math.abs(panned.target[1]) < .001, 'pan stays on the field plane');
  assert.ok(distance(offset(panned), offset(initial)) < .2, 'pan preserves viewing angle and zoom');
  await page.keyboard.down('Shift');
  const shifted = await drag(); await page.keyboard.up('Shift');
  assert.ok(distance(shifted.target, panned.target) > 1, 'Shift + left drag pans');
  await button('平移视角').click();
  assert.equal(await button('平移视角').getAttribute('aria-pressed'), 'true');
  const directPan = await drag();
  assert.ok(distance(directPan.target, shifted.target) > 1, 'pan tool uses left drag');

  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width - 100, height: viewport.height - 50 });
  const resized = await settle();
  assert.ok(distance(resized.target, directPan.target) < .15, 'resize preserves panned focus');
  assert.ok(distance(offset(resized), offset(directPan)) < .15, 'resize preserves zoom');
  await page.setViewportSize(viewport);
  await button('俯视').click(); const top = await settle();
  const topPan = await drag();
  assert.ok(distance(topPan.target, top.target) > 1, 'top view supports direct pan');
  assert.ok(distance(offset(topPan), offset(top)) < .2, 'top pan does not rotate');

  // Switch immediately after panning to catch residual-inertia drift.
  await button('跟随小车').click(); let followed = await settle(); locked(followed);
  assert.equal(await button('平移视角').isDisabled(), true);
  const attemptedPan = await drag('right'); locked(attemptedPan);
  assert.ok(distance(attemptedPan.target, followed.target) < .02, 'right drag cannot detach follow focus');
  const rotated = await drag('left', 40, -15); locked(rotated);
  assert.ok(distance(offset(rotated), offset(followed)) > 1, 'follow allows orbiting the robot');
  await button('放大地图').click(); const zoomed = await settle(); locked(zoomed);
  assert.ok(distance(zoomed.camera, zoomed.target) < distance(rotated.camera, rotated.target) * .9, 'follow zoom is not reset on the next frame');
  await canvas.hover(); await page.mouse.wheel(0, -100); const wheeled = await settle(); locked(wheeled);
  assert.ok(distance(wheeled.camera, wheeled.target) < distance(zoomed.camera, zoomed.target) - 1, 'wheel zoom works while following');
  await page.setViewportSize({ width: viewport.width - 100, height: viewport.height - 50 });
  const followResize = await settle(); locked(followResize);
  assert.ok(distance(offset(followResize), offset(wheeled)) < .15, 'resize preserves follow angle and zoom');
  await page.setViewportSize(viewport);

  await page.getByTestId('third-start').click();
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(z => {
      const canvas = document.querySelector('canvas[data-third-scene]');
      return Math.abs(Number(canvas.dataset.vehicle.split(',')[2]) - z) > 2;
    }, wheeled.vehicle[2]);
  } finally { await page.keyboard.up('s'); }
  await button('停止').click();
  const moved = await settle(); locked(moved);
  assert.ok(distance(moved.vehicle, wheeled.vehicle) > 2, 'robot actually moved');
  assert.ok(distance(offset(moved), offset(wheeled)) < .15, 'moving robot preserves the chosen follow angle and distance');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await button('重置').click(); followed = await settle(); locked(followed);
  assert.ok(distance(followed.vehicle, initial.vehicle) < .02, 'reset recenters on the reset robot');
  await button('自由视角').click(); const free = await settle();
  assert.equal(await button('平移视角').isDisabled(), false);
  const freePan = await drag('right');
  assert.ok(distance(freePan.target, free.target) > 1, 'leaving follow unlocks the focus');
  await button('复位').click(); const reset = await settle();
  assert.ok(distance(reset.target, initial.target) < .02, 'view reset restores map center');
  assert.equal(await button('平移视角').getAttribute('aria-pressed'), 'false');
}
