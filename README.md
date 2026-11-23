# OScar — Gestão de Oficinas

[![CI](https://github.com/Kaylu1/Pi_Unifio_2026/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaylu1/Pi_Unifio_2026/actions/workflows/ci.yml)

Sistema do Projeto Integrador de Engenharia de Software para acompanhar o atendimento de uma oficina: solicitação do cliente, agendamento, inspeção, orçamento, execução, estoque e pós-venda.

> **Tecnologia do projeto:** o back-end foi desenvolvido em **Node.js com TypeScript**, em substituição ao **Spring Boot e Spring Data JPA** previstos no enunciado. A alteração tecnológica foi autorizada pelo professor.

O back-end aplica as regras da oficina e mantém a integridade dos registros. A interface utiliza Angular; a API é implementada em Node.js e TypeScript. O ambiente publicado utiliza PostgreSQL no Supabase e hospedagem na Vercel.

[Aplicação](https://pi-unifio-2026.vercel.app) · [Documentação](docs/README.md) · [API](docs/documentacao-api.md) · [Modelo de dados](docs/modelo-dados.png) · [Postman](postman/README.md)

## Integrantes

| Nome completo | RA |
|---|---|
| Caio Eduardo Sapata Bruno | 270667 |
| Lucas Henrique Benitez de Moraes | 272807 |
| Luis Felipi Ferreira | 273194 |
| João Lucas Silva Terçariol | 270959 |
| Gabriel Claudino Martins Silva | 272425 |
| Saymon Emanuel Lourenço Guilherme  | 273132 |


## Funcionalidades

- Cadastro de clientes, veículos, equipe, serviços, fornecedores e peças.
- Solicitação de atendimento pelo catálogo, com descrição do problema e seleção de serviços.
- Agendamento com disponibilidade por mecânico e bloqueio de horários sobrepostos.
- Ordens de serviço com inspeção, orçamento, aprovação e acompanhamento da execução.
- Geração de orçamento em PDF e aprovação dos itens pelo cliente.
- Entradas, saídas e estornos de estoque, com controle de saldo e sugestão de reposição.
- Atendimento de pós-venda, relatórios e acesso conforme o perfil do usuário.

## Tecnologias e adequação acadêmica

O professor autorizou, conforme informado pelo grupo, substituir **Spring Boot/Spring Data JPA por Node.js/TypeScript** e **MySQL por PostgreSQL/Supabase**. Os objetivos funcionais da atividade foram mantidos: API REST, persistência relacional, arquitetura em camadas, validação, consultas e autenticação HTTP Basic.

| Componente | Implementação |
|---|---|
| Interface | Angular 20, Angular Material e TypeScript |
| API | Node.js 24, TypeScript 5.9 e módulos nativos HTTP/HTTPS |
| Persistência de nuvem | PostgreSQL/Supabase e driver `pg`, com SQL parametrizado e transações |
| Desenvolvimento local | MySQL Community 8.4 e `mysql2/promise` |
| Autenticação | HTTP Basic para a API; sessão HttpOnly e proteção CSRF na interface |
| Hospedagem | Angular e API serverless na Vercel |
| Testes | Node.js Test Runner, PostgreSQL local/PGlite, Playwright e Postman/Newman |

A correspondência entre as tecnologias e os critérios da atividade está na [matriz de requisitos](docs/ACADEMICO-REQUISITOS.md). A confirmação sobre a dispensa de utilizar o e-commerce do professor como código-base continua registrada nessa matriz.

## Estrutura do repositório

~~~text
oscar/
├── .github/workflows/ci.yml
├── README.md
├── package.json
├── package-lock.json
├── angular.json
├── vercel.json
├── api/
│   ├── index.ts                       entrada da função Vercel
│   └── tsconfig.json
├── docs/
│   ├── README.md                      índice da documentação
│   ├── modelo-dados.png               modelo PostgreSQL/Supabase
│   ├── documentacao-api.md
│   └── ACADEMICO-REQUISITOS.md
├── postman/
│   ├── README.md
│   ├── projeto-integrador.postman_collection.json
│   ├── evidencias-manuais/
│   └── newman-result.json
├── server/
│   ├── README.md
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── models.ts
│   ├── contracts.ts
│   └── postgres-store.ts
├── src/                              aplicação Angular
├── public/                           recursos estáticos
├── scripts/                          execução, preparo e verificação
├── supabase/migrations/              estrutura do PostgreSQL
└── tests/
    ├── README.md
    └── helpers/
~~~

A estrutura recomendada no enunciado foi adaptada à implementação adotada:

| Modelo Java | Equivalente no OScar |
|---|---|
| `pom.xml` | `package.json` e `package-lock.json` |
| `src/main/` | `server/` para o back-end, `src/` para o Angular e `api/` para a Vercel |
| `src/test/` | `tests/` e testes de domínio em `server/*.test.mjs` |
| Modelo, documentação da API e coleção | Mantidos nos caminhos `docs/modelo-dados.png`, `docs/documentacao-api.md` e `postman/projeto-integrador.postman_collection.json` |

## Arquitetura e dados

O fluxo do back-end é **Controller → Services → Repository → Banco de dados**. O controller trata HTTP; os serviços coordenam os casos de uso e as regras; os repositórios executam as consultas e transações. A entrada da Vercel injeta o repositório PostgreSQL nos mesmos serviços usados localmente.

O domínio possui 12 entidades: clientes, veículos, usuários, serviços, fornecedores, peças, solicitações, agendamentos, ordens, orçamentos, movimentações e chamados. O PostgreSQL mantém chaves estrangeiras, índices e restrições; os itens e os retratos históricos dos atendimentos utilizam JSONB.

Entre as regras estão a prevenção de conflito de agenda, a aprovação antes da execução, o impedimento de estoque negativo e o bloqueio de conclusão de uma O.S. com itens aprovados ainda não executados. As consultas personalizadas incluem agenda por data/mecânico e peças abaixo do mínimo.

[Camadas do back-end](server/README.md) · [Modelo PostgreSQL](docs/modelo-dados.svg) · [Migrações](supabase/migrations/) · [Modelo MySQL local](docs/modelo-dados-mysql.svg)

## Execução local

Requisitos: **Node.js 24**, npm e Windows para o preparo automatizado do MySQL local.

Na raiz do projeto:

~~~powershell
npm.cmd ci
node scripts/mysql-local.mjs setup
npm.cmd start
~~~

O preparo do MySQL é necessário na primeira execução. O comando `npm.cmd start` inicia o banco local, a API e o Angular. A interface atende em **https://localhost:4201**, e a API direta em **https://127.0.0.1:4301/api**. O certificado de desenvolvimento é local.

| Ambiente | Endereço | Banco |
|---|---|---|
| Aplicação publicada | https://pi-unifio-2026.vercel.app | PostgreSQL/Supabase |
| Desenvolvimento local | https://localhost:4201 | MySQL, schema `oscar_local` |
| API de demonstração do Postman | http://127.0.0.1:4302/api | PostgreSQL local/PGlite |

Os ambientes possuem configurações e registros próprios. Dados, credenciais e dependências locais ficam fora do Git. A configuração de nuvem está nos guias [Supabase](docs/SUPABASE.md) e [Vercel](docs/VERCEL.md).

## Demonstração da API no Postman

Para iniciar uma base PostgreSQL de testes com dados fictícios, execute:

~~~powershell
node scripts/academic-postgres-fixture.mjs
~~~

Mantenha o processo em execução e utilize a coleção [projeto-integrador.postman_collection.json](postman/projeto-integrador.postman_collection.json), com `baseUrl` igual a `http://127.0.0.1:4302/api`. Esse banco é efêmero: reiniciar o processo recria a base.

A coleção utiliza HTTP Basic com contas de teste:

| Perfil | E-mail |
|---|---|
| Gerente | gerente@oscar.local |
| Mecânico | mecanico@oscar.local |

Senha dessas contas de teste: **Oscar@2026!**. As contas do Supabase são independentes.

A coleção contém **87 requisições, 88 exemplos de respostas e 28 variáveis preenchidas**. Um dos exemplos foi salvo manualmente no aplicativo por **Save Response**; o arquivo original e sua resposta JSON estão em [evidências manuais](postman/evidencias-manuais/). A reprodução da coleção pelo Newman aprovou **87 requisições e 87 verificações**, sem falhas.

O [guia do Postman](postman/README.md) apresenta importação, uso local no Postman 12 e reprodução. A captura automática substitui a coleção gerada; preserve os exemplos manuais antes de regenerá-la.

## Verificação

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
~~~

O [workflow de CI](.github/workflows/ci.yml) executa instalação, verificação de tipos, testes e build em pushes para `main` e pull requests. Os testes gerais usam bancos isolados e não precisam das credenciais do Supabase.

Os testes de MySQL real e navegador possuem preparação própria. Consulte [testes/README](tests/README.md) para executar essas suítes e [o relatório de validação](docs/ACADEMICO-VALIDACAO.md) para conferir os ambientes e resultados registrados.

## Materiais da entrega

| Material | Arquivo |
|---|---|
| Modelo de dados | [docs/modelo-dados.png](docs/modelo-dados.png) |
| Documentação dos endpoints | [docs/documentacao-api.md](docs/documentacao-api.md) |
| Coleção com variáveis e respostas | [postman/projeto-integrador.postman_collection.json](postman/projeto-integrador.postman_collection.json) |
| Conferência dos requisitos | [docs/ACADEMICO-REQUISITOS.md](docs/ACADEMICO-REQUISITOS.md) |
| Roteiro de apresentação | [docs/ACADEMICO-APRESENTACAO.md](docs/ACADEMICO-APRESENTACAO.md) |
| Evidências de funcionamento | [docs/ACADEMICO-VALIDACAO.md](docs/ACADEMICO-VALIDACAO.md) |

Um integrante deve entregar o link de [Kaylu1/Pi_Unifio_2026](https://github.com/Kaylu1/Pi_Unifio_2026) na atividade **Projeto Integrador**, no Ambiente Conhecer. Todos devem estar preparados para explicar o modelo, as camadas, as regras e as requisições demonstradas.
