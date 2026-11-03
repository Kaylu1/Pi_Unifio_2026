import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect as originalExpect } from '@playwright/test';
const expect=originalExpect.configure({timeout:15000});
const baseURL=process.env.OSCAR_BASE_URL||'https://localhost:4212';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname));
const output=resolve('tests/results/layouts-'+Date.now());await mkdir(output,{recursive:true});
const executablePath=process.env.OSCAR_BROWSER||process.env.LOCALAPPDATA+'/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{})});
const ctx=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[],external=[],checks=[],captures=[];
await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1','[::1]'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
async function api(method,path,body){return page.evaluate(async({method,path,body})=>{const session=await fetch('/api/session').then(r=>r.json());const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(method==='GET'?{}:{'X-CSRF-Token':session.csrfToken})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();if(!response.ok)throw new Error(method+' '+path+': '+JSON.stringify(value));return value;},{method,path,body});}
async function choose(label,option,scope=page){const select=scope.getByRole('combobox',{name:label,exact:true});await select.focus();await select.press('Enter');await page.getByRole('option',{name:option}).first().click();}
async function theme(value){if(await page.locator('html').getAttribute('data-theme')!==value)await page.locator('[data-theme-toggle]').click();await expect(page.locator('html')).toHaveAttribute('data-theme',value);await page.mouse.move(0,0);}
async function capture(name,width=1440,mode='light') {await page.setViewportSize({width,height:1000});await theme(mode);await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' tem overflow horizontal');await page.screenshot({path:resolve(output,name+'.png'),fullPage:true,animations:'disabled'});captures.push(name);}
let originalService;
try{
 await page.goto('/catalogo');await expect(page.getByRole('heading',{name:'Serviços da oficina',exact:true})).toBeVisible();await expect(page.locator('.catalogue-service').first()).toBeVisible();
 const services=await api('GET','/public/services');const available=Array.isArray(services)?services:services.items||services.services||[];
 await page.getByRole('button',{name:/^Até 1 hora/}).click();await expect(page.locator('.catalogue-service')).toHaveCount(available.filter(service=>service.durationMinutes<=60).length);
 await page.getByLabel('Buscar serviço',{exact:true}).fill('óleo');await expect(page.locator('.catalogue-service')).toHaveCount(1);await page.getByRole('button',{name:'Troca de óleo',exact:true}).click();await expect(page.locator('.catalogue-service.is-open .service-detail')).toBeVisible();
 await page.getByRole('button',{name:'Limpar busca',exact:true}).click();await page.getByRole('button',{name:/^Todos os serviços/}).click();await choose('Ordenar por','Menor valor');
 await capture('catalogue-desktop-light');await capture('catalogue-mobile-dark',375,'dark');checks.push('Catálogo editorial: busca, filtro por duração, expansão, ordenação e dois temas');
 await page.goto('/entrar');await page.getByLabel('E-mail',{exact:true}).fill('gerente@oscar.local');await page.getByLabel('Senha',{exact:true}).fill('Oscar@2026!');await page.getByRole('button',{name:/^Entrar/}).click();await expect(page).toHaveURL(/\/painel$/);await page.setViewportSize({width:1440,height:1000});
 for(const [route,selector,name] of [['/clientes','[data-client-card]','clients'],['/veiculos','[data-vehicle-card]','vehicles'],['/servicos','[data-service-option]','services'],['/fornecedores','[data-supplier-card]','suppliers'],['/usuarios','[data-user-card]','team']]){
  await page.goto(route);await expect(page.locator(selector).first()).toBeVisible();assert.equal(await page.locator('.main-content .data-table').count(),0,route+' deve ter composição própria');await capture(name+'-desktop-light');if(route==='/clientes'||route==='/veiculos'||route==='/servicos')await capture(name+'-mobile-dark',375,'dark');
  if(route==='/clientes'||route==='/servicos'){
   const client=route==='/clientes';
   if(client)await page.locator('[data-client-card]').filter({hasText:'Camila Santos'}).getByRole('button',{name:/Ver ficha/}).click();
   else await page.locator('[data-service-option]').filter({hasText:'Diagnóstico eletrônico'}).click();
   const title=page.locator(client?'#client-context-title':'#service-detail-title');
   await expect(title).toBeFocused();
   await expect.poll(async()=>{const box=await title.boundingBox();return!!box&&box.y>=0&&box.y+box.height<=page.viewportSize().height;}).toBe(true);
   const shot=(client?'clients':'services')+'-selection-mobile-dark';await page.screenshot({path:resolve(output,shot+'.png'),animations:'disabled'});captures.push(shot);
  }
 }
 checks.push('Clientes, frota, serviços, fornecedores e equipe usam composições próprias com dados reais');
 await page.goto('/servicos');await page.getByLabel('Pesquisar catálogo de serviços',{exact:true}).fill('Diagnóstico eletrônico');await page.locator('[data-service-option]').click();
 const data=await api('GET','/bootstrap');originalService=data.services.find(service=>service.name==='Diagnóstico eletrônico');assert.equal(originalService.purpose,'avaliacao');
 await page.getByRole('button',{name:'Editar serviço',exact:true}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Nome do serviço',{exact:true})).toBeFocused();
 await choose('Finalidade do serviço','Avaliação / diagnóstico inicial',dialog);await dialog.getByLabel('Valor de venda (R$)',{exact:true}).fill('317.45');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).toBeHidden();
 assert.equal((await api('GET','/bootstrap')).services.find(s=>s.id===originalService.id).price,317.45);
 await page.goto('/ordens');await theme('light');await page.getByRole('button',{name:'Abrir ordem',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Avaliação inicial',exact:true}).click();
 await choose('Cliente','Mariana Oliveira',dialog);await choose('Veículo',/ABC1D23/,dialog);await choose('Mecânico responsável','Rafael Lima',dialog);await expect(dialog.getByLabel('Serviço de avaliação',{exact:true})).toContainText('317,45');
 await dialog.getByLabel('Relato inicial do cliente',{exact:true}).fill('Ruído ao ligar o motor. Avaliar antes de trocar peças.');await capture('evaluation-create-desktop-light');
 const created=page.waitForResponse(response=>response.url().endsWith('/api/orders')&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Abrir ordem',exact:true}).click();const response=await created;assert.equal(response.status(),201);const value=await response.json(),order=value.order||value;await expect(page).toHaveURL(new RegExp('/ordens/'+order.id+'$'));
 assert.equal(order.startMode,'avaliacao');assert.equal(order.items.find(item=>item.serviceId===originalService.id).price,317.45);assert.equal(order.items.find(item=>item.serviceId===originalService.id).servicePurpose,'avaliacao');
 await page.locator('.assessment-overview').getByRole('button',{name:'Iniciar inspeção',exact:true}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.locator('h1 .status-pill')).toHaveText('Em inspeção');
 const before=(await api('GET','/bootstrap')).parts.find(part=>part.description==='Pastilha de freio dianteira');
 await page.route('**/api/orders/'+order.id,async route=>{if(route.request().method()==='GET')await new Promise(resolve=>setTimeout(resolve,180));await route.continue();});
 await page.locator('.assessment-overview').getByRole('button',{name:'Registrar necessidade',exact:true}).click();dialog=page.getByRole('dialog');await choose('Tipo','Peça',dialog);await choose('Peça','Pastilha de freio dianteira',dialog);await dialog.getByLabel('Justificativa técnica',{exact:true}).fill('Desgaste identificado durante a avaliação inicial.');await dialog.getByRole('button',{name:'Registrar item',exact:true}).click();await expect(dialog).toBeHidden();
 await page.locator('.assessment-overview').getByRole('button',{name:'Preparar orçamento',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(dialog).toBeHidden();
 const details=await api('GET','/orders/'+order.id);assert.ok(details.budgets.some(budget=>budget.items.some(item=>item.partId===before.id&&item.decision==='pendente')));assert.equal((await api('GET','/bootstrap')).parts.find(part=>part.id===before.id).stock,before.stock);await capture('evaluation-order-desktop-dark',1440,'dark');await capture('evaluation-order-mobile-dark',375,'dark');checks.push('Avaliação usa preço configurado317,45, inicia inspeção e adiciona peça pendente ao orçamento sem baixar estoque');
 await api('PUT','/services/'+originalService.id,{price:originalService.price});originalService=undefined;
 await page.goto('/agenda');await page.setViewportSize({width:1440,height:1000});const future=new Date();future.setDate(future.getDate()+8);while([0,6].includes(future.getDay()))future.setDate(future.getDate()+1);const date=`${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`;
 await page.getByLabel('Data da agenda',{exact:true}).fill(date);await expect(page.locator('.calendar-scroll')).toBeVisible();await expect(page.getByText('18:00',{exact:true})).toBeVisible();
 const slot=page.locator('.slot-button:enabled').first();await slot.click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Data',{exact:true})).toHaveValue(date);await choose('Serviços solicitados',/Troca de óleo/,dialog);await page.keyboard.press('Escape');await expect(dialog.getByText('Somente horários livres são exibidos.',{exact:true})).toBeVisible();await expect(dialog.getByRole('combobox',{name:'Horário e mecânico disponível',exact:true})).toContainText(/\d{2}:\d{2}/);await dialog.getByRole('button',{name:'Voltar',exact:true}).click();
 await page.getByRole('button',{name:'Hoje',exact:true}).click();await expect(page.locator('.scroll-guidance')).toBeVisible();await capture('agenda-desktop-light');await capture('agenda-mobile-dark',375,'dark');await capture('agenda-small-dark',320,'dark');checks.push('Agenda8–18 por mecânico, horário livre preenche data e só seleciona slot confirmado na API, mobile320/375semoverflow');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,checks,captures,pageErrors:errors,externalRequests:external},null,2));console.log('PASS: avaliação configurável, composições próprias, catálogo e agenda8–18. Evidências: '+output);
}catch(error){await page.screenshot({path:resolve(output,'failure.png'),fullPage:true,animations:'disabled'}).catch(()=>{});await writeFile(resolve(output,'failure.txt'),String(error.stack||error));throw error;}
finally{if(originalService)await api('PUT','/services/'+originalService.id,{price:originalService.price}).catch(()=>{});await browser.close();}