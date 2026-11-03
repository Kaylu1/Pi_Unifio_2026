import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const baseURL = process.env.OSCAR_BASE_URL || 'https://localhost:4201';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('OSCAR_BASE_URL deve apontar para localhost.');
}
const chromiumPath = process.env.OSCAR_BROWSER || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({ headless: true, ...(existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}) });
const context = await browser.newContext({
  baseURL,
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto('/entrar');
  await page.getByLabel('E-mail', { exact: true }).fill('gerente@oscar.local');
  await page.getByLabel('Senha', { exact: true }).fill('Oscar@2026!');
  await page.getByRole('button', { name: /^Entrar/ }).click();
  await expect(page).toHaveURL(/\/painel$/);

  const sidebar = page.locator('#primary-navigation');
  await expect(sidebar).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await page.getByRole('button', { name: 'Recolher navegação' }).click();
  await expect(sidebar).toBeHidden();
  await page.getByRole('button', { name: 'Abrir navegação' }).click();
  await expect(sidebar).toBeVisible();
  await sidebar.locator('a[href="/clientes"]').click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(sidebar.locator('a[href="/clientes"]')).toHaveClass(/active/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(sidebar.locator('a[href="/clientes"]')).toHaveClass(/active/);

  await page.getByRole('button', { name: 'Cadastrar cliente', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nome completo', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('CPF', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(sidebar).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Abrir navegação' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeVisible();
  await sidebar.locator('a[href="/servicos"]').click();
  await expect(page.getByRole('heading', { name: 'Catálogo de serviços', exact: true })).toBeVisible();
  await expect(sidebar).toBeHidden();

  await page.goto('/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: topo, menu, rota ativa, cadastro Material, acesso direto, recarga e navegação móvel.');
} finally {
  await browser.close();
}