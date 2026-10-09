import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { curriculumReferencePrograms } from '../shared/dist/curriculum-reference.js';
import { validateAndExpand } from '../shared/dist/index.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = mkdtempSync(join(tmpdir(), 'competition-template-'));
process.env.COIN_DATA_DIR = directory; process.env.TEACHER_KEY = 'template-browser-test';
const { apiRouter } = await import('../server/dist/routes.js');
const { getDb, closeDb } = await import('../server/dist/db.js');
const app = express(); app.use(express.json(), cookieParser()); app.use('/api', apiRouter); app.use(express.static(resolve('client/dist')));
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`, output = resolve('outputs/competition-template'); mkdirSync(output, { recursive: true });
const solutions = JSON.parse(readFileSync('solutions.teacher.json', 'utf8')).solutions;
let browser, page; const errors = [], checks = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [route, module] of [['/', 'coin'], ['/future/', 'future']]) {
    const context = await browser.newContext({ viewport: { width: 1543, height: 884 }, reducedMotion: 'reduce' });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + route); await page.getByLabel('你的名字', { exact: true }).fill(`模板测试 ${module}`);
    assert.equal(await page.locator('.module-welcome-body').count(), 1);
    assert.equal(await page.locator('.onboarding[role=dialog]').count(), 0);
    assert.match(await page.getByTestId('player-random-id').innerText(), /^[0-9a-f-]{36}$/);
    await page.screenshot({ path: join(output, `${module}-welcome.png`), fullPage: true });
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.locator('[data-track-id="onboarding.mode.python_blank"]').click();
    await page.locator('.module-mission-heading').waitFor();
    if (module === 'future') await page.locator('canvas[data-ready=true]').waitFor();
    assert.equal(await page.locator('.module-mode-notice strong').innerText(), '编程控制');
    assert.equal(await page.getByRole('button', { name: '重置代码', exact: true }).count(), 0);
    assert.ok(await page.locator('.level-btn strong').count() >= 6);
    assert.equal(await page.locator('.header-actions .competition-attempt-info').count(), 0);
    const levels = await (await context.request.get(origin + `/api/levels?competition=${module}`)).json();
    if (module === 'future') {
      await page.getByLabel('循环次数', { exact: true }).fill('20');
      await page.locator('[data-track-id="python.command.add.forward"]').click();
    } else {
      await page.locator('[data-track-id="python.command.add.right"]').click(); await page.locator('.count-input').fill('20');
    }
    const sourceValues = () => page.locator('.python-editor input').evaluateAll(inputs => inputs.map(input => input.value));
    const preserved = await sourceValues();
    const created = page.waitForResponse(r => r.url().endsWith('/api/attempts') && r.request().method() === 'POST');
    const submitted = page.waitForRequest(r => r.url().endsWith('/commands') && r.method() === 'POST');
    await page.locator('[data-track-id="python.run"]').click(); const attempt = await (await created).json();
    await page.getByTestId('running-code-line').waitFor();
    await page.waitForFunction(() => Number(document.querySelector('.status-bar > div:first-child b')?.textContent) > 0);
    await page.screenshot({ path: join(output, `${module}-running.png`), fullPage: true });
    await page.getByTestId('competition-stop-reset').click();
    const sent = (await submitted).postDataJSON().commands;
    assert.ok(sent.length >= 1 && sent.length < 20, 'stop sends only the executed prefix');
    await page.getByRole('button', { name: '重置', exact: true }).click();
    assert.deepEqual(await sourceValues(), preserved, 'reset keeps all code fields');
    assert.equal(await page.getByTestId('running-code-line').count(), 0);
    assert.equal(await page.getByTestId('competition-stop-reset').innerText(), '停止');
    assert.equal(Number(await page.locator('.status-bar > div:first-child b').innerText()), 0);
    const stopped = getDb().prepare('SELECT status, commands FROM attempts WHERE attempt_id = ?').get(attempt.attempt_id);
    assert.equal(stopped.status, 'stopped'); assert.deepEqual(JSON.parse(stopped.commands), sent);
    if (module === 'future') {
      await page.getByLabel('循环次数', { exact: true }).fill('4'); await page.getByLabel('forward 步数', { exact: true }).fill('4');
      await page.locator('[data-track-id="python.command.add.turn_right"]').click();
    } else {
      await page.getByRole('button', { name: '删除第 1 行', exact: true }).click();
      for (const row of solutions[0].reference_rows) {
        await page.locator(`[data-track-id="python.command.add.${row.direction}"]`).click(); await page.locator('.count-input').last().fill(String(row.count));
      }
    }
    await page.locator('[data-track-id="python.run"]').click();
    await page.waitForFunction(() => document.querySelector('.score-total b')?.textContent === '100');
    assert.equal(await page.getByTestId('running-code-line').count(), 0);
    await page.screenshot({ path: join(output, `${module}-complete.png`), fullPage: true });
    const finalValues = await sourceValues(); await page.getByRole('button', { name: '重置', exact: true }).click(); assert.deepEqual(await sourceValues(), finalValues);
    for (const viewport of [{ width: 1543, height: 884 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${module} no overflow ${viewport.width}`);
      const board = await page.locator('.board-viewport').boundingBox(), editor = await page.locator('.python-editor').boundingBox(), run = await page.locator('[data-track-id="python.run"]').boundingBox();
      assert.ok(board.width > 240 && board.height >= 280, `${module} usable board`);
      assert.ok(run.y + run.height <= editor.y + editor.height + 1, `${module} run button remains inside editor`);
      if (viewport.width >= 1000) {
        assert.ok(board.height > viewport.height * .5, `${module} large board`);
        const heading = await page.locator('.module-mission-heading').boundingBox(), objective = await page.locator('.module-mission-heading p').boundingBox();
        assert.ok(heading.x + heading.width - objective.x - objective.width < 20, 'right-aligned task objective');
      }
      await page.screenshot({ path: join(output, `${module}-${viewport.width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1543, height: 884 }); await page.locator('[data-track-id="header.mode.switch"]').click();
    assert.equal(await page.locator('.module-mode-notice strong').innerText(), '手动操作');
    await page.locator('[data-track-id="attempt.start"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-track-id="move.right"], [data-track-id="move.forward"]')?.disabled);
    const commands = module === 'future' ? validateAndExpand(curriculumReferencePrograms()[0], levels[0].python).expanded : solutions[0].commands;
    const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', forward: 'w', backward: 's', turn_left: 'a', turn_right: 'd', grab: 'g', release: 'r' };
    for (const action of commands) {
      if (await page.locator('.score-total b').count()) break;
      const response = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST');
      await page.keyboard.press(keys[action]); assert.equal((await response).status(), 200);
    }
    await page.locator('.score-total b').waitFor(); assert.equal(await page.locator('.score-total b').innerText(), module === 'future' ? '80' : '100');
    await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.locator('.module-welcome-body').waitFor();
    await page.locator('[data-track-id="onboarding.mode.python_blank"]').click(); assert.deepEqual(await sourceValues(), finalValues);
    checks.push(`${module}: shared welcome/header/mission/actions, executed-row highlight, partial stop, reset preserves code, official program/manual scores, four responsive layouts, home/mode switching`);
    await context.close();
  }
  assert.deepEqual(errors, []); const report = { passed: true, checks, errors, evidence: 'production build; isolated SQLite database; headless Edge' };
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}); throw error;
} finally {
  await browser?.close(); await new Promise(r => server.close(r)); closeDb();
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected cleanup directory');
  rmSync(directory, { recursive: true, force: true });
}
