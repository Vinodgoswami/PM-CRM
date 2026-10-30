import { expect, test } from '@playwright/test';
import { signIn, uniq } from './helpers';

// docs/08 key flows, run against the seeded demo data (fresh database per run).

test('F1 add a project for a new client', async ({ page }) => {
  await signIn(page, 'pm1');
  await page.goto('/projects/new');
  const client = uniq('E2E Client');
  await page.getByRole('combobox', { name: 'Client' }).click();
  await page.getByPlaceholder('Search clients…').fill(client);
  await page.getByRole('option', { name: /add new client/i }).click();
  await expect(page.getByLabel('New client name')).toHaveValue(client);
  await page.getByLabel('Client email').fill('accounts@e2e.test');
  await page.getByLabel('Project name').fill('E2E Website');
  await page.getByLabel('Expected amount').fill('1,00,000');
  await page.getByRole('button', { name: 'Add milestone' }).click();
  await page.getByLabel('Milestone 1 task').fill('Design');
  await page.getByLabel('Milestone 1 amount').fill('40,000');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole('heading', { name: /E2E Website/ })).toBeVisible();
  await expect(page.getByText(client).first()).toBeVisible();
});

test('F2 mark a milestone as paid', async ({ page }) => {
  await signIn(page, 'pm1');
  await page.goto('/invoices');
  const pay = page.getByRole('button', { name: /^Mark M\d+ .+ as paid$/ }).first();
  await pay.click();
  const dialog = page.getByRole('dialog');
  const invoice = uniq('INV-E2E').replace(' ', '-');
  await dialog.getByLabel('Invoice ID').fill(invoice);
  await dialog.getByRole('button', { name: 'Save payment' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/billing');
  await expect(page.getByRole('cell', { name: invoice, exact: true })).toBeVisible();
});

test('F3 an Admin reverses a wrong payment', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/billing');
  const row = page
    .getByRole('row')
    .filter({ hasNot: page.getByText('Reversal') })
    .nth(1);
  await row.getByRole('link').first().click();
  await page.getByRole('tab', { name: 'Payments' }).click();
  const reverse = page.getByRole('button', { name: /^Reverse payment / }).first();
  await reverse.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reason').fill('E2E: wrong amount');
  await dialog.getByRole('button', { name: 'Reverse payment' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('E2E: wrong amount')).toBeVisible();
});

test('F4 add an extra work amount to a confirmed project', async ({ page }) => {
  await signIn(page, 'pm1');
  await page.goto('/invoices');
  await page.locator('a[href^="/projects/"]').first().click();
  await page.getByRole('tab', { name: 'Extra work' }).click();
  await page.getByLabel('Amount').fill('25,000');
  const note = uniq('E2E extra pages');
  await page.getByLabel('Note').fill(note);
  await page.getByRole('button', { name: 'Add extra work amount' }).click();
  await expect(page.getByText(note)).toBeVisible();
});

test('F5 CEO weekly check: quarter view, team, overdue invoices, PDF', async ({ page }) => {
  await signIn(page, 'ceo');
  // Project managers report quarterly: the dashboard opens on this quarter.
  await expect(page.getByRole('radio', { name: 'Quarter' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: 'Team performance' })).toBeVisible();

  await page.getByRole('link', { name: 'Upcoming Invoices' }).first().click();
  await expect(page.getByRole('region', { name: /^Overdue — \d+/ })).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});
