import { chromium, expect as playwrightExpect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const expect = playwrightExpect.configure({ timeout: 12000 });
const baseURL = process.env.OSCAR_BASE_URL || 'https://localhost:4212';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname));
const resultDir = resolve('tests/results/theme-' + Date.now());
await mkdir(resultDir, { recursive: true });
const executablePath = process.env.OSCAR_BROWSER || `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;
const browser = await chromium.launch({ headless: true, ...(existsSync(executablePath) ? { executablePath } : {}) });
const errors = [], blockedRequests = [], captures = [], checks = [];
async function context(options = {}) {
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 }, colorScheme: 'light', ...options });
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    blockedRequests.push(url.origin); return route.abort();
  });
  ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return ctx;
}
async function theme(page, value) { if (await page.locator('html').getAttribute('data-theme') !== value) await page.locator('[data-theme-toggle]').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', value); }
async function capture(page, name, width = 1440, height = 960) {
  await page.setViewportSize({ width, height });
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: name + ' não deve transbordar horizontalmente' }).toBe(true);
  await page.screenshot({ path: resolve(resultDir, name + '.png'), fullPage: true, animations: 'disabled' });
  captures.push(name);
}
function luminance(hex) {
  const parts = hex.startsWith('rgb') ? hex.match(/[0-9.]+/g).slice(0, 3).map(Number).map(value => value / 255) : hex.trim().replace('#', '').match(/../g).map(part => parseInt(part, 16) / 255);
  return parts.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
async function contrast(page) {
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['surface','surface-alt','text','text-muted','text-faint','accent','on-accent','accent-soft','accent-strong','warning','warning-soft','danger','danger-soft','success','success-soft'].map(key => [key, style.getPropertyValue('--' + key).trim()]));
  });
  for (const [foreground, background] of [['text','surface'],['text-muted','surface'],['text-faint','surface-alt'],['on-accent','accent'],['accent-strong','accent-soft'],['warning','warning-soft'],['danger','danger-soft'],['success','success-soft']]) {
    const [a, b] = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => b - a);
    assert.ok((a + .05) / (b + .05) >= 4.5, foreground + '/' + background + ' deve ter contraste 4,5:1');
  }
}
try {
  const ctx = await context(), page = await ctx.newPage();
  await page.goto('/entrar');
  await expect(page.getByRole('heading', { name: 'Acessar o OScar', exact: true })).toBeVisible();
  const video = page.locator('video');
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(.1);
  assert.equal(await video.evaluate(element => element.muted), true);
  await page.getByRole('button', { name: 'Pausar vídeo de fundo', exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
  checks.push('Vídeo local reproduz sem áudio; controle de pausa funciona');
  for (const mode of ['light', 'dark']) {
    await theme(page, mode); await contrast(page);
    await capture(page, 'login-' + mode);
    await capture(page, 'login-mobile-' + mode, 375, 812);
  }
  for (const mode of ['light', 'dark']) {
    await theme(page, mode);
    await page.getByLabel('E-mail', { exact: true }).fill('gerente@oscar.local');
    await page.getByLabel('Senha', { exact: true }).fill('SenhaIncorreta@2026');
    await page.getByRole('button', { name: /^Entrar/ }).click();
    const alert = page.locator('.form-error'); await expect(alert).toBeVisible();
    const colors = await alert.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color }));
    const [a, b] = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => b - a);
    assert.ok((a + .05) / (b + .05) >= 4.5, 'Erro de login deve manter contraste nos dois temas');
    if (mode === 'dark') await capture(page, 'login-error-dark', 375, 812);
  }
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('oscar.theme')), 'dark');
  checks.push('Tema escolhido persiste após recarregar; contrastes dos tokens passam em ambos os temas');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByLabel('E-mail', { exact: true }).fill('gerente@oscar.local');
  await page.getByLabel('Senha', { exact: true }).fill('Oscar@2026!');
  await page.getByRole('button', { name: /^Entrar/ }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const mode of ['dark', 'light']) { await theme(page, mode); await capture(page, 'dashboard-' + mode); }
  await theme(page, 'dark'); await capture(page, 'dashboard-mobile-dark', 375, 812);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/estoque'); await expect(page.getByRole('heading', { name: 'Peças e estoque', exact: true })).toBeVisible();
  await capture(page, 'estoque-dark');
  await page.getByRole('button', { name: 'Cadastrar peça', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByLabel('Código da peça', { exact: true })).toBeFocused();
  const combo = dialog.getByRole('combobox', { name: 'Fornecedor principal', exact: true });
  await combo.focus(); await combo.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  const panelColors = await page.locator('.mat-mdc-select-panel').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color }));
  assert.ok(luminance(panelColors.background) < .15, 'O menu deve usar uma superfície escura');
  assert.ok((luminance(panelColors.foreground) + .05) / (luminance(panelColors.background) + .05) >= 4.5, 'O menu escuro deve permanecer legível');
  await capture(page, 'dialog-select-dark'); await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  checks.push('Tema preservado após login e aplicado aos campos, menus e diálogos Material');
  for (const [route, name, mode, width] of [['/ordens','ordens-dark','dark',1440],['/clientes','clientes-mobile-dark','dark',375],['/relatorios','relatorios-dark','dark',1440],['/configuracoes','parametros-mobile-light','light',375],['/catalogo','catalogo-mobile-light','light',375],['/recuperar','recuperar-mobile-dark','dark',320]]) {
    await page.goto(route); await expect(page.locator('[data-theme-toggle]')).toBeVisible(); await theme(page, mode);
    if (route === '/relatorios') await expect(page.locator('.report-period')).toBeVisible();
    await capture(page, name, width, width < 500 ? 812 : 960);
    if (route === '/relatorios') {
      await capture(page, 'relatorios-mobile-dark', 375, 812);
      await page.getByRole('tab', { name: 'Peças' }).click();
      await capture(page, 'relatorios-consumo-mobile-dark', 375, 812);
    }
  }
  await page.getByLabel('E-mail', { exact: true }).fill('nao-cadastrado@oscar.local');
  await page.getByRole('button', { name: 'Enviar instruções', exact: true }).click();
  const success = page.locator('.success-note'); await expect(success).toBeVisible();
  for (const mode of ['light', 'dark']) {
    await theme(page, mode);
    const colors = await success.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color }));
    const [a, b] = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => b - a);
    assert.ok((a + .05) / (b + .05) >= 4.5, 'Mensagem de recuperação deve manter contraste nos dois temas');
  }
  checks.push('Erros de login e confirmação de recuperação legíveis nos dois temas');
  await ctx.close();

  const reduced = await context({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const mediaRequests = [];
  reduced.on('request', request => { if (/workshop-loop\.mp4/.test(request.url())) mediaRequests.push(request.url()); });
  const reducedPage = await reduced.newPage(); await reducedPage.goto('/entrar');
  await expect(reducedPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(reducedPage.locator('video')).toHaveCount(0);
  assert.equal(mediaRequests.length, 0);
  assert.equal(await reducedPage.locator('.login-panel').evaluate(element => getComputedStyle(element).animationDuration), '0s');
  await reducedPage.emulateMedia({ colorScheme: 'light' }); await expect(reducedPage.locator('html')).toHaveAttribute('data-theme', 'light');
  await theme(reducedPage, 'dark'); await reducedPage.emulateMedia({ colorScheme: 'light' });
  await expect(reducedPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  checks.push('Preferência inicial do sistema respeitada; escolha explícita tem prioridade');
  await reducedPage.getByRole('button', { name: 'Reproduzir vídeo de fundo', exact: true }).click();
  await expect.poll(() => reducedPage.locator('video').evaluate(element => element.currentTime)).toBeGreaterThan(.1);
  checks.push('Movimento reduzido evita baixar/reproduzir vídeo; usuário pode ativá-lo explicitamente');
  await reduced.close();

  const fallback = await context();
  await fallback.route('**/workshop-loop.mp4', route => route.abort());
  const fallbackPage = await fallback.newPage(); await fallbackPage.goto('/entrar');
  await expect(fallbackPage.locator('video')).toHaveCount(0);
  await expect(fallbackPage.locator('.login-still')).toBeVisible();
  await expect(fallbackPage.getByRole('heading', { name: 'Acessar o OScar', exact: true })).toBeVisible();
  checks.push('Falha no vídeo mantém pôster e formulário acessível');
  await fallback.close();
  assert.deepEqual(errors, []); assert.deepEqual(blockedRequests, []);
  checks.push('Zero erros JavaScript e zero dependências de rede externa');
  await writeFile(resolve(resultDir, 'result.json'), JSON.stringify({ passed: true, checks, captures, pageErrors: errors, externalRequests: blockedRequests }, null, 2));
  console.log('PASS: temas claro/escuro, persistência, vídeo local, pausa, fallback, movimento reduzido e telas responsivas. Evidências: ' + resultDir);
} finally { await browser.close(); }