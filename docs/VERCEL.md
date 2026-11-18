# Implantação na Vercel — OScar

O projeto mantém uma aplicação Angular e uma API Node.js/TypeScript na mesma origem. Na implantação de nuvem, a API utiliza o PostgreSQL do Supabase exclusivo do OScar. A execução padrão por `npm.cmd start` continua utilizando a alternativa MySQL local.

Endereço canônico configurado: **https://pi-unifio-2026.vercel.app**.

## Estrutura utilizada

| Arquivo ou diretório | Responsabilidade |
|---|---|
| `src/` e `public/` | Código e recursos da interface Angular |
| `server/` | Modelos, regras, serviços e repositórios do back-end TypeScript |
| `api/index.mjs` | Adaptador de requisição/resposta para a função da Vercel |
| `vercel.json` | Build, saída estática, roteamento, cabeçalhos e manutenção |
| `supabase/migrations/` | Migrações versionadas do PostgreSQL |
| `.vercelignore` | Exclusão de dados locais, credenciais e artefatos de desenvolvimento do pacote de implantação |

O ponto de entrada serverless injeta `createPostgresStore` na API, reutiliza um pool de uma conexão e processa a requisição pela mesma camada de serviços utilizada no projeto local. A função recebe requisições da plataforma; a abertura da porta HTTP pertence ao iniciador de execução local.

## Configuração versionada

Os valores abaixo correspondem ao [vercel.json](../vercel.json) e ao [package.json](../package.json).

| Item | Configuração |
|---|---|
| Root Directory na importação do GitHub | `./`, pois `package.json` e `vercel.json` estão na raiz do repositório |
| Diretório de trabalho nesta máquina | `C:\Users\Kaylu\Desktop\p.i\oscar` |
| Framework da interface | Angular |
| Versão Node.js | 24.x |
| Instalação | `npm ci` |
| Build | `npm run build` |
| Saída estática | `dist/oscar/browser` |
| Função da API | `api/index.mjs` |
| Duração máxima configurada da função | 60 segundos |
| Roteamento da API | `/api` e `/api/*` encaminhados à função |
| Roteamento da interface | Fallback das rotas Angular para `index.html`, preservando API e arquivos estáticos |
| Manutenção | `/api/_maintenance`, agenda `0 6 * * *` (06h UTC) |

O arquivo também define cabeçalhos de segurança, cache dos recursos estáticos e redirecionamento do domínio antigo com sufixo `-z1wc` para o endereço canônico.

## Variáveis privadas do ambiente

| Variável | Configuração esperada |
|---|---|
| `APP_ORIGIN` | `https://pi-unifio-2026.vercel.app` para a implantação canônica |
| `DATABASE_URL` | URI PostgreSQL privada do Transaction pooler do Supabase OScar |
| `DATABASE_SSL_CA` | CA em PEM, quando exigida pela cadeia TLS do pooler |
| `CRON_SECRET` | Segredo aleatório com no mínimo 32 caracteres |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Opcionais, para entrega de e-mail pelo servidor configurado |

A origem deve corresponder exatamente ao domínio utilizado naquele ambiente. A API valida host e origem antes de acessar o banco. O adaptador PostgreSQL verifica o certificado TLS e utiliza `pg.Pool` com uma conexão por instância da função.

As variáveis reais são configuradas no servidor da Vercel. O Angular chama somente `/api` no próprio domínio. As contas da aplicação e as credenciais SQL são independentes; a autenticação continua sendo implementada pelo OScar.

Sem configuração válida de origem, banco e manutenção, a função retorna **503 em JSON**. A interface estática pode continuar carregando nessa situação, portanto a abertura da página não comprova disponibilidade da API.

## Preparação e publicação

1. Na pasta do projeto, execute `npm.cmd ci`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:postgres` e `npm.cmd run build`.
2. Confira as migrações e a conexão do projeto Supabase dedicado conforme [SUPABASE.md](SUPABASE.md). Em banco existente, aplique somente as alterações pendentes após revisar o schema.
3. No projeto Vercel da conta correta, confira a raiz, o ambiente de destino e as variáveis privadas. O repositório do grupo é [Kaylu1/Pi_Unifio_2026](https://github.com/Kaylu1/Pi_Unifio_2026).
4. Quando o envio e a implantação estiverem autorizados, publique a versão revisada pelo fluxo configurado para o projeto. Depois, compare o commit implantado com o commit que será apresentado.
5. Confira o fluxo completo no domínio publicado antes da demonstração: página, API, autenticação e operações da oficina.

A configuração versionada e os testes locais não comprovam, por si só, que uma nova versão foi implantada. A coleção Postman e a documentação da API estão em [documentacao-api.md](documentacao-api.md); o modelo físico correspondente ao Supabase está em [modelo-dados.png](modelo-dados.png).

## Conferência do ambiente publicado

| Verificação | Evidência esperada |
|---|---|
| `GET /entrar` | HTTP 200 e interface Angular carregada |
| `GET /api/health` | HTTP 200, JSON válido e `database: postgres` |
| Endpoint protegido sem autenticação | HTTP 401 |
| Usuário autenticado sem permissão | HTTP 403 |
| Catálogo e fluxo autenticado | Respostas coerentes com os registros do ambiente correto |

Na conferência de **18/11/2026**, `/entrar` respondeu **200**, mas `/api/health` respondeu **503**. Após a reativação do Supabase, as conexões verificadas por TLS nas portas **5432** e **6543** funcionaram. O adaptador real da Vercel, executado localmente com o Supabase e a configuração privada preparada, respondeu **200** em `/api/health`, com `mode: cloud` e `database: postgres`. Essa comparação usou uma transação **READ ONLY**, encerrada com `ROLLBACK`.

No endereço publicado, `/api/a.b` respondeu **400** e uma requisição com origem externa respondeu **403**. Esses resultados mostram que a validação básica de configuração e o roteamento da função passaram; o **503** permanece na etapa de inicialização. Ainda não foi possível distinguir uma diferença nas variáveis efetivamente implantadas, uma falha de conexão a partir da Vercel ou um problema no carregamento dos módulos publicados.

A API de nuvem permanece **indisponível na observação registrada**. Os próximos dados necessários são a configuração e os registros de execução do projeto na conta Vercel do proprietário. O teste local não confirma que o ambiente publicado utiliza os mesmos valores ou o mesmo código. Nenhuma alteração remota de dados, migração ou nova implantação foi executada por esta conferência.
