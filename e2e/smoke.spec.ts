import { expect, test } from '@playwright/test';

/**
 * The one end-to-end smoke (spec §14): create a basket in a real browser,
 * fire a webhook at the sink from outside the page, and watch it appear
 * live — no reload. Then verify persistence (reload) and the home list.
 */
test('create → view → live-append → persist', async ({ page, request }) => {
  // Create a basket from the home page.
  await page.goto('/');
  await page.getByRole('button', { name: /create basket/i }).click();

  // We land on the dashboard; the stream connects.
  await expect(page.getByRole('heading', { name: /basket/i })).toBeVisible();
  await expect(page.getByText('live', { exact: true })).toBeVisible();
  await expect(page.getByText(/waiting for the first request/i)).toBeVisible();

  const address = page.url().split('/b/')[1]!;
  expect(address).toMatch(/^[0-9A-Za-z]{12}$/);

  // Fire a "webhook" at the sink from the Node side (not the browser).
  const res = await request.post(`/${address}/hook?src=e2e`, {
    headers: { 'content-type': 'application/json', 'x-e2e': 'yes' },
    data: { hello: 'basket' },
  });
  expect(res.status()).toBe(204);

  // The request card appears live — the page is never reloaded.
  await expect(page.getByText(`/${address}/hook?src=e2e`)).toBeVisible();
  await expect(page.getByText('POST', { exact: true })).toBeVisible();
  await expect(page.getByText(/"hello": "basket"/)).toBeVisible();

  // Reload: the card comes back via the history fetch (SPA fallback + API).
  await page.reload();
  await expect(page.getByText(`/${address}/hook?src=e2e`)).toBeVisible();

  // Home remembers the basket (localStorage list).
  await page.goto('/');
  await expect(page.getByRole('link', { name: new RegExp(address) })).toBeVisible();
});
