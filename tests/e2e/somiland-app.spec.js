const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

async function legacyFrame(page) {
  await expect(page.locator('iframe[title="XR Animator legacy runtime"]')).toBeVisible();
  await expect.poll(() => page.frames().some((frame) => frame.url().includes('avatar-mock.html'))).toBe(true);
  return page.frames().find((frame) => frame.url().includes('avatar-mock.html'));
}

test('starts one React shell window and controls the embedded XR runtime', async () => {
  const app = await electron.launch({
    args: ['.', '--test-mode'],
    cwd: ROOT,
    env: { ...process.env, SOMILAND_TEST_MODE: '1' },
  });

  try {
    const appWindow = await app.firstWindow();
    await expect(appWindow.getByRole('heading', { name: 'XR Animator' })).toBeVisible();
    await expect.poll(async () => (await app.windows()).length).toBe(1);

    const frame = await legacyFrame(appWindow);
    await expect(appWindow.getByText('Test', { exact: true })).toBeVisible();
    await expect(appWindow.getByText('Engine', { exact: true })).toBeVisible();
    await expect.poll(async () => frame.evaluate(() => window.xrAnimatorElectron === undefined)).toBe(true);
    await expect.poll(async () => frame.evaluate(() => window.__xrAnimatorLegacyWindowShim === true)).toBe(true);

    await appWindow.getByRole('button', { name: 'Face', exact: true }).click();
    await expect.poll(async () => frame.evaluate(() => window.__somilandMock.trackingMode)).toBe('Face');

    await appWindow.getByRole('button', { name: 'Green', exact: true }).click();
    await expect.poll(async () => frame.evaluate(() => document.body.classList.contains('sv-bg-green'))).toBe(true);
    await expect.poll(async () => appWindow.evaluate(() => document.body.dataset.backgroundMode || '')).toBe('');
    await expect(appWindow.getByRole('button', { name: 'Load VRM' })).toBeVisible();

    await appWindow.getByRole('button', { name: 'Happy', exact: true }).click();
    await expect.poll(async () => frame.evaluate(() => window.__somilandMock.expressionValues.happy)).toBe(1);

    await appWindow.getByRole('button', { name: 'Capture 1280x720' }).click();
    await expect(appWindow.getByRole('button', { name: 'Load VRM' })).toBeHidden();
    await expect.poll(async () => {
      const box = await appWindow.getByTestId('legacy-viewport').boundingBox();
      return box ? Math.floor(box.width) : 0;
    }).toBeGreaterThanOrEqual(1280);
    await expect.poll(async () => {
      const box = await appWindow.getByTestId('legacy-viewport').boundingBox();
      return box ? Math.floor(box.height) : 0;
    }).toBeGreaterThanOrEqual(720);
  } finally {
    await app.close();
  }
});
