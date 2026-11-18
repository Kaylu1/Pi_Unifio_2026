# PostgreSQL no Supabase — OScar

O ambiente de nuvem do OScar utiliza **PostgreSQL no Supabase**. Conforme autorização do professor informada pelo grupo, PostgreSQL/Supabase substitui o MySQL previsto no enunciado, assim como Node.js e TypeScript substituem Spring Boot e JPA.

A aplicação mantém um adaptador MySQL para execução local. Os dois ambientes compartilham a API e as regras da oficina, mas possuem modelos físicos e configurações próprios.

## Arquitetura de acesso

```text
Angular → /api na Vercel → serviços TypeScript → repositório PostgreSQL → Supabase
```

A função [api/index.mjs](../api/index.mjs) cria e reutiliza um `createPostgresStore` e o injeta na API. O [adaptador PostgreSQL](../server/postgres-store.ts) utiliza `pg.Pool`, com uma conexão por instância da função, consultas parametrizadas e transações. A conexão verifica TLS e o nome do servidor.

O Angular chama a API na mesma origem da aplicação. Credenciais SQL e privilégios administrativos permanecem exclusivamente no servidor. A autenticação é implementada pelo OScar, com HTTP Basic para a API, sessão e CSRF na interface e autorização por perfil nos serviços.

## Modelo do banco

O schema privado é `oscar_private`. As migrações versionadas definem **21 tabelas**: 12 entidades de domínio e nove tabelas de suporte.

- **Domínio:** clientes, veículos, usuários, serviços, fornecedores, peças, solicitações, agendamentos, ordens de serviço, orçamentos, movimentações e chamados.
- **Suporte:** e-mails, auditoria, parâmetros, sessões, recuperação de senha, limites de tentativas, snapshots e marcadores de anonimização.

As tabelas de domínio têm chave primária `id` e conteúdo complementar em `data JSONB`. Os vínculos físicos de cliente, veículo, mecânico, fornecedor, ordem e peça utilizam colunas com chaves estrangeiras. Itens, inspeções, listas de serviços e snapshots históricos pertencem aos componentes JSONB. Índices de expressão e restrições protegem documentos e identificações ativas, códigos de peças, saldo e tipos de movimentação.

O modelo PostgreSQL corresponde à estrutura das migrações do Supabase. O modelo MySQL local possui organização física própria, incluindo tabelas associativas.

| Documento | Conteúdo |
|---|---|
| [Modelo PostgreSQL/Supabase](modelo-dados.svg) · [PNG](modelo-dados.png) · [Mermaid](modelo-dados.mmd) | Entidades, colunas e FKs físicas do PostgreSQL |
| [Migração principal](../supabase/migrations/202610220001_oscar_private.sql) | Schema, entidades, vínculos, índices, restrições e RLS |
| [Migração de solicitações](SQL_PARA_APLICAR_DEPOIS.txt) | Solicitações públicas e marcadores de anonimização |
| [Modelo MySQL local](modelo-dados-mysql.svg) | Estrutura do adaptador local alternativo |

As migrações habilitam RLS e restringem o acesso dos papéis públicos ao schema. A API usa a conexão SQL privada autorizada no servidor. O schema `oscar_private` deve permanecer fora da lista de schemas expostos publicamente pela Data API do Supabase.

## Configuração da conexão

O projeto esperado é o **Supabase exclusivo do OScar**, referência `kotiorssahochknggjzc`. A configuração deve corresponder a esse projeto e ao ambiente correto da Vercel.

| Variável do servidor | Finalidade |
|---|---|
| `DATABASE_URL` | URI privada PostgreSQL do projeto OScar, com usuário e senha do banco |
| `DATABASE_SSL_CA` | Certificado PEM da CA, quando necessário para validar a cadeia TLS do pooler |
| `APP_ORIGIN` | Origem HTTPS exata da aplicação; endereço canônico: `https://pi-unifio-2026.vercel.app` |
| `CRON_SECRET` | Segredo com pelo menos 32 caracteres para a manutenção protegida |

Para a função serverless, a configuração prevista utiliza o **Transaction pooler** do Supabase, normalmente na porta **6543**, e um pool de uma conexão por instância. O adaptador mantém a verificação TLS; a CA deve corresponder à cadeia do servidor escolhido.

O arquivo [.env.example](../.env.example) apresenta somente os nomes e placeholders das variáveis. Os valores reais são configurados no ambiente privado da Vercel ou nos arquivos locais ignorados pelo Git.

## Preparo e execução

Em um banco existente, confira quais migrações já foram aplicadas e execute somente as pendentes, preservando usuários e dados da oficina. A migração principal utiliza `CREATE ... IF NOT EXISTS` e insere a configuração inicial com `ON CONFLICT DO NOTHING`.

O comando `npm.cmd run setup:oscar-supabase` é destinado ao preparo inicial do projeto dedicado e à criação do primeiro gerente. O instalador verifica o estado do schema. A aplicação de uma alteração posterior deve ser tratada como migração incremental do banco existente.

O comando `npm.cmd run start:oscar-supabase` corresponde ao iniciador local do Angular/API com o adaptador PostgreSQL e a configuração privada do projeto dedicado. O comando `npm.cmd start` utiliza a alternativa **MySQL local** em `127.0.0.1:3307`.

A orientação para a função de nuvem e suas variáveis está em [VERCEL.md](VERCEL.md). A coleção e os procedimentos de teste estão em [postman/README.md](../postman/README.md); as contas de demonstração são próprias de cada ambiente.

## Estado observado em 18/11/2026

Uma tentativa inicial retornou o código PostgreSQL **XX000**. Após o usuário informar a reativação do projeto, as conexões ao pooler nas portas **5432** e **6543** funcionaram com verificação TLS. Consultas somente de leitura confirmaram PostgreSQL **17.11**, as **21 tabelas** de `oscar_private` e a presença de `settings` e `users`.

O adaptador real `api/index.mjs`, executado localmente com as variáveis privadas preparadas para a Vercel e esse Supabase, respondeu **HTTP 200** em `/api/health`, com `mode: cloud` e `database: postgres`. O teste manteve a conexão dentro de uma transação **READ ONLY**, encerrada com `ROLLBACK`.

A API publicada continuou respondendo **HTTP 503**. Assim, a conexão local com o Supabase está comprovada, mas a inicialização na Vercel ainda requer diagnóstico do ambiente efetivamente implantado. Esta conferência não aplicou migrações nem alterou dados remotos.
