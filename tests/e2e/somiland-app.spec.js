const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

test('starts two windows and routes control commands to the avatar adapter', async () => {
  const app = await electron.launch({
    args: ['.', '--test-mode'],
    cwd: ROOT,
    env: { ...process.env, SOMILAND_TEST_MODE: '1' },
  });

  try {
    const controlWindow = await app.firstWindow();
    await expect(controlWindow.getByRole('heading', { name: 'Somiland VTuber' })).toBeVisible();

    await expect.poll(async () => (await app.windows()).length).toBeGreaterThanOrEqual(2);
    const windows = await app.windows();
    const avatarWindow = windows.find((page) => page !== controlWindow);
    expect(avatarWindow).toBeTruthy();

    await expect(controlWindow.getByRole('button', { name: /얼굴\+상반신/ })).toBeVisible();

    await controlWindow.getByRole('button', { name: /얼굴.*표정과 머리 움직임 중심/ }).click();
    await expect.poll(async () => avatarWindow.evaluate(() => window.__somilandMock.trackingMode)).toBe('Face');

    await controlWindow.getByRole('button', { name: '크로마 그린' }).click();
    await expect.poll(async () => avatarWindow.evaluate(() => document.body.classList.contains('sv-bg-green'))).toBe(true);

    await controlWindow.getByRole('button', { name: '웃음' }).click();
    await expect.poll(async () => avatarWindow.evaluate(() => window.__somilandMock.expressionValues.happy)).toBe(1);

    await controlWindow.getByRole('button', { name: 'HD 720p' }).click();
    const bounds = await avatarWindow.evaluate(() => ({ width: window.outerWidth, height: window.outerHeight }));
    expect(bounds.width).toBeGreaterThanOrEqual(640);
  } finally {
    await app.close();
  }
});
