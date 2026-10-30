import { expect, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../playwright.config';

export type SeedUser = 'admin' | 'sales1' | 'ceo';

/** Signs in through the real login form as a seeded demo user. */
export async function signIn(page: Page, who: SeedUser) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`${who}@salescrm.test`);
  await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The login card also says "Welcome back!"; the dashboard's h1 is "Welcome back, <name>".
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1, name: /^Welcome back,/ })).toBeVisible();
}

export const uniq = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
