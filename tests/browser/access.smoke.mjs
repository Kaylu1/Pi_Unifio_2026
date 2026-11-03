import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base=process.env.OSCAR_BASE_URL||'https://localhost:4201';
const executablePath=process.env.OSCAR_BROWSER||'C:/Users/Kaylu/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const browser=await chromium.launch({headless:true,executablePath});
try {
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:375,height:900},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/relatorios');await expect(page).toHaveURL(base+'/entrar');
 await page.getByLabel('E-mail',{exact:true}).fill('cliente@oscar.local');await page.getByLabel('Senha',{exact:true}).fill('Oscar@2026!');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Seus atendimentos',exact:true})).toBeVisible();
 await page.goto(base+'/relatorios');await expect(page).toHaveURL(base+'/painel');
 const response=await context.request.get(base+'/api/bootstrap');assert.equal(response.status(),200);const data=await response.json();
 assert(data.clients.length===1&&data.clients[0].email==='cliente@oscar.local');assert(data.orders.every(o=>o.clientId===data.clients[0].id));assert(data.emails.length===0&&data.users.every(u=>!u.passwordHash));assert.equal((await context.request.get(base+'/api/emails')).status(),403);
 await page.getByRole('button',{name:'Menu da conta',exact:true}).click();await page.getByRole('menuitem',{name:'Sair da conta',exact:true}).click();await expect(page).toHaveURL(base+'/entrar');
 assert.equal(errors.length,0);
 console.log('PASS: visitante protegido, perfil cliente bloqueado em relatórios, isolamento dos dados e logout.');
} finally {await browser.close();}
