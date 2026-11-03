# OScar — projeto integrador local

Aplicação de gestão de oficinas baseada na **ERS_OScar_v1_4.pdf**. O projeto fica em `C:\Users\Kaylu\Desktop\p.i\oscar`.

## Execução local e versionamento

O repositório GitHub autorizado para o código é **[Kaylu1/Pi_Unifio_2026](https://github.com/Kaylu1/Pi_Unifio_2026)**, separado do projeto anterior de controle de peças. A execução e os testes continuam locais. O pacote npm permanece privado; `npm run verify:local` confere as restrições técnicas e a exclusão de dados e credenciais. A RE05 avança com o versionamento, mas a publicação da aplicação em nuvem ainda não foi autorizada nem realizada.

## Tecnologias e geração

- Angular 20, Angular Material/CDK 20, TypeScript e SCSS.
- NgModules e AppRoutingModule: os componentes **não são standalone**.
- Aplicação SPA sem SSR.
- API REST em Node.js 24; SQLite por padrão e PostgreSQL do Supabase dedicado por opção no uso local.
- Fontes e ícones locais; sem dependência de CDN.
- HTTPS entre navegador e servidor Angular e também entre o proxy e a API.

O comando efetivamente utilizado foi:

```powershell
npx.cmd --yes --package=@angular/cli@20 ng new oscar --no-standalone --routing --ssr=false --style=scss --skip-git --package-manager=npm --defaults
npx.cmd ng add @angular/material@20 --theme=custom --typography=true --animations=true --skip-confirmation --defaults
```

O comando-base solicitado foi preservado, substituindo `testeAngular` por `oscar`. Os parâmetros adicionais selecionam SCSS, impedem a criação de Git e evitam perguntas de instalação.

## Como executar

Requer Node.js 24 compatível com Angular20 (instalado nesta máquina: 24.19.0).

```powershell
cd C:\Users\Kaylu\Desktop\p.i\oscar
npm.cmd install
npm.cmd start
```

Abra **https://localhost:4201**. O comando inicia o frontend e a API, ambos limitados a endereços locais. No primeiro acesso, o navegador pode pedir confirmação do certificado de desenvolvimento. Os certificados são gerados em `data/tls`; não são enviados a serviços externos.

A API usa **https://127.0.0.1:4301/api**; o frontend acessa `/api` pelo proxy. Para encerrar os dois processos, use Ctrl+C no terminal da aplicação.

O comando `npm start` força o armazenamento SQLite local, mesmo que exista uma variável `DATABASE_URL` no terminal. A conexão com o Supabase dedicado só acontece ao escolher explicitamente os comandos `setup:oscar-supabase` e `start:oscar-supabase` descritos abaixo.

As portas podem ser alteradas por `OSCAR_FRONTEND_PORT` e `OSCAR_API_PORT`. O script ajusta o proxy e a origem permitida. Não use `--host 0.0.0.0` nem túneis públicos nesta etapa.

## Aparência, temas e vídeo de entrada

A identidade foi redesenhada em **grafite, branco e laranja**, escolha explícita do usuário. Navegação flutuante, painel de etapas, agenda, cadastros, estoque, O.S., catálogo e telas públicas usam a mesma linguagem, com composições próprias para cada tarefa. O sistema visual está em [DESIGN.md](DESIGN.md).

O controle de tema no acesso e no cabeçalho interno alterna entre **claro e escuro**. A preferência é salva neste navegador e sincronizada entre abas; sem escolha explícita, acompanha o sistema operacional.

O acesso mostra **filmagem real genérica de um mecânico reparando um motor**, do acervo Mixkit (item 4716). O MP4 H.264 local tem 11 segundos, sem som, 1280 × 720, 24fps e cerca de 1,66MiB. Ele inicia mudo e em loop quando permitido, com controle **Pausar/Reproduzir vídeo**. Movimento reduzido ou economia de dados mantém o poster WebP sem baixar o vídeo automaticamente; a reprodução pode ser iniciada pelo usuário. Bloqueio ou falha da mídia mantém o formulário disponível, com aviso e nova tentativa.

Fontes, ícones, vídeo e poster são servidos pelo próprio projeto, sem dependência externa durante o uso. Origem, licença, preparação local e evidências: [docs/VIDEO-LOCAL.md](docs/VIDEO-LOCAL.md). A filmagem não representa instalações ou funcionários do OScar.

Entradas em sequência, revelação de painéis e barras e feedback curto nas ações ampliam o movimento da interface. As animações são finitas; conteúdo e controles continuam disponíveis sem elas. Movimento reduzido desativa as animações e transições.

O teste completo de navegador tem seis suítes. Para conferir somente temas e vídeo com banco isolado:

```powershell
npm.cmd run test:browser -- theme
```

## Avaliação inicial e novas telas

Em **Serviços**, cadastre ou edite um serviço com a finalidade **Avaliação / diagnóstico inicial** e informe o valor. Ao abrir uma O.S., escolha **Avaliação inicial**; registre a inspeção e as necessidades, prepare o orçamento e obtenha a aprovação do cliente antes de executar serviços ou aplicar peças. O diagnóstico demonstrativo existente já está classificado para avaliação, preservando seu preço cadastrado. Alterações futuras no cadastro não reescrevem o valor registrado em uma O.S.

A **Agenda** mostra cada mecânico em uma coluna, das 8h às 18h, com duração proporcional, navegação diária e ações de remarcar/cancelar/abrir O.S. No celular, filtre um mecânico ou role a grade internamente. O horário escolhido só é reservado após a confirmação de disponibilidade da API.

Clientes têm fichas e painel contextual; veículos, uma visão de frota; serviços, uma estação de configuração; fornecedores, equipe e pós-venda têm estruturas próprias. O catálogo público foi refeito com foto local, detalhes expansíveis, busca, ordenação e filtros de duração.

O runner de navegador agora executa **seis suítes**. Para repetir apenas esta entrega em banco isolado: `npm.cmd run test:browser -- layouts`. Evidências e limites: [VALIDACAO.md](docs/VALIDACAO.md). Os testes continuam locais; o repositório GitHub serve para versionar o código e não representa um deploy.
## Contas fictícias para experimentar

Todas as contas abaixo usam a senha demonstrativa **Oscar@2026!**. Não são credenciais reais.

| Perfil | E-mail |
|---|---|
| Gerente | gerente@oscar.local |
| Atendente | atendente@oscar.local |
| Mecânico | mecanico@oscar.local |
| Consultor técnico | consultor@oscar.local |
| Cliente | cliente@oscar.local |

A base inicial tem clientes, veículos, serviços, agenda, ordens em diferentes etapas e peças fictícias. Novos clientes recebem convite para definir senha; não há autocadastro.

## Funcionalidades

- Cadastro de clientes, veículos, equipe, serviços, fornecedores e peças, com pesquisa, filtros e paginação.
- Controle de sessão e permissões na interface **e na API**, com escopo por proprietário e por mecânico.
- Catálogo público de serviços ativos e preços; agendamento realizado somente pela equipe interna.
- Agenda com disponibilidade por duração do serviço e mecânico, cancelamento e remarcação com motivo.
- Abertura de O.S. a partir de agendamento ou chegada, aprovação formal inicial, inspeção, achados, execução, transições e histórico.
- Orçamento complementar editável em rascunho, link aleatório com validade e resposta por item; somente dados pessoais mascarados no acesso público.
- Aplicação de peça somente após aprovação, baixa no apontamento e estorno com devolução ao estoque.
- Estoque mínimo por consumo e prazo de entrega, sobrescrita manual e sugestão de compra.
- Garantia mínima de90dias, exclusão de peças trazidas pelo cliente, chamados e O.S. de garantia sem cobrança dos itens cobertos.
- Indicadores, relatórios por período e mecânico, CSV, parâmetros configuráveis, auditoria, anonimização e backups diários.

A matriz completa e os limites de homologação estão em [docs/REQUISITOS.md](docs/REQUISITOS.md). Decisões e configurações iniciais: [docs/DECISOES.md](docs/DECISOES.md). Consultas SQL usadas no relatório: [docs/CONSULTAS-SQL.md](docs/CONSULTAS-SQL.md).

## E-mail local e SMTP

Por padrão, as mensagens são **capturadas localmente**. O gerente pode consultá-las em **Caixa de e-mails**, incluindo convites e recuperação de senha. Isso permite testar sem enviar e-mail a pessoas reais.

Para envio externo opcional, configure no processo da API:

```powershell
$env:SMTP_HOST = 'servidor-smtp'
$env:SMTP_PORT = '465'
$env:SMTP_FROM = 'oficina@seu-dominio'
$env:SMTP_USER = 'usuario'
$env:SMTP_PASSWORD = 'senha'
npm.cmd start
```

O envio utiliza TLS, fila e tentativas posteriores. Uma falha do serviço de e-mail não impede agendamento e outras operações. A entrega externa real depende de servidor e credenciais próprios; não foi realizada neste projeto local.

## Supabase dedicado do OScar

O projeto Supabase dedicado do OScar tem a referência pública `kotiorssahochknggjzc`. Em 28/10/2026, a configuração foi aplicada nesse projeto: o esquema `oscar_private` contém 21 tabelas com RLS, uma configuração inicial e o gerente **Roberto** (`roberto@oscar.local`), cujo login foi validado. O catálogo de serviços, os clientes e as solicitações começam vazios. As credenciais ficam somente em `data/oscar-supabase.local.json`, fora do futuro deploy. A base do antigo controle de peças não é usada. `npm.cmd start` continua abrindo o SQLite local em **https://localhost:4201**.

O preparo já foi concluído com este comando, executado em um terminal dentro desta pasta:

```powershell
npm.cmd run setup:oscar-supabase
```

O comando lê as credenciais locais do OScar, não aceita senhas por argumento, verifica o projeto antes de conectar e recusa um esquema `oscar_private` já existente. **Não o execute novamente no projeto já configurado.** As duas migrações e o gerente foram inseridos em uma única transação. Clientes, veículos, serviços, peças e demais dados de demonstração **não foram copiados**. Como o catálogo começa vazio, cadastre os serviços reais ao entrar como gerente.

O certificado raiz público do Supabase está em `server/supabase-root-2021.cer`. O instalador confere sua impressão digital e o usa para validar TLS e o hostname do pooler; a conexão real foi verificada com essa validação ativa.

Para abrir o OScar local conectado somente a esse projeto Supabase:

```powershell
npm.cmd run start:oscar-supabase
```

Esse modo lê a senha salva e abre **https://localhost:4202**, com a API em `https://127.0.0.1:4302/api`. O frontend não recebe `DATABASE_URL`; o processo local padrão não recebe a variável do banco remoto. O login e as permissões continuam sendo do OScar, sem Supabase Auth. `roberto@oscar.local` serve para entrar no aplicativo e não é um endereço de entrega externa.

Na verificação de 28/10/2026, o frontend respondeu em **https://localhost:4202** e a API respondeu **200** no endpoint de saúde, usando o Supabase dedicado. Os testes com PostgreSQL WASM/PGlite continuam sendo locais e não substituem testes de carga ou operação em produção. A Vercel continua para depois; veja [docs/SUPABASE.md](docs/SUPABASE.md) e [docs/VERCEL.md](docs/VERCEL.md). O versionamento no repositório Kaylu1 foi autorizado em 03/11/2026; nenhum deploy foi realizado.
## Testes e compilação

```powershell
npm.cmd test
npm.cmd run verify:local
npm.cmd run build
```

`npm test` usa o runner nativo do Node e cobre domínio, API, segurança, SQLite, PostgreSQL local, configuração serverless e SMTP. Os testes de frontend são fluxos reais no navegador. O comando inicia e encerra uma instância própria, com portas e banco isolados:

```powershell
npm.cmd run test:browser
```

Os scripts procuram o Chromium já instalado nesta máquina. Em outra máquina, instale o navegador com `npx.cmd playwright install chromium` e informe seu executável em `OSCAR_BROWSER` se necessário. Evidências ficam em `tests/results`. Os testes de API usam bancos temporários; o executor de navegador cria um banco SQLite novo em data/test-runs por execução, sem alterar a base principal. Consulte docs/VALIDACAO.md para os resultados.

As dependências transitivas foram corrigidas preservando Angular20. Na validação local, `npm audit` não apontou vulnerabilidades conhecidas.

## Dados e recuperação

Banco principal: `data/oscar.sqlite`. Cópias diárias: `data/backups`. O gerente pode solicitar uma cópia adicional na tela de parâmetros. A anonimização elimina os identificadores também das cópias locais; os testes verificam o banco restaurado.

Para restaurar, encerre a aplicação, preserve o arquivo atual e copie a cópia desejada para `data/oscar.sqlite`. Reabra com `npm.cmd start`.

Mantenha toda a pasta local. HTTPS local e testes automatizados não equivalem a homologação de disponibilidade prolongada, entrega de SMTP externo ou validação nas duas últimas versões de todos os navegadores.
