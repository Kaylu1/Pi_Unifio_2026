# OScar — Sistema de Gestão de Oficinas

Projeto Integrador do curso de Engenharia de Software, desenvolvido para apoiar o gerenciamento de oficinas automotivas. O sistema integra clientes, veículos, agendamentos, ordens de serviço, inspeções, orçamentos, estoque de peças e atendimento de pós-venda.

O objetivo do back-end é disponibilizar uma API REST que coordene o atendimento, aplique as regras da oficina e mantenha a integridade dos registros. O ambiente de nuvem utiliza **PostgreSQL no Supabase**, com interface Angular e API hospedadas na **Vercel**. O projeto também mantém uma alternativa MySQL local para desenvolvimento e regressão.

## Adequação tecnológica ao enunciado

Conforme autorização concedida pelo professor ao grupo, a implementação originalmente prevista com **Spring Boot e Spring Data JPA foi adaptada para Node.js e TypeScript**. O professor também autorizou a substituição de **MySQL por PostgreSQL/Supabase**. Os requisitos funcionais, a arquitetura em camadas, a persistência relacional, a autenticação HTTP Basic e as evidências de testes foram mantidos.

| Responsabilidade prevista no enunciado | Implementação adotada no OScar |
|---|---|
| API REST com Spring Boot | Node.js, com os módulos nativos `node:http` e `node:https`, executando o código TypeScript |
| Persistência e consultas com Spring Data JPA | Repositórios com SQL parametrizado e transações, utilizando **`pg` (node-postgres)** no Supabase; `mysql2/promise` atende ao adaptador MySQL local |
| Persistência com MySQL | PostgreSQL hospedado no Supabase, conforme a autorização acadêmica; MySQL permanece como alternativa local |
| Bean Validation | Validação no servidor de campos obrigatórios, formatos, limites numéricos e relacionamentos, implementada em `entities.ts`, `common.ts` e nos serviços |
| Tratamento centralizado de exceções | Classe `DomainError` e tratamento central no `ApiController`, com mensagens e códigos HTTP apropriados |
| Spring Security com HTTP Basic | Autenticação HTTP Basic no `AuthService` e validações de permissão por perfil nos serviços, por meio de `allow()` em `common.ts` |

O processamento HTTP utiliza os recursos nativos do Node.js. A biblioteca **`pg`** mantém a conexão privada com o PostgreSQL; os mapeamentos e as consultas são definidos nos repositórios. Na Vercel, `api/index.ts` recebe a requisição e injeta esse repositório nos mesmos serviços TypeScript. O Angular chama `/api` na própria origem.

## Tecnologias utilizadas

| Tecnologia | Utilização |
|---|---|
| Node.js 24 | Execução da API e módulos nativos de HTTP, HTTPS e criptografia |
| TypeScript 5.9 | Implementação do back-end, contratos e modelos; verificação estática em modo estrito |
| Angular 20 e Angular Material | Interface, formulários, navegação e componentes visuais |
| PostgreSQL/Supabase e `pg` | Persistência do ambiente de nuvem, chaves estrangeiras, consultas parametrizadas e transações |
| Vercel | Hospedagem do Angular e execução da API como função serverless |
| MySQL Community 8.4 e `mysql2/promise` | Alternativa local com dados e configuração próprios |
| Postman Collection v2.1 e Newman | Organização das requisições, exemplos de respostas e reprodução da coleção |
| Node.js Test Runner e Playwright | Testes de domínio, integração e interface |

## Integrantes

| Nome completo | RA |
|---|---|
| Caio Eduardo Sapata Bruno | 270667 |
| Gabriel Claudino Martins Silva | 272425 |
| João Lucas Terçariol | 270959 |
| Luis Felipi Ferreira | 273194 |
| Lucas Henrique Benitez de Moraes | 272807 |

## Ambientes de execução

| Ambiente | Acesso | Persistência |
|---|---|---|
| Implantação Vercel | `https://pi-unifio-2026.vercel.app` | PostgreSQL/Supabase, schema `oscar_private` |
| Execução local padrão | `https://localhost:4201` | MySQL local, schema `oscar_local` |
| Teste isolado PostgreSQL | API local iniciada pelo executor | PostgreSQL local PGlite, com as migrações do Supabase |

A configuração da implantação está documentada em [Vercel](docs/VERCEL.md) e [Supabase](docs/SUPABASE.md). Credenciais SQL e variáveis privadas pertencem ao servidor. Os bancos de desenvolvimento e teste não são sincronizados automaticamente com a base de nuvem.

Na investigação de **18/11/2026**, as conexões ao Supabase nas portas `5432` e `6543` funcionaram com verificação TLS. A falha `503` foi reproduzida no pacote da Vercel: arquivos JavaScript ainda importavam fontes `.ts` ausentes. A entrada da função passou a usar TypeScript diretamente, com configurações próprias que reescrevem as extensões na compilação. Após a implantação do commit `32e1e61`, `/api/health`, login, consulta de sessão e logout responderam **200** no domínio publicado. O teste `tests/vercel-compiled.test.mjs` executa os arquivos JavaScript emitidos para verificar essa inicialização.

## Configuração e execução local com MySQL

O preparo automatizado foi desenvolvido para Windows com Node.js 24. O MySQL Community 8.4 é executado em `127.0.0.1:3307`, com diretório de dados exclusivo do OScar. No diretório raiz do projeto, execute:

~~~powershell
npm.cmd ci
node scripts/mysql-local.mjs setup
npm.cmd start
~~~

O preparo do MySQL é necessário apenas na primeira execução. O comando npm start inicia o MySQL local, a API e o Angular. Abra **https://localhost:4201**; a API atende em **https://127.0.0.1:4301/api**. O certificado de desenvolvimento é local e pode exigir confirmação no primeiro acesso.

Para conferir o banco:

~~~powershell
node scripts/mysql-local.mjs status
~~~

Nessa alternativa MySQL, os dados da oficina ficam no schema **oscar_local**, e os testes usam **oscar_test**. A configuração e os arquivos do servidor MySQL ficam em data/mysql-local; as senhas do banco permanecem nessa pasta local e não entram na coleção Postman.

Essa execução utiliza o computador local. Para iniciar o Angular/API local com o banco Supabase, consulte `npm.cmd run start:oscar-supabase` e as condições descritas no [guia do Supabase](docs/SUPABASE.md).

## Autenticação e contas de demonstração

As contas da base demonstrativa local e das fixtures de teste utilizam a senha **Oscar@2026!**. Essas credenciais são destinadas exclusivamente aos testes e à apresentação. Os usuários cadastrados no Supabase pertencem àquele ambiente e não são substituídos por essas contas locais.

| Perfil | E-mail |
|---|---|
| Gerente | gerente@oscar.local |
| Atendente | atendente@oscar.local |
| Mecânico | mecanico@oscar.local |
| Consultor técnico | consultor@oscar.local |
| Cliente | cliente@oscar.local |

A interface usa sessão em cookie HttpOnly e proteção CSRF. A mesma API também aceita **HTTP Basic**, usado pela coleção Postman. O gerente administra cadastros e relatórios; o mecânico consulta seus atendimentos e aponta inspeção e execução. Um usuário sem autenticação recebe 401; um usuário autenticado sem a permissão necessária recebe 403.

## Organização do código

O enunciado permite adaptar a estrutura do repositório. A organização corresponde às responsabilidades recomendadas:

| Estrutura recomendada no enunciado Java | Estrutura adotada em Node.js/Angular |
|---|---|
| `pom.xml` | `package.json` e `package-lock.json`: dependências e comandos |
| `src/main/` | `server/`: API e regras; `src/`: interface Angular; `api/`: entrada da Vercel |
| `src/test/` | `tests/` e `server/*.test.mjs`: testes automatizados |
| `docs/modelo-dados.png` | Mesmo caminho, com o modelo PostgreSQL/Supabase |
| `docs/documentacao-api.md` | Mesmo caminho, com índice e referência detalhada dos endpoints |
| `postman/projeto-integrador.postman_collection.json` | Mesmo caminho, com variáveis e respostas de teste |

~~~text
oscar/
├── README.md
├── package.json
├── package-lock.json
├── vercel.json
├── api/index.ts
├── docs/
│   ├── modelo-dados.png
│   └── documentacao-api.md
├── postman/projeto-integrador.postman_collection.json
├── server/
│   ├── controllers/
│   ├── services/
│   └── repositories/
├── src/                         interface Angular
├── supabase/migrations/         estrutura PostgreSQL
└── tests/
~~~

O Angular continua responsável pela interface. O backend em TypeScript separa as responsabilidades:

~~~text
server/
  controllers/api-controller.ts       entrada HTTP e respostas
  services/application-service.ts     encaminhamento dos casos de uso
  services/crud-service.ts            gerenciamento e integridade dos registros
  services/auth-service.ts            credenciais, HTTP Basic e sessões
  postgres-store.ts                   repositório PostgreSQL/Supabase
  repositories/mysql-repository.ts    comandos e transações no MySQL
  repositories/mysql-schema.sql       tabelas, índices, checks e chaves estrangeiras
  repositories/security-repository.ts persistência de credenciais, sessões e recuperação
  contracts.ts                       contratos usados pelas camadas
  models.ts                          interfaces das entidades da oficina
  domain.ts                          regras de domínio e erros
  entities.ts                        validação dos cadastros
~~~

O controller chama os serviços; a autenticação é tratada pelo AuthService, e os serviços usam o contrato do repositório. Validação de entrada, conflitos e recursos inexistentes passam pelo tratamento central de erros. PostgreSQL, MySQL e SQLite possuem adaptadores próprios; a configuração da Vercel seleciona PostgreSQL explicitamente.

## Modelagem e regras da oficina

O modelo tem doze entidades de domínio: clientes, veículos, usuários, serviços, fornecedores, peças, solicitações, agendamentos, ordens, orçamentos, movimentações e chamados. No PostgreSQL, os componentes do atendimento são armazenados em JSONB, e os vínculos físicos entre entidades utilizam colunas com chaves estrangeiras. A migração contém 21 tabelas, incluindo nove de suporte.

[Diagrama PostgreSQL](docs/modelo-dados.svg) · [Imagem PNG](docs/modelo-dados.png) · [Fonte Mermaid](docs/modelo-dados.mmd) · [Migração PostgreSQL](supabase/migrations/202610220001_oscar_private.sql)

O adaptador MySQL possui organização física própria, incluindo duas tabelas associativas. Sua documentação permanece disponível em [modelo MySQL](docs/modelo-dados-mysql.svg) e [estrutura SQL MySQL](server/repositories/mysql-schema.sql).

As colunas usadas em relacionamentos e consultas são relacionais. Campos JSON preservam detalhes e retratos históricos, como itens aprovados, inspeções e evolução do atendimento. Alterar o preço no catálogo não reescreve o valor já aprovado em uma O.S.

Regras de negócio verificadas:

- Um mecânico não pode ter dois agendamentos que se sobreponham.
- Uma peça só sai do estoque durante a execução de um item aprovado, e o saldo não pode ficar negativo.
- A O.S. não pode ser concluída com itens aprovados ainda sem execução.
- Um orçamento publicado depende da decisão do cliente para liberar os itens pendentes.
- Cadastros e atendimentos com histórico são inativados ou cancelados; rascunhos sem efeito operacional podem ser removidos. A exclusão de dados pessoais do cliente usa anonimização.

As consultas personalizadas consultam a agenda por data e mecânico e as peças abaixo do estoque mínimo. O relatório cruza clientes, veículos e ordens e totaliza o consumo de peças.

## Atendimento aos requisitos e documentação da API

[Documentação da API](docs/documentacao-api.md) · [Requisitos da atividade](docs/ACADEMICO-REQUISITOS.md) · [Roteiro para apresentar](docs/ACADEMICO-APRESENTACAO.md)

A [matriz de requisitos](docs/ACADEMICO-REQUISITOS.md) relaciona cada critério do enunciado à implementação e à evidência correspondente. Ela também distingue os requisitos técnicos verificados das etapas formais de apresentação e entrega.

A coleção fica em **postman/projeto-integrador.postman_collection.json**. Ela inclui autenticação, CRUD das entidades, consultas, regras, validação, erros 400/404/409/401/403 e o fluxo de aprovação e execução da oficina. As variáveis têm seus valores incluídos no JSON; as credenciais são somente de teste.

As respostas de teste são capturadas em bases isoladas, com o adaptador utilizado identificado no registro de cada execução. A captura PostgreSQL aplica as migrações do Supabase em PGlite local; ela não modifica a base hospedada. A forma de gerar e importar as evidências está em [postman/README.md](postman/README.md). Após importar no Postman, use **Examples** para examinar as respostas e **Save Response → Save as example** para renovar uma evidência manualmente.

~~~powershell
npm.cmd run postman:postgres
node scripts/academic-postgres-fixture.mjs
~~~

O primeiro comando captura as respostas e encerra a fixture. O segundo a reabre em **http://127.0.0.1:4302/api** para enviar as requisições pelo Postman. Os comandos não devem rodar ao mesmo tempo. A alternativa MySQL continua disponível por `npm.cmd run postman:evidence`.

## Verificação do projeto

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:postgres
npm.cmd run test:mysql
npm.cmd run build
npm.cmd run test:browser:postgres
~~~

Os testes utilizam dados isolados. A suíte `test:browser:postgres` verifica o fluxo Angular → API TypeScript → PostgreSQL local. `test:browser:mysql` verifica a alternativa MySQL real; `test:browser` utiliza SQLite para regressão. As evidências da coleção estão em `postman/evidencias.json`; os cenários abrangem catálogo, confirmação, agenda, inspeção, orçamento público, estoque, encerramento e permissões.

A coleção principal foi capturada em **18/11/2026** usando PostgreSQL local isolado, com **87 respostas reais**. Sua reprodução pelo Newman aprovou **87 requisições e 87 verificações**, sem falhas. As evidências anteriores de MySQL permanecem em [postman/mysql-2026-11-11](postman/mysql-2026-11-11/README.md). Veja [o relatório de validação](docs/ACADEMICO-VALIDACAO.md).

Na conferência de **18/11/2026**, passaram a verificação estrita do TypeScript, **158 testes gerais**, **10 testes em MySQL real** e **cinco suítes de navegador com PostgreSQL local**. O build do Angular foi aprovado, com aviso de tamanho do pacote inicial. Os ambientes e os pontos formais de apresentação estão discriminados na [matriz de requisitos](docs/ACADEMICO-REQUISITOS.md).

Na execução local, as mensagens de e-mail ficam disponíveis na caixa do gerente. Os testes isolados dispensam envio de mensagens e acesso ao banco de produção.

## Entrega acadêmica

Repositório do grupo: [Kaylu1/Pi_Unifio_2026](https://github.com/Kaylu1/Pi_Unifio_2026).

Os materiais de entrega compreendem este README, o código-fonte, o modelo de dados, a documentação da API e a coleção Postman com variáveis e exemplos de respostas. Conforme o enunciado, um integrante deverá submeter o link do repositório na atividade **Projeto Integrador**, no Ambiente Conhecer. Todos os integrantes deverão estar preparados para explicar a modelagem, as camadas, as regras e os testes apresentados.
