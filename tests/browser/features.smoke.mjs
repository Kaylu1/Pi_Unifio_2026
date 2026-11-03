import { chromium, expect as playwrightExpect } from '@playwright/test';
const expect = playwrightExpect.configure({ timeout: 20000 });
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Run only against a local, fictitious OScar installation. This test never reads or writes another project.
const baseURL = process.env.OSCAR_BASE_URL || 'https://localhost:4201';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('OSCAR_BASE_URL deve apontar para localhost.');
const stamp = Date.now().toString();
const name = `Cliente Teste Funcional ${stamp}`;
const email = `teste.features.${stamp}@oscar.local`;
const code = `TEST-${stamp}`;
const partName = `Filtro de teste ${stamp}`;
const results = resolve('tests/results/features-' + stamp);
await mkdir(results, { recursive: true });
const chromiumPath = process.env.OSCAR_BROWSER || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;
const browser = await chromium.launch({ headless: true, ...(existsSync(chromiumPath) ? { executablePath: chromiumPath } : {}) });
const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1050 } });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
});
const page = await context.newPage();
const pageErrors = [];
const completed = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.setDefaultTimeout(20000);
let originalSettings;
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function api(method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const session = await fetch('/api/session', { credentials: 'include' }).then(response => response.json());
    const response = await fetch('/api' + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-CSRF-Token': session.csrfToken } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) throw new Error(`${method} ${path}: ${value.error || value.message || response.status}`);
    return value;
  }, { method, path, body });
}
const bootstrap = () => api('GET', '/bootstrap');
async function step(title) { completed.push(title); console.log('PASS ' + title); }
async function choose(scope, label, option, exact = true) {
  const combo=scope.getByRole('combobox', { name: label, exact });
  await combo.focus();await combo.press('Enter');
  if (typeof option === 'number') await page.getByRole('option').nth(option).click();
  else await page.getByRole('option', { name: option, exact }).click();
}
async function save(dialog) { await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).toBeHidden(); }
async function goto(path, heading) { await page.goto(path); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible(); }
function cpf(seed) {
  let base = seed.slice(-9).padStart(9, '0');
  for (let count = 9; count <= 10; count++) {
    let sum = 0; for (let i = 0; i < count; i++) sum += Number(base[i]) * (count + 1 - i);
    const digit = (sum * 10) % 11; base += digit === 10 ? '0' : String(digit);
  }
  return base;
}
try {
  await goto('/entrar', 'Acessar o OScar');
  await page.getByLabel('E-mail', { exact: true }).fill('gerente@oscar.local');
  await page.getByLabel('Senha', { exact: true }).fill('Oscar@2026!');
  await page.getByRole('button', { name: /^Entrar/ }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await step('Login real com gerente fictício');

  await goto('/clientes', 'Clientes');
  await page.getByRole('button', { name: 'Cadastrar cliente', exact: true }).click();
  let dialog = page.getByRole('dialog');
  const saveClient = dialog.getByRole('button', { name: 'Salvar', exact: true });
  await expect(dialog.locator('mat-card.entity-form-card')).toBeVisible();
  await expect(saveClient).toBeDisabled();
  await dialog.getByLabel('Nome completo', { exact: true }).fill(name);
  await dialog.getByLabel('CPF', { exact: true }).fill('11111111111');
  await dialog.getByLabel('Telefone', { exact: true }).fill('14999998888');
  await dialog.getByLabel('E-mail', { exact: true }).fill(email);
  await expect(saveClient).toBeDisabled();
  await expect(dialog.getByText('Informe um CPF válido.', { exact: true })).toBeVisible();
  check(!(await bootstrap()).clients.some(client => client.email === email), 'CPF inválido não pode ser persistido.');
  await dialog.getByLabel('CPF', { exact: true }).fill(cpf(stamp));
  await expect(saveClient).toBeEnabled();
  await save(dialog);
  await page.getByLabel('Pesquisar clientes', { exact: true }).fill(name);
  await expect(page.locator('[data-client-card]').getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Telefone', { exact: true }).fill('14988887777');
  await save(dialog);
  let data = await bootstrap();
  const client = data.clients.find(item => item.email === email);
  check(client?.phone === '14988887777', 'Edição do cliente não foi persistida.');
  check(data.emails.some(item => item.to === email && item.link?.includes('/redefinir/')), 'Convite de acesso deve aparecer na caixa de e-mails local.');
  await step('Cliente: validação de CPF, cadastro, edição e convite de acesso');

  await goto('/veiculos', 'Veículos');
  await page.getByRole('button', { name: 'Cadastrar veículo', exact: true }).click();
  dialog = page.getByRole('dialog');
  await choose(dialog, 'Proprietário', name);
  const plate = `TST${stamp.slice(-1)}A${stamp.slice(-3,-1)}`;
  await dialog.getByLabel('Placa', { exact: true }).fill(plate.toLowerCase());
  await dialog.getByLabel('Chassi', { exact: true }).fill(`9BWZZZ37${stamp.slice(-9)}`);
  await dialog.getByLabel('Marca', { exact: true }).fill('Volkswagen');
  await dialog.getByLabel('Modelo', { exact: true }).fill('Gol de teste');
  await dialog.getByLabel('Ano', { exact: true }).fill('2022');
  await dialog.getByLabel('Quilometragem', { exact: true }).fill('6000');
  await save(dialog);
  await page.getByLabel('Pesquisar veículos', { exact: true }).fill(plate);
  await expect(page.locator('[data-vehicle-card]').getByText(plate, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar veículo', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Quilometragem', { exact: true }).fill('6200');
  await save(dialog);
  data = await bootstrap();
  const vehicle = data.vehicles.find(item => item.plate === plate);
  check(vehicle?.mileage === 6200 && vehicle.clientId === client.id, 'Veículo deve manter proprietário e quilometragem editada.');
  await step('Veículo: vínculo com cliente, normalização de placa e edição');

  await goto('/agenda', 'Agenda da oficina');
  await page.getByRole('button', { name: 'Novo agendamento', exact: true }).click();
  dialog = page.getByRole('dialog');
  await choose(dialog, 'Cliente', name);
  await choose(dialog, 'Veículo do cliente', new RegExp(plate));
  await choose(dialog, 'Serviços solicitados', new RegExp('Troca de óleo'));
  await page.keyboard.press('Escape');
  const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 21); while ([0,6].includes(nextDate.getDay())) nextDate.setDate(nextDate.getDate()+1);
  const date = nextDate.toISOString().slice(0,10);
  await dialog.getByLabel('Data', { exact: true }).fill(date);
  await expect(dialog.getByText('Somente horários livres são exibidos.', { exact: true })).toBeVisible();
  await choose(dialog, 'Horário e mecânico disponível', 0);
  await dialog.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel('Pesquisar agenda da oficina', { exact: true }).fill(name);
  await expect(page.locator('.calendar-event').filter({hasText:name})).toBeVisible();
  await page.locator('.calendar-event').filter({hasText:name}).click();
  data = await bootstrap(); let appointment = data.appointments.find(item => item.clientId === client.id);
  check(appointment?.date === date && appointment.vehicleId === vehicle.id, 'Agendamento não foi persistido corretamente.');
  await page.getByRole('button', { name: 'Remarcar', exact: true }).click();
  dialog = page.getByRole('dialog');
  nextDate.setDate(nextDate.getDate()+1); while([0,6].includes(nextDate.getDay())) nextDate.setDate(nextDate.getDate()+1);
  const movedDate=nextDate.toISOString().slice(0,10);const updatedAvailability=page.waitForResponse(response=>response.url().includes('/api/availability?')&&new URL(response.url()).searchParams.get('date')===movedDate&&response.status()===200);
  await dialog.getByLabel('Data', { exact: true }).fill(movedDate);await updatedAvailability;
  await expect(dialog.getByText('Somente horários livres são exibidos.', { exact: true })).toBeVisible();
  await choose(dialog, 'Horário e mecânico disponível', 0);
  await dialog.getByLabel('Motivo da remarcação', { exact: true }).fill('Solicitação fictícia do cliente para teste.');
  await dialog.getByRole('button', { name: 'Salvar remarcação', exact: true }).click(); await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByLabel('Motivo do cancelamento', { exact: true }).fill('Cancelamento fictício para teste funcional.'); await save(dialog);
  data = await bootstrap(); appointment = data.appointments.find(item => item.id === appointment.id);
  check(appointment.status === 'cancelado' && appointment.reason.includes('teste funcional'), 'Cancelamento deve registrar o motivo.');
  await step('Agenda: disponibilidade real, cadastro, remarcação e cancelamento com motivo');

  await goto('/estoque', 'Peças e estoque');
  await page.getByRole('button', { name: 'Cadastrar peça', exact: true }).click(); dialog = page.getByRole('dialog');
  const codeInput = dialog.getByLabel('Código da peça', { exact: true });
  // Material aplica o foco inicial depois da animação de abertura. Preencher antes disso
  // pode desviar a inserção de um campo numérico para o primeiro input do diálogo.
  await expect(codeInput).toBeFocused();
  await codeInput.fill(code);
  await dialog.getByLabel('Descrição', { exact: true }).fill(partName);
  await dialog.getByRole('spinbutton', { name: 'Custo unitário (R$)', exact: true }).fill('12.5');
  const saleInput = dialog.getByRole('spinbutton', { name: 'Venda unitária (R$)', exact: true });
  await saleInput.focus(); await expect(saleInput).toBeFocused();
  await saleInput.fill('25.25'); await expect(saleInput).toHaveValue('25.25');
  await choose(dialog, 'Fornecedor principal', 'Autopeças Horizonte');
  await expect(page.getByRole('listbox')).toBeHidden();
  await dialog.getByLabel('Estoque mínimo manual', { exact: true }).fill('2');
  await expect(codeInput).toHaveValue(code);
  await expect(saleInput).toHaveValue('25.25');
  await save(dialog);
  await page.getByLabel('Pesquisar peças e estoque', { exact: true }).fill(code);
  await expect(page.getByRole('cell', { name: code, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click(); dialog = page.getByRole('dialog');
  await choose(dialog, 'Peça', partName); await dialog.getByLabel('Quantidade recebida', { exact: true }).fill('5');
  await choose(dialog, 'Fornecedor', 'Autopeças Horizonte'); await save(dialog);
  data = await bootstrap(); const part = data.parts.find(item => item.code === code); const service = data.services.find(item=>item.name==='Troca de óleo'); const mechanic = data.users.find(item=>item.role==='mecanico'&&item.active);
  check(part?.stock === 5 && part.minimum === 2, 'Entrada deve atualizar estoque e preservar mínimo manual.');
  await page.getByRole('button', { name: 'Movimentações', exact: true }).click(); dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('cell', { name: 'entrada', exact: true })).toBeVisible(); await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await step('Estoque: cadastro da peça, entrada real, mínimo manual e histórico');

  const order=await api('POST','/orders',{clientId:client.id,vehicleId:vehicle.id,mechanicId:mechanic.id,serviceIds:[service.id],approvalMethod:'presencial'});
  const withPart=await api('POST',`/orders/${order.id}/items`,{partId:part.id,quantity:2,decision:'aprovado',approvalMethod:'presencial'});
  const item=withPart.items.find(item=>item.partId===part.id);
  for(const status of ['inspecao','aguardando_aprovacao','execucao'])await api('POST',`/orders/${order.id}/status`,{status});
  await api('POST',`/orders/${order.id}/execute`,{itemId:item.id});
  check((await bootstrap()).parts.find(item=>item.id===part.id).stock===3,'Aplicação deve baixar exatamente 2 unidades.');
  await page.goto(`/ordens/${order.id}`);await expect(page.getByRole('heading',{name:new RegExp(`O.S. #${order.number}`)})).toBeVisible();
  await page.getByRole('row').filter({hasText:partName}).getByRole('button',{name:/Estornar/}).click();dialog=page.getByRole('dialog');
  await dialog.getByLabel('Motivo',{exact:true}).fill('Troca da peça de teste.');await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(dialog).toBeHidden();
  await expect.poll(async()=> (await bootstrap()).parts.find(item=>item.id===part.id).stock).toBe(5);
  await goto('/estoque','Peças e estoque');await page.getByLabel('Pesquisar peças e estoque',{exact:true}).fill(code);await page.getByRole('button',{name:'Movimentações',exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('cell',{name:'estorno',exact:true})).toBeVisible();await expect(dialog.getByRole('cell',{name:'Troca da peça de teste.',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
  await step('Estoque: aplicação e estorno real via O.S., com histórico e saldo correto');

  originalSettings=await api('GET','/settings');await goto('/configuracoes','Parâmetros');
  await page.getByLabel('Garantia dos serviços (dias)',{exact:true}).fill('89');await page.getByRole('button',{name:'Salvar parâmetros',exact:true}).click();await expect(page.getByText('Informe pelo menos 90 dias.',{exact:true})).toBeVisible();
  check((await api('GET','/settings')).warrantyDays===originalSettings.warrantyDays,'Garantia menor que 90 dias não deve ser persistida.');
  await page.getByLabel('Garantia dos serviços (dias)',{exact:true}).fill('95');await page.getByRole('button',{name:'Salvar parâmetros',exact:true}).click();
  await expect.poll(async()=>(await api('GET','/settings')).warrantyDays).toBe(95);await api('PUT','/settings',originalSettings);originalSettings=undefined;
  await step('Parâmetros: validação de garantia mínima, alteração e restauração');

  await goto('/clientes','Clientes');await page.getByLabel('Pesquisar clientes',{exact:true}).fill(name);await page.getByRole('button',{name:'Excluir dados pessoais',exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByText(/O histórico operacional será preservado/)).toBeVisible();await dialog.getByRole('button',{name:'Excluir dados pessoais',exact:true}).click();await expect(dialog).toBeHidden();
  await expect.poll(async()=>(await bootstrap()).clients.find(item=>item.id===client.id)?.active).toBe(false);
  data=await bootstrap();const anonymized=data.clients.find(item=>item.id===client.id);check(!JSON.stringify(anonymized).includes(email)&&!JSON.stringify(anonymized).includes(client.cpf),'Dados pessoais devem ser removidos do cadastro.');check(data.orders.some(item=>item.id===order.id),'Anonimização deve preservar o histórico operacional.');
  await step('LGPD: confirmação explícita, anonimização e preservação do histórico');

  await goto('/emails','Caixa de e-mails');await page.getByLabel('Pesquisar destinatário ou assunto',{exact:true}).fill('agendamento');await expect(page.locator('mat-paginator')).toBeVisible();
  await page.setViewportSize({width:375,height:900});await goto('/estoque','Peças e estoque');await page.getByLabel('Pesquisar peças e estoque',{exact:true}).fill(code);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'A página móvel não pode ter rolagem horizontal no body.');await page.screenshot({path:resolve(results,'estoque-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1050});await goto('/agenda','Agenda da oficina');await page.screenshot({path:resolve(results,'agenda-desktop.png'),fullPage:true});
  check(pageErrors.length===0,'Erros no navegador: '+pageErrors.join('; '));await step('Responsividade de 375 px e ausência de erros JavaScript');
  await writeFile(resolve(results,'resultado.json'),JSON.stringify({status:'aprovado',baseURL,completed,pageErrors},null,2));
  console.log(`PASS ${completed.length} etapas. Evidências em ${results}`);
} catch(error) {
  await page.screenshot({path:resolve(results,'falha.png'),fullPage:true}).catch(()=>{});
  await writeFile(resolve(results,'resultado.json'),JSON.stringify({status:'falhou',error:error.stack,completed,pageErrors},null,2));
  throw error;
} finally {
  if(originalSettings)await api('PUT','/settings',originalSettings).catch(()=>{});
  await context.close();await browser.close();
}
