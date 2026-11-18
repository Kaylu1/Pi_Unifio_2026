# Back-end do OScar

A API é implementada em TypeScript e utiliza os módulos HTTP/HTTPS do Node.js. O processamento segue **Controller → Services → Repository**. Os adaptadores de banco compartilham o contrato [WorkshopRepository](contracts.ts).

## Organização

| Arquivo ou diretório | Responsabilidade |
|---|---|
| [server.ts](server.ts) | Composição da aplicação e inicialização HTTP/HTTPS local |
| [controllers/api-controller.ts](controllers/api-controller.ts) | Entrada HTTP, leitura das requisições, respostas e tratamento central de erros |
| [services/application-service.ts](services/application-service.ts) | Encaminhamento dos casos de uso, autorização e coordenação das operações |
| [services/crud-service.ts](services/crud-service.ts) | Gerenciamento dos registros e consultas do domínio |
| [services/auth-service.ts](services/auth-service.ts) | HTTP Basic, credenciais, sessões e proteção das operações autenticadas |
| [contracts.ts](contracts.ts) · [models.ts](models.ts) | Contratos das camadas e tipos das entidades |
| [domain.ts](domain.ts) · [entities.ts](entities.ts) | Regras de domínio, validações e exceções próprias |
| [postgres-store.ts](postgres-store.ts) | Persistência PostgreSQL com `pg`, consultas parametrizadas e transações |
| [repositories/mysql-repository.ts](repositories/mysql-repository.ts) | Adaptador MySQL local com `mysql2/promise` |
| [repositories/sqlite-repository.ts](repositories/sqlite-repository.ts) | Adaptador SQLite usado nas suítes de regressão e na alternativa local correspondente |
| [repositories/security-repository.ts](repositories/security-repository.ts) | Acesso aos dados de credenciais e sessões |
| [repositories/report-repository.ts](repositories/report-repository.ts) | Acesso aos dados dos relatórios |

Os arquivos [operations-routes.ts](operations-routes.ts), [order-routes.ts](order-routes.ts) e [service-requests.ts](service-requests.ts) reúnem operações da oficina chamadas pela camada de serviços. O controller encaminha os comandos para essa camada; ele não executa SQL nem acessa os repositórios diretamente.

## Execução e implantação

- A entrada local prepara o servidor e utiliza o adaptador selecionado pelo iniciador. O comando padrão `npm.cmd start` usa MySQL local.
- A função [api/index.ts](../api/index.ts) recebe as requisições da Vercel e injeta o repositório PostgreSQL. Ela usa os mesmos serviços da aplicação local.
- As configurações [api/tsconfig.json](../api/tsconfig.json) e [server/tsconfig.json](tsconfig.json) ajustam os imports TypeScript durante a compilação para JavaScript.
- Os arquivos `.mjs` de compatibilidade permitem executar integrações e testes existentes; os fontes do back-end estão nos arquivos `.ts`.

Consulte o [README principal](../README.md) para instalação e comandos, a [documentação da API](../docs/documentacao-api.md) para os endpoints e o [guia de testes](../tests/README.md) para as verificações disponíveis.
