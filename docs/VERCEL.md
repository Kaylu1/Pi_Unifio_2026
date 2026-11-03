# Vercel futura com Supabase já configurado

O Supabase dedicado do OScar já foi configurado e verificado em 28/10/2026. Este guia descreve a futura publicação na Vercel; **nenhum deploy foi realizado**. As credenciais permanecem no arquivo local ignorado pelo envio e precisam ser configuradas separadamente no ambiente da Vercel quando essa etapa for feita.

O frontend permanece Angular 20 + Angular Material 20, SCSS e NgModules, com roteamento e sem SSR. A autenticação continua sendo a do OScar; o Supabase já é usado como PostgreSQL no modo local dedicado, sem substituir o login por Supabase Auth.

## Arquivos prontos

| Arquivo | Finalidade |
| --- | --- |
| `supabase/migrations/202610220001_oscar_private.sql` | Estrutura PostgreSQL privada, relações, restrições, índices e parâmetros iniciais. Sem usuários ou dados demonstrativos. |
| `docs/SQL_PARA_APLICAR_DEPOIS.txt` | Solicitações públicas e marcadores de anonimização. |
| `scripts/oscar-supabase.mjs` | Prepara o banco dedicado do OScar e cria Roberto usando o arquivo de credenciais local. |
| `.env.example` | Nomes das variáveis exclusivas do servidor; os valores são placeholders. |
| `api/index.mjs` | Uma entrada Vercel que injeta PostgreSQL na API e reutiliza um pool pequeno. |
| `vercel.json` | Build Angular, API, roteamento da SPA, cabeçalhos e manutenção diária. |
| `.vercelignore` | Exclui bancos locais, segredos, PDF da ERS, scripts administrativos e evidências do envio. |

## 1. Banco Supabase já preparado

O projeto Supabase dedicado do OScar é `kotiorssahochknggjzc`. Em 28/10/2026, `npm.cmd run setup:oscar-supabase` aplicou as duas migrações e criou o primeiro gerente em uma transação, com TLS verificado. O esquema `oscar_private` tem 21 tabelas com RLS e uma configuração inicial. Serviços, clientes e solicitações estão vazios. O frontend em `https://localhost:4202` e o endpoint de saúde da API foram verificados, com resposta **200** da API. O comando de preparo recusa um esquema existente e não deve ser repetido nesse projeto.

Os dados ficam no schema `oscar_private`. Não inclua esse schema na lista de schemas expostos pela Data API e não crie permissões públicas de leitura. A API do OScar faz o acesso pelo servidor; o Angular não precisa de senha do banco, `service_role`, chave anônima ou conexão direta ao Supabase.

Em **Connect**, copie a URI do **Transaction pooler**, normalmente na porta **6543**. Preencha a senha do banco no campo correto. Se a senha tiver caracteres reservados de URL, use sua representação codificada na URI. Esse modo e o pool inicial de uma conexão são indicados pelo Supabase para aplicações serverless. [Conexões PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

O adaptador usa TLS com verificação do certificado. Se o certificado da sua instalação precisar de uma CA específica, baixe a CA no painel do banco e configure `DATABASE_SSL_CA` com o PEM. Não use `rejectUnauthorized=false` ou `sslmode=disable` para contornar erros de certificado. [Verificação TLS no Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement).

## 2. Primeiro gerente

O comando `npm.cmd run setup:oscar-supabase` criou somente **Roberto** (`roberto@oscar.local`), e seu login foi validado. As credenciais deste trabalho acadêmico ficam no arquivo local `data/oscar-supabase.local.json`, excluído do envio para a Vercel. Nenhuma conta de demonstração, inclusive os acessos do SQLite em `localhost:4201`, foi criada no Supabase.

## 3. Futuramente: preencher as variáveis da Vercel

Configure no painel do projeto, no ambiente que você pretende usar. Não cole credenciais no chat ou no código-fonte. `.env.example` serve como lista de campos, não como arquivo pronto com valores reais.

| Variável | Valor que você preencherá |
| --- | --- |
| `DATABASE_URL` | URI privada do Transaction pooler do seu Supabase. |
| `APP_ORIGIN` | Origem HTTPS exata da aplicação, como `https://nome-escolhido.vercel.app`, sem caminho ou barra final. |
| `CRON_SECRET` | Segredo aleatório com pelo menos 32 caracteres para autenticar a manutenção. |
| `DATABASE_SSL_CA` | Para este Supabase, copie o PEM de `server/supabase-root-2021.cer`; aceita quebras de linha reais ou `\n`. |
| `SMTP_HOST` | Opcional: servidor SMTP do seu provedor. |
| `SMTP_PORT` | `465`, para o transporte com TLS implícito implementado. |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciais SMTP do seu provedor. |
| `SMTP_FROM` | Endereço remetente autorizado no provedor. |

Para gerar o `CRON_SECRET` futuramente no seu terminal, copie o resultado deste comando para o campo privado da Vercel:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```
Marque valores confidenciais como sensíveis. Nenhuma dessas variáveis deve ir para `src/`, arquivos Angular de ambiente, diretório `public/` ou variáveis com prefixo de exposição ao navegador. O frontend chama somente `/api` no próprio domínio.

`APP_ORIGIN` é deliberadamente explícita. Um domínio de preview ou um domínio personalizado diferente será bloqueado pela API até que a configuração desse ambiente corresponda ao endereço escolhido. Não há liberação genérica de todos os domínios `vercel.app`.

Sem `DATABASE_URL`, `APP_ORIGIN` e `CRON_SECRET` válidos, a API retorna **503 em JSON**, sem criar SQLite ou recorrer aos dados do localhost. A página Angular pode carregar, mas as funções que dependem da API permanecerão indisponíveis.

Sem SMTP, a caixa interna continua capturando mensagens para teste. Para uso com clientes reais, configure e teste o SMTP: convite de acesso, recuperação de senha, confirmações e alterações de agendamento dependem da entrega. O transporte atual não implementa STARTTLS na porta 587.

## 4. Futuramente: publicar manualmente a aplicação

A raiz do projeto a ser enviada é **`p.i/oscar`** — a pasta que contém `package.json`, `angular.json` e `vercel.json`. Não envie a pasta `p.i` inteira nem o projeto anterior de controle de peças. Não é necessário publicar nada no GitHub para usar o código local, e esta preparação não adiciona integração Git.

Configurações já registradas em `vercel.json`:

| Configuração | Valor |
| --- | --- |
| Framework | Angular |
| Node.js | 24.x, conforme `package.json` |
| Instalação | `npm ci` |
| Build | `npm run build` |
| Arquivos estáticos | `dist/oscar/browser` |
| API | Uma função `api/index.mjs`, com módulos de negócio em `server/` |

A Vercel suporta handlers Node de requisição/resposta e arquivos `.mjs`. A entrada usa esse contrato, aceita o corpo JSON já processado pela plataforma e não inicia uma porta HTTP. [Runtime Node.js da Vercel](https://vercel.com/docs/functions/runtimes/node-js).

As regras encaminham `/api/*` para a função, preservando a rota e os parâmetros de pesquisa. O fallback da SPA permite abrir diretamente `/ordens/12` e `/redefinir/...`; ele não transforma respostas da API nem arquivos estáticos ausentes em HTML. [Rewrites da Vercel](https://vercel.com/docs/routing/rewrites).

Antes do envio manual futuro, confira `.vercelignore`: `data/`, SQLite, `.env*`, certificados locais, SQL administrativo, testes, screenshots, documentação com acessos demonstrativos e a ERS em PDF ficam fora. Nunca escolha o diretório inteiro como saída estática; use somente `dist/oscar/browser`.

### Comandos para quando você decidir publicar

Estes comandos estão apenas documentados. Eles conectam sua conta e publicam arquivos; não foram executados nesta preparação.

Primeiro, entre na sua conta e vincule um projeto novo ou escolhido, usando a pasta atual como raiz:

```powershell
cd C:\Users\Kaylu\Desktop\p.i\oscar
npx.cmd --yes vercel@latest login
npx.cmd --yes vercel@latest link
```

Em `link`, selecione a conta e o projeto corretos; use `./` como diretório nesta pasta. Isso não exige GitHub. No painel do projeto criado/vinculado, configure as variáveis de **Production** da seção anterior e confira o domínio que será usado em `APP_ORIGIN`.

Com o SQL e o primeiro gerente já preparados no Supabase, após configurar as variáveis da Vercel, o comando de publicação manual será:

```powershell
npx.cmd --yes vercel@latest deploy --prod
```

Confira o domínio e realize a verificação funcional abaixo antes de usar dados reais. O guia mantém esta etapa sob seu controle; nenhum script npm publica automaticamente. Referências: [vinculação pelo CLI](https://vercel.com/docs/cli/link), [deploy pelo CLI](https://vercel.com/docs/cli/deploy).
## Manutenção, e-mails e cópias de segurança

O cron de `/api/_maintenance` está configurado para **uma execução por dia, às 06:00 UTC** (03:00 em Brasília). A Vercel envia `Authorization: Bearer CRON_SECRET`; a API valida o segredo antes de executar a rotina. Sem o segredo correto, a rota não faz manutenção. [Proteção do cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

A frequência diária respeita o limite atual do plano Hobby, que não garante execução no minuto exato. As opções de maior frequência dependem do plano escolhido futuramente. [Limites de cron da Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

A manutenção remove sessões e tokens vencidos, expira orçamentos e cria um snapshot lógico diário no schema privado. A validade dos links também é verificada quando eles são acessados; um orçamento vencido não depende do cron para recusar uma resposta.

O envio SMTP usa uma fila persistida. Depois de uma alteração bem-sucedida, a API usa o `waitUntil` oficial para tentar um lote pequeno após a resposta, sem atrasar a confirmação do atendimento. A rotina tem limite de tempo, não usa intervalos permanentes e mantém mensagens não enviadas para nova tentativa. A manutenção diária também processa a fila. Falhas não cancelam o atendimento. [Tarefas após a resposta com waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil). Em caso de indisponibilidade prolongada ou fila grande, a retentativa diária pode ser lenta; valide o volume e a configuração de entrega antes do uso real.

Snapshots lógicos no mesmo banco não substituem cópias externas ou a proteção oferecida pelo provedor. Configure a política de backup e retenção adequada no Supabase e teste a restauração em uma base separada. A anonimização atualiza também os snapshots da aplicação; a retenção física e os backups gerenciados pelo provedor precisam ser tratados conforme a política escolhida. Não restaure dados pessoais anteriormente excluídos.

## Conferência depois de um deploy que você autorizar no futuro

1. Abra `/api/health` e confira resposta JSON de PostgreSQL; `/api/session` deve responder JSON, nunca `index.html`.
2. Entre com o gerente criado por você. Cadastre registros fictícios e confirme que continuam disponíveis após recarregar a página.
3. Abra uma rota interna diretamente em uma nova aba. Confirme também que uma rota `/api/...` inexistente não devolve a SPA.
4. Teste perfis, agenda sem conflito, aprovação antes da execução, baixa/estorno e bloqueio de encerramento com itens pendentes.
5. Teste entrega de convite, recuperação e confirmação de agendamento no provedor SMTP, sem divulgar os links temporários.
6. Confira cron autenticado, snapshot e registros de erros. A execução de um build local não verifica DNS, credenciais reais, SMTP, limites do plano nem o roteamento efetivo da Vercel.

Se a API responder 503, confira as variáveis privadas, a migração, a conexão do pooler e o certificado. O corpo da resposta omite detalhes que poderiam conter credenciais. Não exponha logs com senhas ou URIs completas ao pedir suporte.

Para voltar a uma versão anterior do frontend/API, use o rollback do projeto na Vercel somente quando necessário e autorizado. Isso **não desfaz alterações no banco**. Antes de qualquer mudança posterior no schema, mantenha uma cópia válida e defina a compatibilidade da aplicação antiga; restauração de banco deve ser uma operação separada e planejada.
