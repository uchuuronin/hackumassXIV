// The "My details" card: where the person, or a family member, types in what Milo may fill.
import { expect, test, type Page } from '@playwright/test';

async function mount(page: Page) {
  await page.goto('/shared/blank.html');
  await page.addScriptTag({ url: '/.tmp-panel.js' });
  await page.getByRole('heading', { name: 'My details' }).waitFor();
}

test('save, and find it still there next time', async ({ page }) => {
  await mount(page);
  await page.getByLabel('First name').fill('Rose');
  await page.getByLabel('Last name').fill('Marchetti');
  await page.getByLabel('Street address').fill('12 Orchard Lane');
  await page.getByLabel('State').fill('Massachusetts');
  await page.getByRole('button', { name: 'Save my details' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved. These stay on this computer.');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('guide:details')!))).toEqual({
    givenName: 'Rose',
    familyName: 'Marchetti',
    addressLine1: '12 Orchard Lane',
    state: 'Massachusetts',
  });
  await mount(page);
  await expect(page.getByLabel('First name')).toHaveValue('Rose');
});

test('only name, address, phone and email: nowhere to put a card, a password or a date of birth', async ({ page }) => {
  await mount(page);
  const labels = await page.locator('label').allTextContents();
  expect(labels).toEqual(['First name', 'Last name', 'Email', 'Phone', 'Street address', 'Apartment or unit (if you have one)', 'Town or city', 'State', 'ZIP code', 'Country']);
  await expect(page.getByText('Milo never saves card numbers or passwords.')).toBeVisible();
});

test('clearing asks first, and can be backed out of', async ({ page }) => {
  await mount(page);
  await page.getByLabel('First name').fill('Rose');
  await page.getByRole('button', { name: 'Save my details' }).click();
  await page.getByRole('button', { name: 'Remove my details' }).click();
  await expect(page.getByText('Remove everything saved here?')).toBeVisible();
  await page.getByRole('button', { name: 'No, keep them' }).click();
  await expect(page.getByLabel('First name')).toHaveValue('Rose');
  await page.getByRole('button', { name: 'Remove my details' }).click();
  await page.getByRole('button', { name: 'Yes, remove them' }).click();
  await expect(page.getByRole('status')).toHaveText('Removed. Nothing is saved now.');
  await expect(page.getByLabel('First name')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('guide:details'))).toBeNull();
});

test('follows the interface rules: large text, large buttons, every box labelled, works by keyboard', async ({ page }) => {
  await mount(page);
  const sizes = await page.evaluate(() => ({
    text: Math.min(...[...document.querySelectorAll('label, input, button, p')].map((e) => parseFloat(getComputedStyle(e).fontSize))),
    buttons: Math.min(...[...document.querySelectorAll('button')].map((e) => e.getBoundingClientRect().height)),
    inputs: Math.min(...[...document.querySelectorAll('input')].map((e) => e.getBoundingClientRect().height)),
    unlabelled: [...document.querySelectorAll('input')].filter((i) => !(i as HTMLInputElement).labels?.length).length,
  }));
  expect(sizes.text).toBeGreaterThanOrEqual(18);
  expect(sizes.buttons).toBeGreaterThanOrEqual(48);
  expect(sizes.inputs).toBeGreaterThanOrEqual(48);
  expect(sizes.unlabelled).toBe(0);
  await page.getByLabel('First name').focus();
  await page.keyboard.type('Rose');
  await page.keyboard.press('Enter'); // Enter saves, with no pointing needed
  await expect(page.getByRole('status')).toHaveText('Saved. These stay on this computer.');
});
