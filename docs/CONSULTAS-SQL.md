# Consultas SQL de negócio do relatório

O relatório do gerente, na tela "Relatórios", usa duas consultas SQL em server/report-sql.mjs. Elas são executadas pela rota GET /api/reports, com filtros de período e mecânico. Há versões equivalentes para SQLite e PostgreSQL, pois o projeto pode usar os dois bancos localmente.

## 1. Serviços por O.S., cliente e veículo (JOIN)

A consulta une orders, clients e vehicles pelas chaves estrangeiras clientId e vehicleId. Assim, a linha do serviço mostra o nome atual do cliente e a placa do veículo vinculados à O.S. O parâmetro mechanicId restringe as ordens de um mecânico quando selecionado. Os itens de serviço e a data de execução ficam dentro do documento JSON da O.S.; depois do JOIN, a rota seleciona somente os itens executados no período e calcula a receita.

## 2. Consumo líquido de peças (JOIN + SUM)

A consulta une movements e parts por partId e relaciona a O.S. por orderId para aplicar o filtro de mecânico. Ela considera somente saídas e estornos dentro do período: cada saída soma a quantidade e cada estorno subtrai. GROUP BY agrupa por peça; HAVING retira as peças com saldo líquido zero. Entradas de estoque não contam como consumo. A tela e o CSV mostram quantidade líquida e custo calculado com o custo atual cadastrado da peça.

Os filtros entram como parâmetros vinculados à consulta, sem concatenar texto recebido da URL ao SQL. A rota exige perfil de gerente. Os testes em tests/report-sql.test.mjs exercitam JOIN, SUM, filtros, estorno e saldo zero nos dois bancos; tests/api.integration.mjs cobre a resposta HTTP e o CSV.
