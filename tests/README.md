# Testes do OScar

As suítes verificam regras da oficina, API, persistência, autorização e integração com a interface. Execute os comandos abaixo na raiz do repositório, com Node.js 24 e as dependências instaladas.

## Comandos

| Comando | Escopo |
|---|---|
| `npm.cmd run typecheck` | Verificação estrita do TypeScript do back-end e da entrada da Vercel |
| `npm.cmd test` | Suíte geral: domínio, API, PostgreSQL local, configuração e função compilada |
| `npm.cmd run test:academic` | CRUD, HTTP Basic, permissões, validações e regras exigidas na atividade |
| `npm.cmd run test:postgres` | Adaptador PostgreSQL, privacidade, consultas e fluxo do atendimento |
| `npm.cmd run test:mysql` | Integração com MySQL Community local, na base `oscar_test` |
| `npm.cmd run test:browser:postgres` | Angular → API → PostgreSQL local/PGlite |
| `npm.cmd run test:browser:mysql` | Angular → API → MySQL local de testes |
| `npm.cmd run test:browser` | Navegador com a fixture SQLite de regressão |
| `npm.cmd run build` | Compilação do Angular e verificação da compatibilidade com a CSP |

Os comandos `test:mysql` e `test:browser:mysql` precisam do MySQL local preparado conforme o [README principal](../README.md). Os testes de navegador utilizam Playwright e iniciam a API e o Angular nas portas das fixtures.

## Integração contínua

O [workflow do GitHub Actions](../.github/workflows/ci.yml) executa `npm ci`, verificação de tipos, suíte geral e build com Node.js 24, em pushes para `main` e pull requests. O workflow usa bancos locais de teste e não recebe credenciais de produção. MySQL real e navegador permanecem nas verificações separadas indicadas acima.

## Principais arquivos

| Arquivo ou grupo | Verificação |
|---|---|
| [academic-api.integration.mjs](academic-api.integration.mjs) | CRUD e critérios da atividade de back-end |
| [api.integration.mjs](api.integration.mjs) | Atendimento, validações, sessões, permissões e relatórios pela API |
| [api.service-request-confirm.mjs](api.service-request-confirm.mjs) | Confirmação do pedido do catálogo e vínculo com cliente, veículo e agenda |
| [postgres.academic-parity.mjs](postgres.academic-parity.mjs) | CRUD e consultas acadêmicas no adaptador PostgreSQL |
| [mysql.integration.mjs](mysql.integration.mjs) | Integridade, transações e operações no MySQL real |
| [cloud-flow.integration.mjs](cloud-flow.integration.mjs) | Fluxo da API pelo adaptador da Vercel, com banco local de teste |
| [vercel-entry.test.mjs](vercel-entry.test.mjs) | Configuração, roteamento, validação de origem e inicialização da função |
| [vercel-compiled.test.mjs](vercel-compiled.test.mjs) | Execução do JavaScript emitido, sem depender dos fontes TypeScript originais |
| [report-sql.test.mjs](report-sql.test.mjs) | Consultas SQL dos relatórios |
| [server/domain.test.mjs](../server/domain.test.mjs) | Regras de domínio, aprovações, estoque e transições da O.S. |

Os demais arquivos `api.*`, `postgres.*` e os testes em `server/` cobrem cenários complementares, incluindo anonimização, persistência, orçamento em PDF e concorrência.

## Isolamento e evidências

A fixture [PostgreSQL](helpers/postgres-fixture.mjs) utiliza PGlite local com as migrações do projeto. Os testes MySQL usam `oscar_test`; o desenvolvimento padrão utiliza `oscar_local`. As suítes SQLite criam suas próprias bases. Os cenários usam dados fictícios e não sincronizam registros com o Supabase hospedado.

O teste do adaptador Vercel é executado localmente. Ele não comprova, sozinho, que o ambiente publicado possui configuração válida. As observações do deploy e os resultados datados estão no [relatório de validação](../docs/ACADEMICO-VALIDACAO.md).

A coleção Postman, o exemplo salvo manualmente e os relatórios de reprodução ficam em [postman/](../postman/README.md). As instruções dessa pasta explicam como executar a demonstração sem utilizar o banco de produção.
