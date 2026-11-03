# Decisões do OScar

Base: **ERS OScar 1.4**. Este documento registra escolhas de implementação e diferenças entre o documento e a entrega local. A matriz completa está em [REQUISITOS.md](REQUISITOS.md). Atualização de escopo em 03/11/2026: GitHub autorizado apenas para versionar o OScar; Vercel e publicação da aplicação continuam para depois.

## D01 — Projeto independente, execução local e Git separado

O projeto está em `C:\Users\Kaylu\Desktop\p.i\oscar`, fora da pasta da aplicação anterior de controle de peças. O diretório `p.i` possui aviso `LOCAL_ONLY.md` e `.gitignore` com `*`. O repositório GitHub escolhido para o OScar é `Kaylu1/Pi_Unifio_2026`; as contas e os dados do sistema anterior não fazem parte desta entrega.

A **RE05 está em atendimento** quanto ao versionamento, autorizado pelo usuário em 03/11/2026. A aplicação ainda não foi publicada na Vercel nem homologada em nuvem.

## D02 — Angular 20 com módulos e Material 20

O ponto de partida solicitado é `ng new oscar --no-standalone --routing --ssr=false`, preservando as opções determinadas pelo usuário e alterando o nome. O scaffold utiliza Angular CLI 20, SCSS e não inicializa Git. Componentes da aplicação usam `standalone: false` e são declarados em `AppModule`; a navegação usa o módulo de rotas. Angular Material e CDK estão na versão principal 20.

Referências: [package.json](../package.json), [AppModule](../src/app/app-module.ts), [rotas](../src/app/app-routing-module.ts), [SCSS global](../src/styles.scss).

## D03 — API REST e banco relacional local

A interface comunica-se com uma API REST Node.js. O banco é SQLite local, com chaves estrangeiras, índices e transações para alterações combinadas de O.S., estoque e auditoria. Dados complementares de cada entidade ficam em JSON, sem eliminar as relações SQL entre clientes, veículos, usuários, agendamentos, ordens, orçamentos e peças.

A execução padrão atende ao formato REST/relacional da RE03 com SQLite. Por solicitação posterior, o adaptador PostgreSQL foi conectado ao projeto Supabase dedicado do OScar, por meio da API local, e a entrada de função Vercel foi preparada sem deploy. Ambos reutilizam a mesma API e regras.

Referência: [persistência](../server/store.mjs). O arquivo de dados não deve ser confundido com uma cópia de segurança.

## D04 — Valores e dados demonstrativos

Os valores de itens são expressos em reais na API (`price`, `quantity`, `total`). A camada transacional valida valores não negativos e calcula totais com duas casas monetárias; o navegador apresenta BRL. Quantidades de peças aceitam até três casas decimais e o saldo preserva 0,001 unidade em entrada, baixa e estorno, com regressão automatizada. A aplicação não processa pagamentos, contas financeiras ou documentos fiscais.

A base inicial usa pessoas, veículos, fornecedores e ordens demonstrativos. A senha de demonstração é apenas para a instalação local; não constitui configuração adequada para disponibilização externa.

## D05 — Contas e privacidade

Senhas são derivadas com scrypt e salt aleatório, sem persistência em texto puro no cadastro. O acesso interno distingue gerente, atendente, mecânico, consultor e cliente; o cliente deve ser limitado aos próprios registros. A sessão é invalidada após 30 minutos de inatividade.

A minimização de dados no orçamento público é implementada por uma lista explícita de campos. O retorno contém somente `clientFirstName`, `plateMasked`, `chassisMasked` e os itens necessários ao orçamento. Não se espalha o objeto do cliente nem o veículo integral para uma resposta pública.

Implementar essas medidas não equivale a certificar conformidade jurídica integral com a LGPD. A anonimização é restrita ao gerente e revoga sessões, recuperação e links, remove identificadores e campos livres relacionados e expurga o mesmo titular dos snapshots diários locais. A cópia preserva outros clientes e o histórico técnico. Foram testados restauração e ausência física dos bytes identificadores do exemplo após checkpoint/VACUUM. Se uma cópia estiver bloqueada, a API informa que a base ativa já foi anonimizada e orienta repetir para concluir o expurgo. Cópias exportadas para outro lugar não são descobertas automaticamente; eventuais obrigações de retenção ainda dependem da política da oficina.

Referências: [domínio](../server/domain.mjs), [persistência](../server/store.mjs), [testes de RN10](../server/domain.test.mjs).

## D06 — E-mail sem dependência externa obrigatória

O modo local mantém uma caixa de saída para confirmação, credenciais e recuperação de acesso. Isso permite inspecionar mensagens e continuar usando a aplicação sem um provedor externo.

**Registrar uma mensagem local não significa entregar um e-mail.** RF04, RF12 e IE01 exigem configuração e verificação de transporte real para comprovar entrega externa. O modo local não envia mensagens a terceiros automaticamente.

A indisponibilidade desse transporte deve ser registrada sem impedir agenda, O.S. e estoque, conforme RNF17. A caixa de saída contém dados sensíveis de acesso e deve ser restrita à administração.

## D07 — Orçamento individual e temporário

A validade inicial é 48 horas, parametrizável. O consultor copia e encaminha o link por canal externo. Não existe integração com WhatsApp ou mensageria.

Ao responder, o cliente toma uma decisão por item; concluir a resposta invalida o link. Expiração exige nova emissão. No retorno público, a placa preserva apenas os últimos três caracteres e o chassi apenas os últimos seis. A recusa complementar não cancela a O.S.

Referências de regras: [RN06/RN10 e transições](../server/domain.mjs). A autenticação do cliente continua necessária para histórico e chamados, mas não para responder pelo link individual.

## D08 — Consumo, reposição e arredondamento

A janela inicial é de 30 dias. O cálculo considera **saídas menos estornos**, ignora entradas e movimentações posteriores à data de referência e não produz consumo negativo. A janela inclui os limites inicial e final; o mínimo calculado é arredondado para cima.

O cálculo só é habilitado quando há ao menos 30 dias de histórico e toda a janela configurada está coberta. Se a janela for ampliada para 60 dias, são necessários 60 dias. Uma janela menor não dispensa os 30 dias da SD06.

O prazo do fornecedor prevalece sobre o prazo padrão. Um mínimo manual, inclusive zero, prevalece sobre o calculado. Sem histórico suficiente, apenas o mínimo manual é utilizado. A sugestão é `max(0, mínimo - saldo)`; chegar exatamente ao mínimo mantém o alerta, ainda que a sugestão seja zero.

`historyStartedAt` ou a criação da peça indica quando o histórico passou a ser acompanhado. Importar um saldo sem histórico real não autoriza inventar movimentos retroativos.

Referências: [stockPolicy](../server/domain.mjs), [testes RN13](../server/domain.test.mjs).

## D09 — Garantia

A garantia começa no encerramento da O.S., nunca na abertura, e dura pelo menos 90 dias. A parametrização pode ampliar o prazo. O prazo concedido é persistido na O.S.; uma mudança posterior do padrão não o reduz. O instante final é inclusivo; depois dele o atendimento é tratado como reclamação sem reparo gratuito automático.

Peças fornecidas pelo cliente são excluídas da cobertura; a mão de obra executada continua coberta. A O.S. de garantia referencia a origem e o chamado deferido, com valores zerados somente para itens cobertos.

Referências: [warrantyPolicy](../server/domain.mjs), [testes de limites de garantia](../server/domain.test.mjs).

## D10 — Ciclo da O.S.

Fluxo principal:

`aberta → inspecao → aguardando_aprovacao → execucao → concluida → encerrada`

`cancelada` é permitido apenas a partir de `aberta` ou `inspecao`. Durante execução, uma necessidade complementar pode retornar a O.S. a `aguardando_aprovacao`, retomando a execução após resposta. Recusa não implica cancelamento.

No primeiro atendimento, um item precisa de aprovação formal ou recusa: a inclusão como pendente é rejeitada para não deixar uma decisão sem fluxo de resolução. Achados do mecânico continuam pendentes até o orçamento complementar.

Concluir e encerrar validam que todos os itens aprovados possuem apontamento de execução. O histórico de transições guarda ator, data e hora.

Referências: [assertTransition / assertCanClose](../server/domain.mjs), [testes RN11 e ciclo](../server/domain.test.mjs).

## D11 — PD01: checklist inicial substituível

A ERS deixa em aberto a definição dos itens de inspeção de cada serviço. A implementação inicial associa `inspectionItems` ao cadastro do serviço; o gerente pode editar essa lista.

Exemplos demonstrativos: troca de óleo verifica nível/estado do óleo, filtro e vazamentos; freios verifica pastilhas, discos e fluido. Essas listas são **uma decisão inicial de implementação**, não uma aprovação da oficina nem uma lista universal. Deve ser possível substituí-las sem alterar código.

Referências: [serviços demonstrativos](../server/store.mjs), [formulário de serviços](../src/app/features/feature-pages.ts).

## D12 — PD02: manifestação de aprovação

A ERS deixa as formas de manifestação pendentes. A proposta inicial é `presencial`, `telefone` e `mensagem`, além do registro pelo próprio link para orçamento complementar. As opções configuradas devem ser validadas tanto no formulário quanto no servidor.

Uma comunicação externa só produz efeito após o registro do usuário responsável, com data e hora. As opções são uma decisão inicial substituível pela oficina; não representam a autorização para integrar serviços de mensageria.

## D13 — Verificação não funcional

Os testes automatizados de domínio comprovam cenários das RN06, RN10, RN11 e RN13 e casos de agenda, transições e garantia. O resultado do domínio é **43 testes aprovados** com `node --test server/domain.test.mjs`. O conjunto completo `node --test server/*.test.mjs tests/api*.mjs` aprovou **66 testes**, incluindo HTTP, persistência, backup/restauração e isolamento de falha de SMTP.

A presença de código de sessão, backup, HTTPS e interface responsiva não comprova, sozinha, todos os requisitos operacionais. O teste local de 30 usuários/sessões distintos executou 30 consultas simultâneas em 152 ms na base fictícia; login/preparação ficam fora da janela medida. Backup/restauração e expurgo do titular também foram testados. Ainda exigem comprovação específica: 95% de disponibilidade, entrega externa de e-mail e compatibilidade com as duas últimas versões de Chrome, Firefox, Edge e Safari. A medição local não certifica capacidade de produção.

O modo local depende do computador e do processo em execução. Uma rotina de backup incorporada ao servidor não substitui um agendador quando o computador está desligado. A inicialização padrão usa HTTPS tanto no navegador→frontend quanto no proxy→API (https://127.0.0.1:4301), com os certificados em data/tls. O certificado de desenvolvimento não equivale a um certificado de produção.

## D14 — Limites de escopo

Ficam fora os itens explicitamente excluídos do MVP: WhatsApp, transporte cortesia, pedidos de compra, autocadastro e autoagendamento do cliente, financeiro, pagamentos, notas fiscais, RH, aplicativo nativo, marketplace, integração contábil e pesquisa automática de satisfação.

O escopo de serviços externos autorizado limita-se ao Supabase dedicado do OScar e ao versionamento em `Kaylu1/Pi_Unifio_2026`. A publicação da aplicação e o uso de dados da aplicação anterior continuam fora desta etapa.

## D15 — Verificação do frontend e dependências

`npm test` executa 66 testes nativos Node.js de domínio/API/persistência nessa rodada. Os runners Karma/Jasmine do scaffold foram retirados; a interface e guards são exercitados no navegador com Playwright/Chromium. O ensaio de funcionalidades concluiu nove etapas, incluindo 375 px sem overflow/pageerrors. Os resultados históricos ficam nos artefatos locais de teste, excluídos do repositório.

O fluxo central completo de O.S. foi aprovado nessa rodada: criação/inspeção/achado pela interface, publicação e resposta anônima do orçamento, invalidação do token, execução, bloqueio de encerramento incompleto, fechamento e persistência após recarregar. O resultado registra 320/1280/1920 px sem overflow e zero pageerrors. Não comprova todas as rotas/formulários ou outros navegadores.

Angular e Angular Material permanecem na versão principal 20. Overrides locais de `@modelcontextprotocol/sdk` e `vite` incorporam correções; a auditoria de dependências da instalação final reportou zero vulnerabilidades. O resultado é temporal e deve ser refeito após futuras mudanças.
## D16 — Execução isolada dos testes de navegador

O comando `npm run test:browser` usa `scripts/browser-tests.mjs`, cria uma instância temporária do OScar em HTTPS 4212/API 4312 por padrão e um SQLite fictício em `data/test-runs/browser-*`. Executa três suítes: fluxo central, cadastros/agenda/estoque e acessos/perfis. O próprio runner registra resumo, logs e encerramento dos processos que iniciou.

A base da instância principal não participa desse runner. A aprovação conjunta exige `summary.json` com `passed: true`; aprovações individuais prévias não substituem essa evidência conjunta.
## D17 — Supabase/PostgreSQL e Vercel sem publicação

A solicitação posterior autorizou configurar o banco Supabase/PostgreSQL dedicado para uso da API local e preparar os arquivos Vercel, sem executar o deploy. Em 03/11/2026, o usuário autorizou separadamente o versionamento Git no repositório `Kaylu1/Pi_Unifio_2026`. As sessões e os perfis continuam próprios do OScar.

`server/postgres-store.mjs` usa pool de transações, consultas parametrizadas sem prepared statements nomeados e TLS com verificação. O esquema privado `oscar_private` tem relações, índices e RLS; não deve ser incluído nos esquemas expostos pela Data API do Supabase. As funções da aplicação usam conexão do servidor, não chaves de frontend. Mutações usam transações com bloqueio de coordenação entre instâncias; a capacidade e latência reais ainda precisam ser medidas no ambiente publicado.

`api/index.mjs` é a única entrada pública de função. Os módulos de negócio foram movidos para `server/` para evitar que cada utilitário se torne um endpoint. O processo serverless não abre listener nem agenda intervalos. A manutenção usa `/api/_maintenance` com segredo e Cron configurado; falta homologar a execução no provedor. O SMTP real continua opcional e precisa de teste de entrega.

Não existe fallback SQLite nem seed demonstrativo na entrada de nuvem. O primeiro gerente é criado pelo SQL gerado localmente com hash scrypt; o SQL não contém a senha em texto puro e permanece excluído de pacotes. `npm start` permanece local e força SQLite para não aproveitar acidentalmente variáveis de banco remoto.

Os snapshots de aplicação no PostgreSQL ficam no esquema privado e são expurgados por titular; tombstones impedem a reintrodução de dados pessoais numa restauração desses snapshots. Isso não elimina os backups físicos e históricos mantidos pelo provedor. Retenção, recuperação de desastre e expurgo das cópias do provedor precisam de política própria; snapshots no mesmo banco não substituem uma cópia externa independente.

Roteiros: [Supabase](SUPABASE.md), [Vercel](VERCEL.md), [variáveis de exemplo](../.env.example). O SQL foi validado num PostgreSQL WASM local e a conexão com o Supabase dedicado foi confirmada em 28/10/2026. Essa validação não comprova roteamento, disponibilidade ou publicação da aplicação na nuvem.
## D18 — Nova identidade e mídia inteiramente locais

Por escolha explícita do usuário, a identidade anterior foi substituída por **grafite, branco e laranja**. Manrope nos títulos e DM Sans nos controles/corpo continuam locais. Navegação, painel, cadastros, estoque, O.S., recuperação, catálogo e aprovação pública compartilham tokens e materiais; cada módulo tem composição apropriada à tarefa. O sistema visual está documentado em [DESIGN.md](../DESIGN.md).

ThemeService aplica a preferência do sistema quando não há escolha explícita, persiste oscar.theme, acompanha mudanças entre abas e atualiza a cor do navegador. O script local public/theme-init.js aplica a preferência antes da inicialização Angular. Campos, tabelas, estados, menus e diálogos Material seguem os pares semânticos dos dois temas.

O acesso usa filmagem **real** de reparo de motor, Mixkit item 4716, preparada como MP4 H.264 de 11 segundos sem áudio e poster WebP. A mídia é servida localmente; não há hotlink ou serviço externo durante o uso. A filmagem é genérica e não representa a equipe ou a oficina OScar. O material procedural anterior foi retirado da área pública e arquivado localmente. Origem, licença e reprodução: [VIDEO-LOCAL.md](VIDEO-LOCAL.md).

O vídeo inicia mudo e em loop quando permitido, com pausa/reprodução, pausa em aba oculta, aviso de bloqueio, nova tentativa e poster em falha. Movimento reduzido e saveData evitam o download automático, preservando a reprodução manual. O formulário permanece sólido e disponível.

A interface amplia o movimento com entrada finita no acesso, revelação escalonada de elementos novos, barras de progresso e feedback de hover/pressão. MotionService mantém conteúdo visível sem animação e cancela efeitos com movimento reduzido. As quatro suítes isoladas de navegador cobrem a regressão; as evidências e os limites desta rodada estão em [VALIDACAO.md](VALIDACAO.md). O versionamento Git foi autorizado posteriormente; mudanças visuais não autorizam deploy nem alteração de outros serviços remotos.

## D19 — Avaliação e interfaces por tarefa (21/10/2026)

A finalidade do serviço é avaliacao ou execucao; o usuário definiu cobrança pelo valor cadastrado. A O.S. registra startMode, relato opcional, serviços de avaliação e finalidade/preço dos itens como histórico. A migração SQLite classifica somente o diagnóstico demonstrativo original reconhecido por ID e conteúdo, sem redefinir valores ou registros personalizados. Necessidades complementares continuam dependendo de orçamento e aprovação antes da execução e do consumo de estoque.

A composição segue a tarefa: contatos e contexto para clientes, frota para veículos, configuração para serviços, logística para fornecedores, pessoas para equipe, quadro para pós-venda e tabela para estoque. A agenda usa colunas de mecânicos e horários8–18; a API confirma a disponibilidade. O catálogo usa fotografia e lista expansível, com contato direto com a equipe para agendar. A identidade grafite/branco/laranja é mantida. Seis rotas compartilham um componente configurável e o estoque conserva seu envelope, reduzindo duplicação sem alterar permissões.

Uma corrida observada no navegador permitia abrir orçamento antes de atualizar as necessidades. A O.S. agora mantém as ações bloqueadas durante a atualização; a regressão simula180ms de atraso e confirma o item pendente sem baixar estoque. O reinício local preservou contagens das dez tabelas de negócio e hashes das nove que não receberam a migração de finalidade.
