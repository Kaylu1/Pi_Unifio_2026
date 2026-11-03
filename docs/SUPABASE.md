# Supabase/PostgreSQL — banco dedicado do OScar

O projeto Supabase dedicado `kotiorssahochknggjzc` foi criado pelo usuário e configurado em 28/10/2026. As duas migrações foram aplicadas com TLS verificado. O esquema `oscar_private` tem 21 tabelas com RLS, uma configuração inicial e o gerente **Roberto** (`roberto@oscar.local`), cujo login foi validado. Serviços, clientes e solicitações estão vazios. As credenciais deste trabalho acadêmico ficam somente em `data/oscar-supabase.local.json`, na pasta do OScar. Git e Vercel continuam fora desta etapa.

A aplicação continua usando autenticação própria na API REST. O modo local com Supabase usa PostgreSQL; o navegador não recebe a senha do banco, `DATABASE_URL`, chave administrativa ou conexão SQL. O modo SQLite local permanece disponível.

## Arquivos preparados

| Arquivo | Responsabilidade |
|---|---|
| [Migração SQL](../supabase/migrations/202610220001_oscar_private.sql) | Cria o esquema privado, relações, restrições, índices e RLS. |
| [SQL das solicitações públicas](SQL_PARA_APLICAR_DEPOIS.txt) | Adiciona solicitações e marcadores de anonimização. |
| [Adaptador PostgreSQL](../server/postgres-store.mjs) | CRUD assíncrono, transações, rate limit e snapshots privados. |
| [CA pública do Supabase](../server/supabase-root-2021.cer) | Raiz validada pela impressão digital para TLS e hostname do pooler. |
| [Instalador local](../scripts/oscar-supabase.mjs) | Lê as credenciais locais; aplica as duas migrações e cria Roberto. |
| [Variáveis de exemplo](../.env.example) | Nomes das configurações do servidor, sem credenciais reais. |
| [Gerador do primeiro gerente](../scripts/admin-sql.mjs) | Produz SQL offline com senha derivada; não acessa banco ou internet. |
| [Entrada da API](../api/index.mjs) | Integração preparada para o ambiente serverless. |
| [Testes PostgreSQL](../tests/postgres.store.mjs) | Verificações em PostgreSQL WASM local, usando PGlite. |
| [Fixture sem rede](../tests/helpers/postgres-fixture.mjs) | Adapta PGlite ao contrato Pool/Client do driver. |

## 1. O que a migração contém

O esquema é `oscar_private`, separado dos esquemas públicos. As duas migrações criam 21 tabelas:

- 13 entidades: clientes, veículos, usuários, serviços, fornecedores, peças, agenda, O.S., orçamentos, movimentos, chamados, e-mails e auditoria.
- Configuração, sessões, recuperação de senha e limites de tentativas.
- Solicitações públicas de serviço, snapshots lógicos privados e marcadores de exclusão de titulares e solicitações.

As entidades usam JSONB para os dados complementares e colunas relacionais para os vínculos, com chaves estrangeiras. CPF ativo, e-mail ativo, placa ativa normalizada e código de peça têm proteção de unicidade; saldo negativo e movimentos inválidos são rejeitados também pelo banco.

Todas as tabelas têm RLS habilitada. O arquivo revoga acesso de `PUBLIC`, `anon` e `authenticated`, quando esses papéis existem. Não cria políticas de acesso público. Os testes comprovaram que RLS continua negando linhas mesmo se alguém conceder SELECT à função de cliente.

A conexão administrativa da API é privada e pode usar o proprietário SQL autorizado. Não se deve adicionar `oscar_private` aos esquemas expostos da Data API/PostgREST. Os papéis próprios do OScar são validados no servidor, além dessas proteções do banco.

A migração principal é idempotente: reaplicar não apaga dados nem redefine parâmetros existentes. Ela cria somente os valores iniciais de configuração. **Não cria usuário demonstrativo ou senha padrão.** O instalador do projeto novo executa as duas migrações e cria somente o gerente Roberto.

## 2. Estrutura vazia criada no projeto dedicado

Em 28/10/2026, este comando foi executado dentro da pasta `p.i/oscar`:

```powershell
npm.cmd run setup:oscar-supabase
```

O instalador conhece somente a referência pública do projeto OScar e o host do Session pooler fornecido pelo usuário, na porta `5432`. Ele lê as credenciais de `data/oscar-supabase.local.json`, verifica o destino antes de conectar e recusa qualquer esquema `oscar_private` já existente. **Não execute o preparo novamente nesse projeto.** Em uma transação, aplicou a migração principal, o SQL de solicitações e criou **Roberto** (`roberto@oscar.local`). Não copiou dados de demonstração nem gravou `.env` ou SQL com credenciais.

Para corrigir `SELF_SIGNED_CERT_IN_CHAIN`, o instalador carrega `server/supabase-root-2021.cer` e confere a impressão digital SHA-256 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`. O Node continua verificando certificado e hostname. A mesma CA é enviada somente ao processo da API local, nunca ao Angular. [Orientação do Supabase sobre a CA](https://supabase.com/docs/guides/database/connecting-to-postgres).

Para usar o banco remoto a partir da interface local, execute `npm.cmd run start:oscar-supabase` e abra `https://localhost:4202`. A senha do banco é lida do arquivo local. Na verificação de 28/10/2026, o frontend respondeu nessa origem e o endpoint de saúde da API respondeu **200**. O SQLite normal continua separado em `https://localhost:4201` com `npm.cmd start`.

O e-mail `.local` é apenas para entrar no aplicativo. Para entrega externa e recuperação por e-mail, configure depois um endereço real e SMTP. O arquivo local de credenciais fica excluído do Git e do futuro deploy.

## 3. Conexão futura da API na Vercel

Use a conexão **Transaction pooler** copiada do painel Connect do projeto, normalmente na porta `6543`. O nome do host e do usuário deve ser copiado, sem deduzi-lo a partir da região. Esse modo é indicado para funções de curta duração; não admite estado de sessão persistente nem prepared statements nomeados. [Documentação de conexão Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Configurações somente do servidor:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | URI PostgreSQL com usuário, senha codificada e host do projeto autorizado. |
| `DATABASE_SSL_CA` | Certificado CA PEM do banco, quando necessário para validar sua cadeia de confiança. |
| `APP_ORIGIN` | Origem HTTPS exata da interface/API publicada futuramente. |
| `CRON_SECRET` | Segredo aleatório para a manutenção restrita. |
| `SMTP_*` | Opcionais, para transporte real de e-mail com TLS. |

O exemplo está em [.env.example](../.env.example). Não copie esses valores para `src/`, arquivos Angular de ambiente, assets ou respostas da API. Uma chave pública Supabase não substitui a conexão SQL desse adaptador.

O pool padrão tem **uma conexão** por instância aquecida; o adaptador aceita configuração entre uma e três, somente após medir necessidade. Queries são enviadas sem `name`, evitando prepared statements nomeados. A conexão é reutilizada pelo módulo da API. [Orientação oficial de pool e transaction mode](https://supabase.com/docs/guides/database/connecting-to-postgres).

TLS verifica certificado e hostname (`rejectUnauthorized: true`). O adaptador remove opções da URI que poderiam sobrescrever esse contrato. Se a CA do projeto não estiver no repositório de confiança do Node.js, forneça o PEM obtido pelo painel; não desative a verificação. O driver pode substituir o objeto SSL quando parâmetros SSL permanecem na URI, motivo dessa normalização. [TLS no node-postgres](https://node-postgres.com/features/ssl), [verificação SSL no Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement).

## 4. Integridade entre instâncias

A API recebe o store por injeção. Cada transação adquire uma conexão, executa BEGIN e usa um **advisory lock transacional** comum à oficina, seguido de COMMIT ou ROLLBACK. Assim, o ciclo leitura→validação→baixa de estoque é protegido também quando há mais de uma instância da API.

O lock é transacional; o adaptador não depende de SET de sessão ou de estado retido pelo pooler. Savepoints isolam operações aninhadas. Um contexto assíncrono mantém todas as queries da operação na mesma conexão.

Essa implementação prioriza consistência em uma oficina e serializa as alterações críticas. Não é uma afirmação de capacidade para carga arbitrária; desempenho deve ser medido com banco remoto e volume representativo antes de uso real.

Limites de login/recuperação/orçamento ficam em `rate_limits`, com chave derivada por SHA-256, contador e expiração. Um UPSERT atômico preserva os limites entre instâncias; reiniciar uma função não apaga as tentativas.

## 5. Manutenção, snapshots e exclusão de dados

No modo PostgreSQL, snapshots ficam na tabela privada `backups`, uma cópia lógica por dia, em transação. Não se grava um arquivo de banco no disco de uma função serverless.

O snapshot preserva registros duráveis, parâmetros e hashes de credenciais necessários à recuperação. Exclui sessões, tokens de recuperação e contadores de tentativas; remove links/tokens de orçamentos e links temporários de e-mail. A API retorna apenas metadados do snapshot, não seu conteúdo.

A manutenção pode ser chamada pelo endpoint restrito `/api/_maintenance`, com o segredo configurado. O arquivo Vercel prepara o agendamento, mas executar localmente ou possuir a configuração não comprova que um cron remoto esteja ativo.

A anonimização registra marcadores persistentes de titulares e solicitações públicas, remove dados na base ativa e saneia os snapshots lógicos. A restauração interna consulta esses marcadores, revoga sessões e impede que uma cópia antiga reintroduza os identificadores removidos. Snapshot incompleto é rejeitado antes de apagar registros ativos. A restauração é uma operação administrativa interna; não foi disponibilizada como uma ação pública de cliente.

**Limite do expurgo:** a aplicação controla seus registros/snapshots lógicos. Não controla remoção física imediata de WAL, réplicas, cópias gerenciadas pelo provedor ou exportações externas. Retenção, recuperação de desastre e tratamento de uma solicitação de exclusão nessas outras camadas exigem política operacional e os recursos do provedor. Não se declara conformidade jurídica integral com base nos testes locais.

Os snapshots dentro do mesmo banco não substituem uma cópia de recuperação independente do provedor. Recuperação do serviço inteiro e perda da conta precisam de um plano operacional próprio antes de produção.

## 6. O que foi efetivamente testado

Comando local:

```powershell
node --test tests/postgres.store.mjs
```

Os testes de PostgreSQL passam no PGlite, sem rede:

- Reaplicação das migrações, 21 tabelas e preservação de parâmetros.
- RLS, ausência de grants para clientes e negação mesmo diante de SELECT concedido.
- CPF/placa/código únicos, chaves estrangeiras e bloqueio de estoque negativo.
- CRUD JSONB, hash fora do objeto público e campos compatíveis com autenticação.
- Rollback, savepoints e consumo concorrente por dois stores injetados.
- Contador de tentativas compartilhado, persistente e com expiração atômica.
- Snapshot diário sem sessões/tokens/links temporários.
- Expurgo e restauração com marcadores contra reintrodução de dados pessoais.
- Validação TLS do pool e rejeição de snapshot incompleto.

O PGlite executa PostgreSQL em WASM e permite validar SQL e contratos localmente. Ele usa um único backend; a fixture serializa leases para imitar o pool. Separadamente, a configuração real de 28/10/2026 verificou TLS, esquema, RLS, contagens iniciais, login do gerente e respostas locais do frontend e da API. Ainda faltam medições de múltiplas instâncias, cotas e performance remota.

O teste HTTP integrado da aplicação com esse store é mantido separadamente em `tests/cloud-flow.integration.mjs`; seus resultados devem ser lidos no gate de validação geral. Os resultados PGlite não representam um deploy nem substituem a verificação feita no projeto Supabase real.

Continuam sem comprovação remota nesta preparação: envio SMTP externo, execução real do cron, SLA/disponibilidade de 95%, carga de produção e compatibilidade integral com todas as versões de navegador exigidas na ERS.
