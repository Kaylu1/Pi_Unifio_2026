import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const base=process.env.OSCAR_BASE_URL||'https://localhost:4201';
const output=path.resolve('tests/results/flow-'+Date.now());
await fs.mkdir(output,{recursive:true});
const executablePath=process.env.OSCAR_BROWSER||'C:/Users/Kaylu/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const browser=await chromium.launch({headless:true,executablePath});
const errors=[];
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1080},reducedMotion:'reduce'});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
let csrf='';
async function api(method,endpoint,body,status=200){
 const r=await context.request.fetch(base+'/api'+endpoint,{method,data:body,headers:{Origin:base,...(csrf?{'X-CSRF-Token':csrf}:{})}});
 const text=await r.text();assert.equal(r.status(),status,method+' '+endpoint+': '+text);return text?JSON.parse(text):null;
}
async function choose(label,option){await page.getByLabel(label,{exact:true}).focus();await page.getByLabel(label,{exact:true}).press('Enter');await page.getByRole('option',{name:option}).first().click();}
async function stage(label){
 await page.getByRole('button',{name:'Alterar etapa',exact:true}).click();
 await page.getByRole('menuitem',{name:label,exact:true}).click();
 const done=page.waitForResponse(r=>r.url().endsWith('/status')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();
 assert.equal((await done).status(),200);
 await expect(page.locator('h1 .status-pill')).toHaveText(label);
}
try{
 await page.goto(base+'/catalogo');await expect(page.getByRole('heading',{name:'Serviços da oficina',exact:true})).toBeVisible();
 await expect(page.locator('.service-card')).toHaveCount(6);
 await page.goto(base+'/entrar');
 await page.getByLabel('E-mail',{exact:true}).fill('gerente@oscar.local');await page.getByLabel('Senha',{exact:true}).fill('Oscar@2026!');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Painel da oficina',exact:true})).toBeVisible();
 csrf=(await api('GET','/session')).csrfToken;
 for(const width of [1920,1280,320]){
  await page.setViewportSize({width,height:1080});
  await page.evaluate(()=>document.fonts.ready);
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(dimensions.scroll<=dimensions.width,'Body overflow at '+width+': '+JSON.stringify(dimensions));
  await page.screenshot({path:path.join(output,'painel-'+width+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1080});
 await page.goto(base+'/ordens');await page.getByRole('button',{name:'Abrir ordem',exact:true}).click();
 await choose('Cliente','Mariana Oliveira');await choose('Veículo',/ABC1D23/);await choose('Mecânico responsável','Rafael Lima');
 await page.getByLabel('Serviços contratados',{exact:true}).focus();await page.getByLabel('Serviços contratados',{exact:true}).press('Enter');await page.getByRole('option',{name:/Troca de óleo/}).click();await page.keyboard.press('Escape');
 const create=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Abrir ordem',exact:true}).click();const created=await create;assert.equal(created.status(),201,await created.text());const order=await created.json();
 await expect(page).toHaveURL(new RegExp('/ordens/'+order.id+'$'));await expect(page.getByRole('heading',{name:new RegExp('O.S. #'+order.number)})).toBeVisible();
 await stage('Em inspeção');
 await page.getByRole('tab',{name:'Folha de verificação',exact:true}).click();
 const first=page.locator('.inspection-item').first();await first.getByLabel('Resultado',{exact:true}).focus();await first.getByLabel('Resultado',{exact:true}).press('Enter');await page.getByRole('option',{name:'Conforme',exact:true}).click();await first.getByLabel('Observação').fill('Inspeção funcional de teste local');
 const inspected=page.waitForResponse(r=>r.url().endsWith('/inspection')&&r.request().method()==='POST');await first.getByRole('button',{name:'Salvar resultado da inspeção'}).click();assert.equal((await inspected).status(),200);
 await page.getByRole('button',{name:'Registrar necessidade',exact:true}).click();
 await choose('Tipo','Peça');await choose('Peça','Pastilha de freio dianteira');
 await page.getByLabel('Justificativa técnica',{exact:true}).fill('Desgaste identificado no teste de inspeção local.');
 const finding=page.waitForResponse(r=>r.url().endsWith('/findings')&&r.request().method()==='POST');await page.getByRole('button',{name:'Registrar item',exact:true}).click();assert.equal((await finding).status(),200);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('tab',{name:'Orçamentos',exact:true}).click();await page.getByRole('button',{name:'Novo orçamento',exact:true}).click();await expect(page.getByLabel('Descrição do item 1',{exact:true})).toHaveValue('Pastilha de freio dianteira');
 const drafted=page.waitForResponse(r=>r.url().endsWith('/budgets')&&r.request().method()==='POST');await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();assert.equal((await drafted).status(),201);
 await expect(page.getByRole('button',{name:'Disponibilizar ao cliente',exact:true})).toBeVisible();
 const published=page.waitForResponse(r=>r.url().endsWith('/publish')&&r.request().method()==='POST');await page.getByRole('button',{name:'Disponibilizar ao cliente',exact:true}).click();assert.equal((await published).status(),200);
 const link=await page.getByLabel('Link para encaminhar',{exact:true}).inputValue();assert(link.startsWith(base+'/orcamento/'));
 await page.screenshot({path:path.join(output,'ordem-orcamento.png'),fullPage:true});
 const publicContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:375,height:920}});
 const publicPage=await publicContext.newPage();publicPage.on('pageerror',e=>errors.push(e.message));
 const token=link.split('/').at(-1);const publicJson=await publicContext.request.get(base+'/api/public/budgets/'+token);assert.equal(publicJson.status(),200);const publicData=await publicJson.json();const serialized=JSON.stringify(publicData);
 assert(!serialized.includes('12345678909')&&!serialized.includes('cliente@oscar.local')&&!serialized.includes('Mariana Oliveira')&&!serialized.includes('ABC1D23')&&!serialized.includes('9BWZZZ377VT004251'),'Public budget leaked personal data');
 await publicPage.goto(link);await expect(publicPage.getByRole('heading',{name:'Olá, Mariana.',exact:true})).toBeVisible();
 await publicPage.getByLabel('Sua decisão para este item',{exact:true}).focus();await publicPage.getByLabel('Sua decisão para este item',{exact:true}).press('Enter');await publicPage.getByRole('option',{name:'Aprovar item',exact:true}).click();
 await publicPage.screenshot({path:path.join(output,'aprovacao-mobile.png'),fullPage:true});
 const answered=publicPage.waitForResponse(r=>r.url().endsWith('/public/budgets/'+token)&&r.request().method()==='POST');await publicPage.getByRole('button',{name:'Confirmar minhas escolhas',exact:true}).click();assert.equal((await answered).status(),200);await expect(publicPage.getByRole('heading',{name:'Suas escolhas foram registradas.',exact:true})).toBeVisible();
 assert([404,410].includes((await publicContext.request.get(base+'/api/public/budgets/'+token)).status()),'Answered link must be unavailable');
 await publicContext.close();
 await page.goto(base+'/ordens/'+order.id);await expect(page.locator('h1 .status-pill')).toHaveText('Em execução');
 await api('POST','/orders/'+order.id+'/status',{status:'concluida'},409);
 let count=await page.getByRole('button',{name:/^(Registrar execução|Aplicar peça)$/}).count();
 while(count>0){
  const exec=page.waitForResponse(r=>r.url().endsWith('/execute')&&r.request().method()==='POST');await page.getByRole('button',{name:/^(Registrar execução|Aplicar peça)$/}).first().click();assert.equal((await exec).status(),200);
  --count;await expect(page.getByRole('button',{name:/^(Registrar execução|Aplicar peça)$/})).toHaveCount(count);
 }
 await stage('Concluída');await stage('Encerrada');
 const closed=(await api('GET','/orders/'+order.id)).order;assert(closed.closedAt);assert(closed.items.every(i=>i.decision!=='aprovado'||i.executedAt));
 await page.screenshot({path:path.join(output,'ordem-encerrada.png'),fullPage:true});
 await page.goto(base+'/ordens/'+order.id);await expect(page.locator('h1 .status-pill')).toHaveText('Encerrada');
 assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,orderId:order.id,number:order.number,resolutions:[320,1280,1920],publicBudgetPrivacy:true,oneTimeLink:true,closureGuard:true,persistedAfterReload:true,pageErrors:errors},null,2));
 console.log('PASS: fluxo real navegador/API/SQLite, privacidade, aprovação, execução, encerramento e responsividade320/1280/1920. Evidências: '+output);
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(output,'failure.txt'),String(error.stack||error));throw error;}
finally{await browser.close();}
