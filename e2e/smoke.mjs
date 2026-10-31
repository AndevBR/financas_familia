// Teste de ponta a ponta: percorre os fluxos principais no navegador real.
// Uso: npm run build && npx vite preview --port 4173 & node e2e/smoke.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// arquivos de comprovante de exemplo
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comprovantes-'));
const pdfPath = path.join(tmp, 'boleto-luz.pdf');
fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const pngPath = path.join(tmp, 'pix.png');
fs.writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS_DIR;
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'pt-BR', acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const step = (s) => console.log(`• ${s}`);
const expectText = async (text) => {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });
};
const modal = () => page.locator('.modal');
/** Aguarda o toast de sucesso e o fechamento do modal. */
const saved = async (text) => {
  await page.locator('.toast', { hasText: text }).last().waitFor({ timeout: 5000 });
  await page.locator('.modal').waitFor({ state: 'detached', timeout: 5000 });
};

await page.goto(BASE);
await expectText('Bem-vindo ao Finanças da Família');
step('primeiro acesso exibe boas-vindas');

// --- conta com saldo inicial
await page.click('a[href="#/contas"]');
await page.locator('.card.stat', { hasText: 'Conta principal' }).getByLabel('Editar conta').click();
// digita tecla por tecla, como uma pessoa (vírgula no meio não pode apagar o valor)
await modal().locator('input.money').fill('');
await modal().locator('input.money').pressSequentially('5000,19');
await modal().getByRole('button', { name: 'Salvar' }).click();
await expectText('R$ 5.000,19');
step('saldo inicial da conta');

// --- lançamento rápido via tecla N
await page.click('a[href="#/"]');
await page.keyboard.press('n');
await modal().getByLabel('Valor', { exact: true }).pressSequentially('338,19');
if ((await modal().getByLabel('Valor', { exact: true }).inputValue()) !== '338,19') throw new Error('Campo de valor não aceitou centavos');
await modal().getByLabel('Valor', { exact: true }).fill('80');
await modal().locator('#qe-merchant').fill('iFood');
await modal().getByLabel('Categoria', { exact: true }).selectOption({ label: 'Aplicativos' });
await modal().getByLabel('Subcategoria').selectOption({ label: 'Alimentação' });
await page.keyboard.press('Enter');
await saved('Despesa lançada');
step('despesa rápida com Enter');

// --- memória do estabelecimento
await page.keyboard.press('n');
await modal().getByLabel('Valor', { exact: true }).fill('45');
await modal().locator('#qe-merchant').fill('ifo');
await page.locator('.ac-item', { hasText: 'iFood' }).click();
const catSel = await modal().getByLabel('Categoria', { exact: true }).inputValue();
if (!catSel) throw new Error('Categoria não foi sugerida pelo estabelecimento');
await modal().getByLabel('Subcategoria').selectOption({ label: 'Farmácia' });
await modal().getByRole('button', { name: /^Salvar/ }).last().click();
await saved('Despesa lançada');
step('estabelecimento sugere categoria');

// --- receita
await page.keyboard.press('n');
await modal().getByRole('tab', { name: 'Receita' }).click();
await modal().getByLabel('Valor', { exact: true }).fill('6000');
await modal().getByLabel('Descrição').fill('Salário');
await modal().getByLabel('Categoria', { exact: true }).selectOption({ label: 'Receitas' });
await page.keyboard.press('Enter');
await saved('Receita lançada');

// --- conta a pagar em aberto + pagamento parcial
await page.click('a[href="#/pagar"]');
await page.getByRole('button', { name: 'Nova conta a pagar' }).click();
await modal().getByLabel('Valor', { exact: true }).fill('300');
await modal().getByLabel('Descrição').fill('Conta de luz');
await modal().getByLabel('Categoria', { exact: true }).selectOption({ label: 'Casa' });
await modal().getByLabel('Subcategoria').selectOption({ label: 'Energia' });
await page.keyboard.press('Enter');
await expectText('Conta de luz');
await page.locator('tr', { hasText: 'Conta de luz' }).getByRole('button', { name: 'Pagar' }).click();
await modal().getByLabel('Valor do pagamento').fill('100');
await modal().getByLabel('Arquivo do comprovante').setInputFiles(pdfPath);
await modal().getByText('boleto-luz.pdf').waitFor();
await modal().getByRole('button', { name: 'Confirmar' }).click();
await saved('Pagamento parcial registrado');
await page.locator('tr', { hasText: 'Conta de luz' }).getByText('Parcial').waitFor();
await page.locator('tr', { hasText: 'Conta de luz' }).getByLabel('Ver comprovantes (1)').waitFor();
step('conta a pagar + pagamento parcial com comprovante');

// comprovante anexado depois, numa conta já paga
await page.getByRole('tab', { name: 'Pagas' }).click();
await page.locator('tr', { hasText: 'iFood' }).first().getByLabel('Anexar comprovante').click();
await modal().getByLabel('Arquivo do comprovante').setInputFiles(pngPath);
await page.locator('.toast', { hasText: 'Comprovante anexado' }).waitFor();
await modal().getByLabel('Ver pix.png').first().click();
await modal().locator('.attach-preview img').waitFor();
await modal().getByLabel('Excluir pix.png').click();
await page.locator('.modal').last().getByRole('button', { name: 'Excluir' }).click();
await page.locator('.toast', { hasText: 'Comprovante excluído' }).waitFor();
if (await modal().locator('.attach-preview').count()) throw new Error('Prévia continuou aberta após excluir');
await modal().getByLabel('Arquivo do comprovante').setInputFiles(pngPath);
await page.locator('.toast', { hasText: 'Comprovante anexado' }).last().waitFor();
await shot('comprovantes');
await modal().getByRole('button', { name: 'Fechar' }).last().click();
await page.locator('tr', { hasText: 'iFood' }).first().getByLabel('Ver comprovantes (1)').waitFor();
step('anexar, ver e excluir comprovante depois da baixa');

// --- cartão + compra parcelada + pagamento da fatura
await page.click('a[href="#/cartoes"]');
await page.getByRole('button', { name: 'Novo cartão' }).click();
await modal().locator('input').first().fill('Nubank');
await modal().locator('input.money').fill('5000');
await modal().locator('input[type=number]').nth(0).fill('5');
await modal().locator('input[type=number]').nth(1).fill('12');
await modal().getByRole('button', { name: 'Salvar' }).click();
await saved('Cartão cadastrado');
await page.getByRole('button', { name: 'Nova compra' }).click();
await modal().getByLabel('Valor', { exact: true }).fill('1200');
await modal().getByLabel('Descrição').fill('Geladeira');
await modal().getByLabel('Categoria', { exact: true }).selectOption({ label: 'Casa' });
await modal().getByLabel('Parcelas').selectOption('3');
await page.keyboard.press('Enter');
await saved('Compra lançada em 3 parcelas');
// pagamento parcial da fatura com comprovante
await page.getByRole('button', { name: 'Pagar fatura' }).click();
await modal().locator('input.money').fill('50');
await modal().getByLabel('Arquivo do comprovante').setInputFiles(pdfPath);
await modal().getByRole('button', { name: 'Confirmar pagamento' }).click();
await saved('Pagamento parcial da fatura registrado');
await page.getByLabel('Ver comprovantes (1)').first().waitFor();
await expectText('Parcelamentos em andamento');
await expectText('0/3 parcelas');
step('cartão e compra parcelada');
await shot('cartoes');

// --- recorrência
await page.click('a[href="#/recorrentes"]');
await page.getByRole('button', { name: 'Nova recorrência' }).click();
await modal().locator('input').first().fill('Internet');
await modal().locator('input.money').fill('120');
await modal().getByLabel('Categoria', { exact: true }).selectOption({ label: 'Casa' });
await modal().getByRole('button', { name: 'Salvar' }).click();
await saved('Recorrência criada');
await page.getByRole('button', { name: 'Pausar' }).click();
await modal().getByRole('button', { name: 'Pausar' }).click();
await saved('Recorrência pausada');
await page.getByRole('button', { name: 'Reativar' }).click();
await expectText('Recorrência reativada');
step('recorrência criar/pausar/reativar');

// --- orçamento com alerta
await page.click('a[href="#/orcamento"]');
const appInput = page.getByLabel('Limite Aplicativos');
await appInput.fill('140');
await appInput.press('Enter');
await expectText('Limite salvo');
await expectText('já consumiu');
await shot('orcamento');
step('orçamento com alerta de 80%');

// --- dashboard
await page.click('a[href="#/"]');
await expectText('Deve sobrar no fim do mês');
await expectText('Alertas de orçamento');
await shot('dashboard');
step('dashboard com dados');

// --- relatórios e exportação
await page.click('a[href="#/relatorios"]');
for (const [label, ext] of [['Excel', 'xlsx'], ['CSV', 'csv'], ['PDF', 'pdf']]) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
  if (!dl.suggestedFilename().endsWith(ext)) throw new Error(`Exportação ${label} falhou`);
}
for (const t of ['Rankings', 'Comparação entre meses', 'O que mais cresceu', 'Gastos recorrentes', 'Evolução das economias', 'Lançamentos']) await page.getByRole('tab', { name: t }).click();
await page.getByRole('tab', { name: 'Rankings' }).click();
await shot('relatorios');
step('relatórios e exportação Excel/CSV/PDF');

// --- economia, categorias
await page.click('a[href="#/economia"]');
await expectText('Oportunidades de economia');
await shot('economia');
await page.click('a[href="#/categorias"]');
await page.getByRole('button', { name: 'Nova categoria' }).click();
await modal().locator('input').first().fill('Pets');
await modal().getByRole('button', { name: 'Salvar' }).click();
await saved('Categoria criada');
const pets = page.locator('.card', { hasText: 'Pets' });
await pets.getByPlaceholder('Nova subcategoria').fill('Ração');
await pets.getByPlaceholder('Nova subcategoria').press('Enter');
await expectText('Subcategoria adicionada');
await pets.getByLabel('Excluir Pets').click();
await modal().getByRole('button', { name: 'Excluir' }).click();
await saved('Categoria excluída');
step('CRUD de categorias');

// --- transferência
await page.click('a[href="#/contas"]');
await page.getByRole('button', { name: 'Transferir' }).click();
await modal().locator('input.money').fill('200');
await modal().getByRole('button', { name: 'Transferir' }).click();
await saved('Transferência registrada');
step('transferência entre contas');

// --- editar e excluir lançamento
await page.click('a[href="#/lancamentos"]');
await page.locator('tr', { hasText: 'Salário' }).getByLabel('Editar').click();
await modal().getByLabel('Descrição').fill('Salário mensal');
await modal().getByRole('button', { name: /Salvar alterações/ }).click();
await saved('Lançamento atualizado');
await shot('lancamentos');
await page.locator('tr', { hasText: 'Geladeira (1/3)' }).getByLabel('Excluir').click();
await modal().getByRole('button', { name: 'Todas as parcelas' }).click();
await saved('3 parcelas excluídas');
step('editar e excluir (todas as parcelas)');

// --- backup e persistência
await page.click('a[href="#/configuracoes"]');
const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Baixar backup/ }).click()]);
const bkPath = await bk.path();
const json = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
if (json.format !== 'financas-familia-backup' || !json.data.transactions.length) throw new Error('Backup inválido');
await page.getByRole('tab', { name: /Escuro/ }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await page.reload();
await expectText('Salário mensal').catch(() => undefined);
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
if (theme !== 'dark') throw new Error('Tema escuro não persistiu');
await page.click('a[href="#/lancamentos"]');
await expectText('Salário mensal');
step('backup JSON, tema escuro e persistência após recarregar');
await page.click('a[href="#/"]');
await page.waitForTimeout(600);
await shot('dashboard-escuro');

// restauração
await page.click('a[href="#/configuracoes"]');
await page.locator('input[type=file]').setInputFiles(bkPath);
await modal().getByRole('button', { name: 'Restaurar' }).click();
await saved('Backup restaurado');
step('restauração de backup');

// --- celular
await page.setViewportSize({ width: 390, height: 844 });
await page.click('a[href="#/"]').catch(() => undefined);
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (overflow) errors.push('rolagem horizontal no celular');
await shot('mobile');
await page.getByLabel('Abrir menu').click();
await page.click('a[href="#/cartoes"]');
await expectText('Nubank');
step('layout responsivo (celular)');

await browser.close();
if (errors.length) {
  console.error('\nErros encontrados:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✔ Todos os fluxos de ponta a ponta passaram');
