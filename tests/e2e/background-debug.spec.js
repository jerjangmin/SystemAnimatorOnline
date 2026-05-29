const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

async function launchBackgroundApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xr-animator-bg-'));
  const app = await electron.launch({
    args: ['.', '--background-debug', `--user-data-dir=${userDataDir}`],
    cwd: ROOT,
    env: {
      ...process.env,
      XR_ANIMATOR_BACKGROUND_DEBUG: '1',
      SOMILAND_TEST_MODE: '0',
    },
  });
  return { app, userDataDir };
}

async function appState(page) {
  return page.evaluate(() => {
    const logStatus = document.querySelector('.log-status span')?.textContent || '';
    const errorEntries = Array.from(document.querySelectorAll('.log-entry--error summary strong'))
      .map((node) => node.textContent || '');
    const warnEntries = Array.from(document.querySelectorAll('.log-entry--warn summary strong'))
      .map((node) => node.textContent || '');
    const runtimeText = document.querySelector('.debug-header h2')?.textContent || '';
    const legacyFrame = document.querySelector('iframe[title="XR Animator legacy runtime"]');
    return {
      logStatus,
      errorEntries,
      warnEntries,
      runtimeText,
      legacyFrameSrc: legacyFrame?.getAttribute('src') || '',
      backgroundMode: document.querySelector('[data-testid="legacy-viewport"]')?.getAttribute('data-background-mode') || '',
      bodyText: document.body.textContent || '',
    };
  });
}

async function clickButton(page, name) {
  await page.getByRole('button', { name, exact: true }).click({ force: true });
  await expect.poll(async () => (await page.locator('.log-status strong').textContent()) || '').toBe('Idle');
}

async function expectNoErrors(page, step) {
  const state = await appState(page);
  expect(state.errorEntries, `${step}: ${JSON.stringify(state, null, 2)}`).toEqual([]);
}

test('background debug mode loads and exercises core controls without showing the app window', async () => {
  const { app, userDataDir } = await launchBackgroundApp();
  const browserErrors = [];
  const consoleErrors = [];

  try {
    const appWindow = await app.firstWindow();
    const browserWindow = await app.browserWindow(appWindow);
    appWindow.on('pageerror', (error) => browserErrors.push(error.stack || error.message));
    appWindow.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) {
        consoleErrors.push(`${message.type()}: ${message.text()}`);
      }
    });

    await expect.poll(async () => (await app.windows()).length).toBe(1);
    await expect.poll(async () => browserWindow.evaluate((win) => win.isVisible())).toBe(false);
    await expect.poll(async () => (await appState(appWindow)).legacyFrameSrc).toContain('../XR_Animator.html');
    await expect.poll(async () => (await appState(appWindow)).runtimeText, { timeout: 60000 }).toBe('Renderer ready');
    await expectNoErrors(appWindow, 'initial XR runtime boot');

    for (const name of ['Black', 'Green', 'Transparent']) {
      await clickButton(appWindow, name);
      await expectNoErrors(appWindow, `background control: ${name}`);
    }
    await expect.poll(async () => (await appState(appWindow)).backgroundMode).toBe('transparent');

    for (const name of ['Happy', 'Sad', 'Neutral', 'Reset Pose']) {
      await clickButton(appWindow, name);
      await expectNoErrors(appWindow, `expression control: ${name}`);
    }

    for (const name of ['Face', 'Face + Body', 'Body + Hands']) {
      await clickButton(appWindow, name);
      await expectNoErrors(appWindow, `tracking control: ${name}`);
    }

    await clickButton(appWindow, 'Reset Camera');
    await expectNoErrors(appWindow, 'reset camera');

    await clickButton(appWindow, 'Center');
    await expectNoErrors(appWindow, 'center window');

    await clickButton(appWindow, 'Capture 1280x720');
    await expectNoErrors(appWindow, 'capture viewport size');
    await expect.poll(async () => {
      const box = await appWindow.getByTestId('legacy-viewport').boundingBox();
      return box ? Math.floor(box.width) : 0;
    }).toBeGreaterThanOrEqual(1280);
    await expect.poll(async () => {
      const box = await appWindow.getByTestId('legacy-viewport').boundingBox();
      return box ? Math.floor(box.height) : 0;
    }).toBeGreaterThanOrEqual(720);

    expect(browserErrors, `pageerror events: ${browserErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors/warnings: ${consoleErrors.join('\n')}`).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
