# Finanças da Família 💰

Projeto que fiz pra controlar as finanças aqui de casa. A ideia é ser simples: lançar uma despesa em poucos segundos e depois conseguir ver pra onde o dinheiro está indo, quanto vai sobrar no fim do mês e onde dá pra economizar.

Roda direto no navegador e os dados ficam salvos no próprio navegador (IndexedDB), então não precisa de servidor nem de cadastro.

👉 **Acesse aqui:** https://andevbr.github.io/financas_familia/

## O que dá pra fazer

- **Lançar despesas e receitas rápido** — aperta a tecla **N**, digita o valor e dá Enter. O resto é opcional.
- **Estabelecimentos lembrados** — quando digito "iFood", ele já preenche a última categoria e forma de pagamento que usei.
- **Categorias e subcategorias** — tipo *Aplicativos › Farmácia* com estabelecimento *iFood*. Assim consigo ver tanto quanto gastei no iFood quanto quanto gastei com farmácia. Dá pra criar, editar e excluir.
- **Contas a pagar e a receber** — vencidas, em aberto, pagas, pagamento parcial.
- **Cartões de crédito** — faturas, parcelamentos e limite usado. O pagamento da fatura não duplica as despesas (a compra já conta na categoria).
- **Contas recorrentes** — internet, luz, escola, assinaturas... mensal, semanal ou anual. Dá pra pausar ou cancelar.
- **Dashboard** — quanto entrou, quanto saiu, quanto falta pagar e quanto deve sobrar no fim do mês, com gráficos.
- **Relatórios** — filtros por período, categoria, estabelecimento, pessoa, cartão e status. Exporta pra Excel, CSV e PDF.
- **Orçamento** — limite por categoria com aviso quando chega em 80% e 100%.
- **Oportunidades de economia** — mostra as categorias em que gastei mais que a média e simula quanto daria pra economizar.
- **Contas e saldos** — banco, dinheiro e carteira digital, com transferências entre elas.
- **Backup** — exporta e importa tudo em JSON.
- Tema claro/escuro e funciona no celular.

## Rodando no computador

Precisa ter o [Node.js](https://nodejs.org) instalado.

```bash
npm install
npm run dev
```

Depois é só abrir http://localhost:5173

Outros comandos:

```bash
npm test          # roda os testes
npm run build     # gera a versão final na pasta dist
```

## Tecnologias

- React + TypeScript (com Vite)
- Dexie pra salvar os dados no IndexedDB
- Recharts pros gráficos
- Vitest pros testes
- SheetJS (Excel) e jsPDF (PDF) pras exportações

## Organização das pastas

```
src/
  domain/    cálculos e regras (cartão, parcelas, recorrências, relatórios...)
  db/        banco de dados local
  services/  salvar, excluir, backup e exportação
  ui/        telas e componentes
e2e/         teste que abre o navegador e testa as telas
```

Separei os cálculos das telas pra ficar mais fácil de testar. Os testes cobrem principalmente a parte de valores, cartões, parcelas, filtros e lançamentos.

## Algumas regras que usei

- Os valores são guardados em centavos pra não dar erro de arredondamento.
- No cartão, compra feita a partir do dia de fechamento cai na fatura do mês seguinte.
- "Deve sobrar no fim do mês" = saldo das contas hoje + o que falta receber − o que falta pagar.
- Transferência entre contas minhas não conta como receita nem despesa.

## Ideias pro futuro

- Sincronizar entre celular e computador
- Orçamento diferente por mês
- Importar extrato do banco

⚠️ Como os dados ficam no navegador, faça backup de vez em quando (menu *Configurações e backup*).
