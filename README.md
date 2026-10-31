# Finanças da Família

Gerenciador financeiro familiar simples e rápido, que roda no navegador e guarda os dados localmente (IndexedDB). Interface em português, moeda em Real e datas no padrão brasileiro.

## Como usar

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Para gerar a versão de produção (arquivos estáticos em `dist/`, que podem ser hospedados de graça no GitHub Pages, Netlify, Vercel etc.):

```bash
npm run build
npm run preview
```

**Atalho:** pressione **N** em qualquer tela para lançar uma despesa/receita. Só o valor é obrigatório; Enter salva.

## Funcionalidades

| Área | O que faz |
|---|---|
| Lançamento rápido | Valor + Enter. Estabelecimento com autocompletar que lembra categoria, subcategoria, forma de pagamento e conta. Atalhos das últimas classificações usadas. Descrição automática. |
| Categorias | Categoria → Subcategoria, com estabelecimento independente (ex.: Aplicativos › Farmácia · iFood). Tudo editável; excluir uma categoria não apaga os lançamentos. |
| Contas a pagar / receber | Em aberto, vencidas, pagas; baixa total, parcial ou rápida; desfazer baixa. |
| Cartões | Limite, fechamento e vencimento; faturas por mês; compras parceladas; pagamento (inclusive parcial) da fatura **sem duplicar despesas**. |
| Recorrentes | Mensal, semanal ou anual; valor fixo ou variável; débito automático; pausar, reativar, cancelar. Detecta gastos que se repetem e sugere torná-los recorrentes. |
| Dashboard | Recebido, gasto, pago, a pagar, disponível, previsão de sobra no fim do mês, categoria que mais consome, comparação com o mês anterior e gráficos. |
| Relatórios | Filtros por período, categoria, subcategoria, estabelecimento, pessoa, cartão e status. Rankings, comparação entre meses, crescimento, recorrentes, evolução das economias. Exporta Excel, CSV e PDF. |
| Orçamento | Limite mensal por categoria com alertas em 80% e 100%. |
| Oportunidades de economia | Categorias acima da média dos últimos 3 meses e gastos não essenciais, com simulador de redução (economia mensal e anual). |
| Contas e saldos | Bancos, dinheiro e carteiras digitais com saldo inicial, extrato e transferências (que não contam como receita/despesa). |
| Backup | Backup completo em JSON, restauração com confirmação, opção de apagar tudo. |

## Regras financeiras importantes

- **Valores em centavos (inteiros)** — sem erros de arredondamento; parcelas somam exatamente o total (a diferença fica na 1ª parcela).
- **Cartão:** cada compra entra na categoria pela data da compra. Compras a partir do dia de fechamento vão para a fatura seguinte; a fatura é nomeada pelo mês de vencimento. O pagamento da fatura só retira dinheiro da conta.
- **"Gastamos"** = despesas por competência (inclui compras no cartão). **"Já pago" / "Falta pagar"** = contas com vencimento no mês + faturas que vencem no mês.
- **"Deve sobrar"** = saldo disponível hoje + a receber − a pagar (incluindo atrasados de meses anteriores).
- Saldos das contas consideram apenas o que foi efetivamente pago/recebido até hoje.

## Arquitetura

```
src/
  domain/     regras de negócio puras (sem React, sem banco) — 100% testadas
    money, dates, transactions, cards, recurrence, accounts, reports, suggestions, defaults
  db/         esquema IndexedDB (Dexie)
  services/   operações de gravação, backup/restauração e exportação
  ui/         React: componentes reutilizáveis, páginas, hooks e tema
e2e/          teste de ponta a ponta no navegador (Playwright)
```

Tecnologias: React 18, TypeScript, Vite, Dexie (IndexedDB), Recharts, Vitest, SheetJS (Excel) e jsPDF (PDF).

**Sincronização futura:** todos os registros usam UUID gerado no cliente, e toda gravação passa por `src/services`. Isso permite plugar um serviço de sincronização (ex.: Dexie Cloud ou Supabase) sem mudar a interface.

## Testes

```bash
npm test           # testes unitários e de integração (Vitest + IndexedDB simulado)
npm run build && (npx vite preview --port 4173 &) && npm run e2e   # ponta a ponta no navegador
```
