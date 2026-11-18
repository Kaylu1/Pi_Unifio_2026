# Verificação da aplicação e da implantação

## Histórico MySQL — 11/11/2026

Execução local em **11/11/2026**, usando MySQL Community 8.4 na fixture **oscar_test**. A API de teste respondeu em **http://127.0.0.1:4302/api**. O banco oscar_local não foi usado na captura.

| Conferência | Resultado |
|---|---|
| Requisições capturadas da API | 87 |
| Exemplos salvos na coleção | 87 |
| Variáveis incluídas com valor | 28, nenhuma vazia |
| Reprodução pelo Newman | 87 requisições, nenhuma falha |
| Verificações da coleção | 87 aprovadas |
| Códigos de erro demonstrados | 400, 401, 403, 404 e 409 |

A captura exercitou o CRUD das doze entidades, duas consultas personalizadas, conflito de agenda, aprovação de orçamento, impedimento de estoque negativo, execução de serviços e peças, encerramento da O.S. e chamado de pós-venda. Cancelamentos e inativações preservaram o histórico, conforme as regras da oficina.

Os arquivos verificáveis estão em:

- [Coleção MySQL com exemplos reais](../postman/mysql-2026-11-11/projeto-integrador.postman_collection.json)
- [Status esperado e recebido de cada requisição MySQL](../postman/mysql-2026-11-11/evidencias.json)
- [Resumo da execução Newman/MySQL](../postman/mysql-2026-11-11/newman-result.json)
- [Executor de captura](../scripts/postman-evidence.mjs)

O comando usado foi:

~~~powershell
node scripts/postman-evidence.mjs --verify-postman
~~~

A execução registrada usa o Newman, que interpreta a coleção Postman. Não representa cliques manuais no aplicativo. Para demonstrar ao professor, importe a coleção no Postman, abra os Examples e envie as requisições desejadas na fixture local. O aplicativo também permite salvar novas respostas por **Save Response → Save as example**.

O Newman foi instalado temporariamente para essa conferência e retirado das dependências do aplicativo depois. Para gerar apenas a coleção, use o comando sem a opção --verify-postman. Para repetir pelo Newman sem adicionar dependência ao OScar, siga o comando npm exec em [postman/README.md](../postman/README.md).

## Aplicação e banco

| Comando ou fluxo | Resultado em 11/11/2026 |
|---|---|
| npm.cmd run typecheck | TypeScript em modo strict, sem erros |
| npm.cmd test | 148 testes aprovados, nenhuma falha |
| npm.cmd run test:mysql | 10 testes aprovados em MySQL Community 8.4.13 real |
| Navegador com MySQL — flow, request, access, features e model | Cinco suítes aprovadas |
| npm.cmd run build | Angular compilado e verificação de CSP aprovada |
| npm.cmd audit --omit=dev | Nenhuma vulnerabilidade reportada nas dependências de execução |
| npm.cmd start e npm.cmd run api | Health HTTP 200 com database: mysql |

Os testes de MySQL verificam FKs, rollback, duas reservas concorrentes do mesmo mecânico, CRUD, entrada/saída/estorno de peças, consultas e relatórios, pedido do catálogo com cadastro provisório, anonimização e snapshots. Também cobrem o nome de fornecedor com 160 caracteres e a borda exata da janela de consumo, para o painel e a consulta SQL calcularem o mesmo mínimo de estoque.

No navegador, o caminho foi Angular → API TypeScript → MySQL oscar_test. Foram verificados cadastro e edição, disponibilidade/remarcação, estoque e estorno, catálogo e confirmação do pedido, orçamento, aprovação pública, conclusão, garantia, permissões, logout e navegação em telas pequenas. O banco principal oscar_local não foi usado por essas suítes.

O build ainda emite um aviso de tamanho: pacote inicial de aproximadamente 1,47 MB frente ao limite de aviso de 1,30 MB. A compilação passa. O audit completo mantém 16 avisos moderados em dependências de desenvolvimento da CLI do Angular; a correção automática oferecida exige troca de versão principal da CLI. As dependências de execução não apresentaram avisos na consulta registrada.

## Primeira conferência em 18/11/2026 — execução local MySQL

O código foi inicialmente comparado com o enunciado considerando a execução local MySQL e a substituição de Spring Boot/JPA por Node.js/TypeScript. O grupo esclareceu posteriormente que PostgreSQL/Supabase também havia sido autorizado; a conferência correspondente está registrada a seguir.

| Comando executado nesta conferência | Resultado |
|---|---|
| npm.cmd run typecheck | Aprovado em modo estrito |
| npm.cmd test | 148 testes aprovados, zero falhas |
| npm.cmd run test:mysql | 10 testes aprovados, zero falhas, em MySQL Community 8.4.13 |
| npm.cmd run build | Aprovado; aviso de pacote inicial de aproximadamente 1,47 MB |

Os testes de MySQL utilizaram exclusivamente `oscar_test`. O README foi revisado para identificar os módulos nativos HTTP/HTTPS do Node.js, o driver `mysql2/promise`, as equivalências tecnológicas e os comandos de verificação com MySQL.

A coleção MySQL existente foi inspecionada nessa etapa inicial: 87 requisições, 87 exemplos de respostas e 28 variáveis. Os resultados MySQL de Newman e navegador descritos anteriormente são de **11/11/2026**. O audit de dependências não foi repetido em 18/11.

As ressalvas de procedência do projeto-base, uso manual de Save Response e entrega acadêmica estão descritas na [matriz de requisitos](ACADEMICO-REQUISITOS.md).

## Conferência PostgreSQL e Vercel — 18/11/2026

O grupo confirmou a autorização do professor para utilizar PostgreSQL/Supabase. A análise identificou três exclusões sem implementação no adaptador PostgreSQL: rascunhos de orçamento, entradas de estoque e chamados elegíveis. O repositório recebeu `remove()` transacional e consultas SQL de agenda e reposição com a mesma política de estoque aplicada pelos serviços. O iniciador PostgreSQL local também foi restabelecido, e `/health` passou a distinguir o ambiente do driver utilizado.

| Verificação após as correções | Resultado |
|---|---|
| TypeScript estrito | Sem erros |
| Suíte geral, incluindo integração do adaptador Vercel | 158 testes aprovados, zero falhas |
| Coleção principal em PostgreSQL local/PGlite | 87 requisições, 87 respostas reais e 28 variáveis preenchidas |
| Reprodução da coleção PostgreSQL pelo Newman CLI | 87 requisições e 87 verificações aprovadas |
| Navegador com Angular → API → PostgreSQL local | Cinco suítes aprovadas: flow, request, access, features e model |
| Estrutura recomendada | README, manifesto Node, modelo PNG, documentação da API, coleção e diretórios de código/testes presentes |

Comandos utilizados nesta etapa:

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:browser:postgres -- flow request access features model
~~~

A captura foi realizada com `scripts/academic-postgres-fixture.mjs` e `scripts/postman-evidence.mjs`. O Newman foi executado pelo cache temporário do npm, sem adicioná-lo às dependências do aplicativo. [Evidências da captura](../postman/evidencias.json) e [resumo Newman](../postman/newman-result.json) identificam PostgreSQL/PGlite local e o hash da coleção correspondente.

### Observação da implantação antes da correção

Na observação pública de 18/11, `https://pi-unifio-2026.vercel.app/entrar` respondeu **200**, e `/api/health` respondeu **503** com mensagem genérica de indisponibilidade da API. Os status públicos do GitHub indicavam que o deploy do commit `dc40340` havia concluído, o que comprova a publicação, mas não a saúde da conexão ao banco.

A tentativa SQL direta ao projeto Supabase esperado, restrita a leitura, foi recusada com código `XX000`. O hostname público do projeto também não foi resolvido nessa rede. Esses sinais não comprovam uma causa única. A verificação do status do projeto no painel foi solicitada ao usuário.

As correções e os testes dessa etapa inicial foram realizados localmente. Naquele momento, não houve aplicação de migração, alteração de variáveis, escrita no Supabase de produção ou novo deploy. O resultado PostgreSQL local não foi apresentado como prova de recuperação da API publicada.

## Recuperação e conferência final — 18/11/2026

Após a reativação do Supabase, as conexões nas portas 5432 e 6543 funcionaram com verificação TLS. Consultas somente de leitura confirmaram as 21 tabelas do schema. O erro de inicialização foi reproduzido no pacote gerado por `@vercel/node` 13.0.2: arquivos `.js` ainda importavam fontes `.ts` ausentes.

O commit `32e1e61` passou a usar `api/index.ts`, imports diretos dos módulos TypeScript e configurações de compilação em `api/` e `server/` com `rewriteRelativeImportExtensions`. O pacote do builder foi testado antes e depois: a mesma consulta de saúde passou de 503 para 200, e uma rota protegida continuou retornando 401 sem autenticação.

| Verificação | Resultado |
|---|---|
| TypeScript estrito, incluindo a entrada da Vercel | Aprovado |
| Suíte geral após a mudança da entrada | 158 testes aprovados, nenhuma falha |
| Testes focados da Vercel, incluindo o teste adicional da função compilada | Nove aprovados, nenhuma falha |
| Build Angular e CSP | Aprovados, mantendo apenas o aviso de tamanho já registrado |
| Deploy do commit `32e1e61` | Concluído; status público do GitHub confirmou sucesso |
| `GET /api/health` publicado | 200, `status: ok`, `mode: cloud`, `database: postgres` |
| Login, consulta de sessão e logout do gerente | 200 nas três operações; sessão de teste encerrada |
| `GET /api/users` com HTTP Basic do gerente | 200; 15 usuários ativos, com perfis gerente, mecânico e cliente |
| Consultas publicadas de agenda por data e peças abaixo do mínimo | 200 nas duas operações |

O teste adicional `tests/vercel-compiled.test.mjs` compila a função e o servidor para JavaScript, bloqueia o carregamento dos fontes originais e verifica saúde e proteção de rota com PostgreSQL local/PGlite. Os testes focados incluem oito testes de entrada já existentes e esse novo caso; a tabela não soma execuções repetidas como se fossem testes distintos.

As verificações de nuvem foram feitas em `https://pi-unifio-2026.vercel.app`. O login de conferência gerou apenas os registros normais de segurança da autenticação; a sessão foi encerrada. Não foram aplicadas migrações nem alterados cadastros de clientes, serviços, agendamentos ou estoque nessa conferência.

A revisão final do enunciado confirmou os arquivos e os recursos técnicos. O grupo ainda não confirmou a dispensa do uso do projeto-base do professor. Essa questão de origem e a entrega/apresentação continuam discriminadas na [matriz de requisitos](ACADEMICO-REQUISITOS.md). A demonstração manual do Postman foi realizada posteriormente, conforme o registro abaixo.

## Exemplo salvo manualmente no Postman — 18/11/2026

O grupo abriu a coleção no modo local do Postman 12.37.2, enviou `GET /services` e recebeu **200 OK**, com a verificação da requisição aprovada. Em seguida, utilizou **Save Response**. A interface passou a mostrar o exemplo **Listar serviços**, além do exemplo HTTP 200 já existente. O novo arquivo local foi gravado em 18/11, às 15h58 no horário de São Paulo.

A [cópia do arquivo salvo pelo aplicativo](../postman/evidencias-manuais/Listar-servicos.example.yaml) foi preservada e sua resposta incorporada à coleção JSON v2.1 exigida para a entrega. O conjunto passa a conter **87 requisições, 88 exemplos e 28 variáveis**: 87 exemplos da captura inicial e um exemplo manual. O registro não afirma que todas as respostas foram salvas manualmente.

A captura inicial e sua execução Newman descritas nas seções anteriores permanecem como evidência histórica. Após a inclusão do exemplo manual, a coleção foi novamente reproduzida na fixture PostgreSQL local pelo Newman: **87 requisições, 87 verificações aprovadas e nenhuma falha**. O [relatório atual](../postman/newman-result.json) identifica 88 exemplos salvos e o hash da coleção executada, `9413208d4621b4e0207840b3b235555d0170a2e3ded5e999484ba3af2bb36c24`.
