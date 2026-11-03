# Matriz de rastreabilidade — OScar

Base de validação: **ERS OScar 1.4**, arquivo fornecido pelo usuário. A última versão contém **53 requisitos funcionais**, apesar da referência histórica a 52 no controle da versão 1.3.

Revisão técnica registrada em **21/10/2026**. Implementação no código e testes locais não são sinônimos de homologação de produção.

O OScar continua sendo executado e testado localmente, com modo SQLite ou conexão local ao Supabase dedicado. Em 03/11/2026, o usuário autorizou versioná-lo no repositório `Kaylu1/Pi_Unifio_2026`. A RE05 está em atendimento quanto ao Git; a publicação da aplicação na nuvem continua adiada.

## Como interpretar a situação

- **Implementado no código**: há um caminho de implementação identificado. Isso não significa homologação completa do requisito.
- **Testado em unidade**: os cenários explicitamente indicados foram executados no teste de domínio.
- **Em verificação**: o fluxo ainda precisa ser conferido na API e na interface completas.
- **Parcial / dependência externa**: existe suporte local, mas falta uma condição para satisfazer o requisito integralmente.
- **Não validado operacionalmente**: exige ambiente, carga, continuidade ou navegador que não foram demonstrados.
- **Adiado pelo usuário**: há uma instrução expressa que altera a entrega planejada.

As referências a arquivos correspondem aos arquivos locais. Os endpoints da matriz usam o prefixo `/api` na aplicação. Uma tabela de requisitos não substitui o resultado de execução dos testes.

## Requisitos funcionais — RF01 a RF53

| ID | Comportamento exigido | Evidência e ponto de verificação | Situação |
|---|---|---|---|
| RF01 | Atendente cadastra nome, CPF, telefone e e-mail do cliente e gera credenciais. | POST /clients cria cliente + usuário vinculado + convite por token; EntityDialog (clientes). server/operations-routes.mjs e server/common.mjs. | Implementado; convite/link/hash verificados em testes de fluxo. |
| RF02 | Cadastrar veículos do cliente com placa, chassi, marca, modelo, ano e quilometragem. | POST/PUT /vehicles valida vínculo, placa/chassi, marca/modelo/ano/km; cadastro em features/feature-pages.ts. | Implementado; rejeição de veículo alheio/placa duplicada testada na integração REST. |
| RF03 | Autenticar clientes e usuários internos por credenciais. | POST /login, GET /session e POST /logout; LoginPage e AuthGuard; server/server.mjs. | Testado por HTTP: credenciais, sessão, escopo e logout. |
| RF04 | Recuperar acesso por e-mail. | POST /auth/forgot e /auth/reset; resetLink gera /redefinir/:token; RecoverPage/ResetPage. | Parcial: link e segurança testados; entrega externa exige SMTP configurado e verificado. |
| RF05 | Gerente cadastra, edita e inativa usuários internos e define perfil. | POST/PUT/DELETE /users, restrito a gerente; preserva último gerente e invalida sessão quando inativo; UsersPage. | Implementado; cobertura de cada operação na interface ainda exige homologação. |
| RF06 | Restringir funcionalidades por perfil. | allow/ownOrder/visible no servidor; guards e navegação por perfil; server/common.mjs e core/auth.guard.ts. | Testado por HTTP: cliente não grava serviços, não vê O.S. alheia nem caixa de e-mails/auditoria. |
| RF07 | Catálogo público somente de serviços ativos, com valores e duração. | GET /public/services projeta serviços ativos com preço e duração; PublicCataloguePage. | Implementado; rota pública minimiza campos e interface tem busca/paginação. |
| RF08 | Gerente cadastra e edita descrição, valor e duração dos serviços. | POST/PUT /services restrito a gerente; Validators no EntityDialog e entityRecord no servidor. | Implementado; edição/cadastro disponíveis na interface. |
| RF09 | Gerente ativa e inativa serviços. | PUT/DELETE /services/:id controla active; EntityPage.toggle e catálogo filtra active. | Implementado; autorização e inativação validadas no servidor. |
| RF10 | Atendente agenda cliente, veículo, serviços, data e horário. | POST /appointments; AppointmentDialog seleciona cliente, veículo, serviços, horário disponível e mecânico. | Testado na integração REST com duração composta e confirmação local. |
| RF11 | Exibir somente horários com mecânico disponível. | GET /availability avalia duração/expediente/conflitos por mecânico; AppointmentDialog mostra slots retornados. | Testado em unidade e REST: horários ocupados somem; remarcação exclui o próprio registro. |
| RF12 | Enviar confirmação de agendamento por e-mail. | Agendar/remarcar/cancelar cria mensagem em emails; email-worker.mjs oferece SMTP opcional. | Parcial: mensagem local comprovada; entrega externa não foi comprovada. |
| RF13 | Cancelar/remarcar agendamento com motivo registrado. | PUT /appointments/:id exige reason e estado agendado; ações Remarcar/Cancelar na agenda. | Testado na integração REST: motivo obrigatório e cancelamento registrado. |
| RF14 | Exibir agenda consolidada por mecânico, data e horário. | AppointmentsPage ordena/lista agenda com filtros de data, mecânico e status. | Implementado; listagem tem pesquisa e paginação. |
| RF15 | Abrir O.S. com ou sem agendamento prévio. | POST /orders aceita appointmentId opcional, valida origem e marca agenda atendida; CreateOrderDialog. | Implementado; fluxo sem agendamento testado em integração REST. |
| RF16 | Atendente inclui serviços adicionais no primeiro atendimento. | POST /orders/:id/items somente aberta e por gerente/atendente; decisão inicial pendente é rejeitada. | Testado por HTTP: aprovação/recusa formal inicial e proteção contra item sem fluxo de decisão. |
| RF17 | Registrar aprovação inicial por serviço, com data, hora e forma. | itemData registra approvedAt, approvalMethod, approvalBy e observação da manifestação; CreateOrderDialog/OrderItemDialog. | Implementado; execução exige registro formal e RN06 é testada. |
| RF18 | Atribuir O.S. a mecânico específico. | CreateOrderDialog seleciona mecânico; POST /orders e /orders/:id/assign validam usuário ativo de perfil mecânico. | Implementado; vínculo persistido em chave estrangeira. |
| RF19 | Gerar folha de verificação pelos serviços contratados. | attachInspections gera folha por services.inspectionItems ao incluir serviço; OrderDetailPage exibe folha. | Implementado; listas iniciais editáveis pelo gerente, sujeitas à aprovação da oficina (PD01). |
| RF20 | Mecânico registra resultado de cada item da inspeção. | POST /orders/:id/inspection registra resultado, notas, inspectedAt e inspectedBy; folha na tela da O.S. | Implementado; apontamento de inspeção testado na integração REST. |
| RF21 | Apontar execução de cada serviço aprovado com data, hora e responsável. | POST /orders/:id/execute exige execução ativa, decisão aprovada, data/método formais e grava executedAt/executedBy. | Testado em unidade e REST; bloqueia item recusado e apontamento duplicado. |
| RF22 | Registrar mudanças de status com data, hora e usuário. | changeStatus valida ciclo e acrescenta timeline com status/date/userId/userName; tela mostra histórico. | Testado no ciclo completo REST e nas transições de domínio. |
| RF23 | Cliente acompanha status atual de sua O.S. | GET /orders/:id e bootstrap restringem cliente por clientId; OrderDetailPage apresenta etapa atual. | Testado por HTTP: O.S. própria acessível e O.S. alheia retorna 404. |
| RF24 | Encerrar O.S. consolidando execução/peças e bloqueando RN11. | Transições concluida/encerrada chamam assertCanClose; fechamento persiste closedAt e prazo da garantia. | Testado em unidade e REST: bloqueio antes da execução e fechamento após apontamentos. |
| RF25 | Histórico por veículo acessível ao proprietário e equipe. | GET /orders/visibilidade por proprietário; VehiclesPage abre histórico por vehicleId. | Implementado; escopo de propriedade testado por HTTP. |
| RF26 | Mecânico aponta serviço, peça e justificativa técnica adicionais. | POST /orders/:id/findings restrito ao mecânico atribuído/gerente, com justificativa obrigatória. | Testado na integração REST; OrderItemDialog permite registrar necessidade durante inspeção/execução. |
| RF27 | Consultor compõe/ajusta orçamento complementar antes de publicá-lo. | POST /orders/:id/budgets e PUT /budgets/:id ajustam somente rascunho; BudgetEditorDialog inclui/remove/edita itens. | Testado em REST: composição a partir de achados, edição de rascunho preserva vínculo e não deixa pendência órfã. |
| RF28 | Gerar link individual para encaminhamento manual do consultor. | POST /budgets/:id/publish gera token aleatório, guarda hash e devolve link para copiar; sem envio por mensageria. | Testado em fluxo/REST: link individual e reemissão invalida o anterior. |
| RF29 | Orçamento público mostra primeiro nome e veículo parcialmente identificado. | publicBudgetView usa maskBudget; PublicBudgetPage exibe nome/identificadores mascarados. | Testado em unidade e HTTP: nome completo, CPF, telefone, e-mail, placa/chassi integrais ausentes. |
| RF30 | Cliente aprova ou recusa cada item pelo link. | POST /public/budgets/:token exige uma decisão aprovada/recusada para cada item; formulário público. | Testado em fluxo/REST: aprovação e recusa individuais, rejeição de item estranho e uso único. |
| RF31 | Consultor registra decisão comunicada por canal externo. | POST /budgets/:id/decisions permite consultor/gerente registrar origem configurada e observação; BudgetDecisionDialog. | Testado em fluxo com forma de manifestação substituída por configuração. |
| RF32 | Guardar decisão individual com data, hora e origem. | decideBudget grava decisão individual, approvedAt, approvalMethod, approvalBy, origem e auditoria. | Testado em fluxo e no retorno à execução; decisão duplicada não é reaplicada. |
| RF33 | Impedir execução/peça de item não aprovado. | assertApproval + verificação formal no POST /orders/:id/execute; baixa ocorre somente após validação. | Testado em unidade e integração REST: item recusado não executa/aplica. |
| RF34 | Expirar orçamento não respondido e invalidar link. | budgetByToken valida expiração em consulta/resposta; manutenção da API marca expirados; reemissão gera token diferente. | Testado em fluxo: expirado retorna 410, reemissão inutiliza link anterior. |
| RF35 | Cadastrar código, descrição, unidade, custo e venda das peças. | POST/PUT /parts e PartsPage registram código, descrição, unidade, custo/venda; código único. | Implementado; custo/preço e quantidades validados no cliente e servidor. |
| RF36 | Cadastrar fornecedor com razão social, CNPJ, contato e prazo, associando peças. | POST/PUT /suppliers com CNPJ válido e leadDays; associação parts.supplierId. | Implementado; formulário e servidor validam dados do fornecedor. |
| RF37 | Entrada de peças com quantidade, fornecedor e data. | POST /stock/entries, gerente, peça/fornecedor ativos, quantidade positiva e data não futura; formulário Entrada. | Implementado; atualização de saldo e movimento na mesma transação do dispatcher. |
| RF38 | Aplicação de peça na O.S. baixa estoque no apontamento. | POST /orders/:id/execute baixa saldo e grava saida vinculada a O.S./item na mesma transação. | Testado em integração REST: aprovação não baixa; apontamento baixa; duplicação/estoque insuficiente bloqueados. |
| RF39 | Estorno devolve a quantidade ao estoque. | POST /orders/:id/reverse exige peça executada e motivo; gera estorno e devolve saldo; tela oferece Estornar. | Testado em integração REST: devolução e reaplicação, sem gerar saldo duplicado. |
| RF40 | Calcular estoque mínimo pela RN13. | partPolicy aplica stockPolicy com histórico líquido, janela, fornecedor e parâmetros; PartsPage apresenta mínimo. | Testado em unidade — RN13, incluindo limites da janela e histórico insuficiente. |
| RF41 | Gerente sobrescreve estoque mínimo calculado. | manualMinimum nulo usa cálculo; valor numérico inclusive zero prevalece; campo de edição de peça. | Testado em unidade; validação de entrada no formulário e servidor. |
| RF42 | Alertar saldo igual/inferior ao mínimo e sugerir compra. | partPolicy retorna minimum/suggested/lowStock; dashboard e filtro de estoque baixo usam saldo <= mínimo. | Cálculo testado em unidade; a sugestão nunca é negativa. |
| RF43 | Consultar histórico de movimentos de cada peça. | GET /movements filtrável por partId; PartsPage/HistoryDialog apresentam movimento com pesquisa/paginação. | Implementado; saídas/estornos registrados no fluxo REST testado. |
| RF44 | Iniciar garantia ao encerrar a O.S. | changeStatus em encerrada grava closedAt e warrantyDays; warrantyPolicy respeita prazo concedido na origem. | Testado em unidade e REST, incluindo preservação do prazo após mudança de parâmetro. |
| RF45 | Cliente abre chamado de pós-venda vinculado à O.S. anterior. | POST /tickets exige O.S. encerrada do próprio cliente; TicketsPage abre chamado vinculado. | Testado na integração REST com cliente autenticado. |
| RF46 | Verificar vigência e itens cobertos ao abrir chamado. | POST /tickets calcula vigência e cobertura item a item; coveredItems inclui indicação e motivo. | Testado em unidade e REST: serviço executado, peça da oficina e exclusão de peça do cliente. |
| RF47 | Abrir O.S. Garantia de chamado deferido, referenciando origem. | POST /tickets/:id/warranty-order exige deferimento/cobertura e referência à O.S. de origem; impede duplicação. | Testado na integração REST: origem vinculada e itens cobertos com preço/total zero. |
| RF48 | Cliente acompanha andamento do chamado. | GET /tickets e bootstrap escopados por clientId; TicketsPage apresenta situação e parecer. | Implementado; restrição de acesso é aplicada no servidor. |
| RF49 | Painel mostra O.S. por status, permanência média, estoque baixo e aprovação complementar. | GET /dashboard e DashboardPage calculam O.S. por etapa, permanência média, saldo baixo e aprovação complementar. | Implementado; dados do cliente e do mecânico são limitados pelo escopo de acesso. |
| RF50 | Gerente relata serviços executados por período e mecânico. | GET /reports?from&to&mechanicId usa JOIN entre orders, clients e vehicles para apresentar cliente e placa; filtra itens executados no período; ReportsPage e CSV. Detalhes em docs/CONSULTAS-SQL.md. | Testado na integração REST; autorização limitada ao gerente. |
| RF51 | Gerente relata consumo de peças por período. | GET /reports usa JOIN entre movements, parts e orders, SUM/GROUP BY para apurar saídas menos estornos por período e mecânico; ReportsPage exibe consumo/custo. Detalhes em docs/CONSULTAS-SQL.md. | Testado na integração REST: consumo líquido após estorno/reaplicação. |
| RF52 | Pesquisa por termo em clientes, veículos, O.S., agenda e peças. | EntityPage.filtered e OrdersPage.rows pesquisam dados e relações; GET de listagens oferece q. | Implementado para clientes, veículos, O.S., agenda e peças. |
| RF53 | Filtros e paginação em todas as listagens de registros. | Listagens genéricas usam filtros/paginação; OrdersPage, catálogo, históricos e relatórios têm paginação. | Implementado no código; homologação de todas as combinações/filtros permanece tarefa de aceite. |

## Requisitos não funcionais — RNF01 a RNF19

| ID | Requisito | Evidência / validação necessária | Situação |
|---|---|---|---|
| RNF01 | Consultas em até 3 s sob condições normais. | tests/api.integration.mjs executou 30 GET /bootstrap simultâneos com 30 usuários/sessões distintos na base fictícia local; lote completo em 152 ms na execução registrada. | Validado nesse cenário local; volume real/ambiente diferente exige novo ensaio. |
| RNF02 | Ao menos 30 usuários simultâneos mantendo RNF01. | Mesmo teste usa 30 usuários e sessões independentes; preparação das credenciais ocorre fora da janela cronometrada. | Teste local aprovado; não equivale a carga prolongada, 30 navegadores ou homologação de capacidade de produção. |
| RNF03 | Interface responsiva de 320 a 1920 px. | SCSS responsivo; features.smoke.mjs aprovado em 375 px sem overflow e sem pageerrors; painel inspecionado em 320/1280/1920 px no fluxo de navegador. | Fluxo central aprovado no navegador em 320/1280/1920 px sem overflow/pageerrors; cenário de estoque em 375 px aprovado. Todas as rotas/telas e larguras intermediárias ainda não foram homologadas individualmente. |
| RNF04 | Agendamento em no máximo 5 etapas. | AppointmentDialog concentra cliente, veículo, serviços, data/slot e confirmação em um diálogo. | Fluxo do diálogo testado no navegador (cadastro/remarcação/cancelamento); aceite amplo de usabilidade depende de uso real. |
| RNF05 | Inspeção/execução operáveis por toque, sem teclado físico. | OrderDetailPage usa seletores/botões para resultado e apontamento; notas textuais são complementares. | Implementado; validação em dispositivo físico/touch ainda não documentada. |
| RNF06 | Resposta de orçamento sem autenticação prévia. | GET/POST /public/budgets/:token são anteriores à exigência de sessão no servidor; PublicBudgetPage. | Testado por HTTP sem cookie: consultar/responder e invalidar link. |
| RNF07 | Erros devem indicar ação corretiva. | DomainError e validadores Angular/servidor; mensagens para aprovação, saldo, conflito, sessão e formulários. | Cenários de regra testados; revisão de todas as mensagens/combinações de interface não é certificada. |
| RNF08 | Senhas protegidas, sem armazenamento em texto puro. | store.hashPassword usa scrypt e salt aleatório; usuários não retornam passwordHash; convites contêm token para definir senha. | Implementado; HTTP testa ausência de hash no bootstrap e proteção de links. |
| RNF09 | Canal criptografado entre cliente e servidor. | scripts/dev.mjs usa certificado local data/tls e HTTPS no frontend e na API; proxy /api aponta para https://127.0.0.1:4301. | Ambos os saltos locais usam TLS na inicialização padrão. Certificado próprio de desenvolvimento; não há publicação/certificado público. |
| RNF10 | Link único, difícil de deduzir e restrito ao orçamento. | Token randomBytes(32) em base64url, hash no banco; budgetByToken pesquisa vínculo e validade. | Testado em fluxo/HTTP: token alterado rejeitado, reemissão/resposta invalidam anterior. |
| RNF11 | Páginas públicas expõem somente dados necessários. | maskBudget/publicBudgetView com allowlist; catálogo público projeta só campos de serviços. | Testado em unidade/HTTP contra nome completo, CPF, telefone, e-mail e identificadores integrais. |
| RNF12 | Encerrar sessão após 30 min inativa. | Servidor verifica lastSeen; cookie ativo é renovado; logout elimina sessão e expira cookie. | Testado por HTTP: inatividade, renovação com atividade, logout e bloqueio imediato. |
| RNF13 | Log de criação/alteração/exclusão com usuário/data/hora. | store.audit é chamado pelos cadastros, agenda, O.S., orçamentos, chamados, configurações e anonimização. | Implementado; auditoria interna por perfil. Cobertura exaustiva de toda operação não é uma certificação independente. |
| RNF14 | Excluir dados pessoais mediante solicitação. | Gerente confirma anonimização; server/privacy.mjs limpa cópias relacionadas, revoga acessos/links e expurga snapshots diários do mesmo cliente; secure_delete/checkpoint/VACUUM. | Testado em HTTP e persistência: base ativa + backup restaurado, bytes identificadores ausentes e outros clientes/histórico preservados. Não certifica conformidade jurídica integral. |
| RNF15 | Disponibilidade de 95% no horário comercial. | Depende do computador, processos, monitoramento e período de medição; não foi implantado ambiente de operação contínua. | Não validado; modo local não oferece garantia de disponibilidade. |
| RNF16 | Backup diário dos dados. | store.backup cria snapshot por data; manutenção da API chama a rotina periodicamente; tests/api.persistence.mjs reabre base e restaura cópia. | Criação/restauração testadas; rotina só executa com API/computador ativos. Não há agendador externo. |
| RNF17 | Falha de e-mail não impede outras funcionalidades. | email-worker.mjs isola transporte em fila com nova tentativa; teste injeta transporte que falha e verifica continuidade. | Testado com falha simulada; não foi enviado e-mail externo. |
| RNF18 | Duas últimas versões de Chrome, Firefox, Edge e Safari. | Uma execução Chromium não comprova todos os navegadores/versões; exige matriz específica. | Não validado integralmente, incluindo Safari e Firefox. |
| RNF19 | Garantia, janela, prazo padrão e validade configuráveis sem código. | PUT /settings validado no servidor; SettingsPage; parâmetros usados nas políticas. approvalMethods e listas de inspeção também editáveis. | Implementado; garantia não pode cair abaixo de 90; prazo já concedido fica preservado. |

## Regras de negócio — RN01 a RN18

| ID | Regra | Evidência / cenário | Situação |
|---|---|---|---|
| RN01 | Somente usuário interno registra agendamento. | Conferir autorização da API além do menu: POST /appointments e GET /availability exigem gerente/atendente. | Implementado no servidor; permissões de cliente testadas em REST. |
| RN02 | Agenda exige cliente e veículo vinculados. | appointmentData exige cliente/veículo ativos e vehicle.clientId === client.id, com relações SQL. | Testado na integração REST: veículo de outro cliente é rejeitado. |
| RN03 | Placa não pode pertencer a dois clientes ativos. | entityRecord normaliza placa e rejeita duplicação entre veículos ativos. | Testado na integração REST: placa duplicada retorna conflito. |
| RN04 | Mecânico não pode ter atendimentos sobrepostos. | assertNoOverlap cobre interseção, contenção, adjacência, cancelamento e remarcação. | Testado em unidade e REST de disponibilidade/agenda. |
| RN05 | Somente serviço ativo é público e agendável. | Catálogo público filtra active; servicesFrom rejeita serviço inativo para agendar. | Implementado na API e nos seletores de interface. |
| RN06 | Serviço/peça depende de aprovação prévia formal. | assertApproval e execute exigem decision aprovado, approvedAt e approvalMethod antes do apontamento. | Testado em unidade/REST: pendente/recusado e duplicação não aplicam peça. |
| RN07 | Recusa complementar não cancela O.S. nem itens originais. | decideBudget preserva itens originais e retoma execucao após resposta, inclusive recusa complementar. | Testado em fluxo e integração REST. |
| RN08 | Orçamento dura 48 h por padrão; expirado exige reemissão. | settings.budgetValidityHours inicia em 48; budgetByToken e manutenção aplicam expiração. | Testado em fluxo: expirado não aceita resposta e exige reemissão. |
| RN09 | Link invalida após resposta ou expiração. | Resposta anula tokenHash/link; reemissão substitui token; expirado é rejeitado. | Testado em fluxo e HTTP: link antigo deixa de funcionar. |
| RN10 | Primeiro nome, placa últimos 3, chassi últimos 6, sem outros dados. | maskBudget é projeção explícita com primeiro nome, últimos 3 da placa e 6 do chassi. | Testado em unidade e HTTP, inclusive tentativa de incluir dados extras/aninhados. |
| RN11 | Não encerrar com aprovado sem execução. | assertCanClose bloqueia aprovado sem executedAt ou com data inválida, tanto ao concluir quanto encerrar. | Testado em unidade e fluxo completo REST. |
| RN12 | Baixa de estoque no apontamento de peça na O.S. | execute baixa estoque e registra saida em transação; aprovação sem execução não altera saldo. | Testado em integração REST: estorno/reaplicação, saldo insuficiente e preservação de quantidades de 0,001 unidade. |
| RN13 | Mínimo = média diária × prazo; fallback padrão e manual. | stockPolicy usa consumo líquido/ janela/ fornecedor ou prazo padrão, com sobrescrita manual inclusive zero. | Testado em unidade: histórico, estornos, limites temporais, parâmetros e separação por peça. |
| RN14 | Serviços/peças da oficina têm garantia mínima de 90 dias após fechamento. | warrantyPolicy aplica mínimo 90 dias após closedAt e respeita order.warrantyDays concedido. | Testado em unidade e REST, incluindo ampliação e limites de data. |
| RN15 | Peça do cliente não é coberta; mão de obra é. | Peça suppliedByClient não tem cobertura; serviço executado de mão de obra continua coberto. | Testado em unidade com itens de origem distinta. |
| RN16 | Garantia deferida não cobra mão de obra/peças cobertas. | warranty-order deriva somente itens covered, mantém originOrderId e zera price/total. | Testado em integração REST. |
| RN17 | Chamado fora do prazo é reclamação sem reparo gratuito. | Ao abrir chamado, vigência define garantia/reclamacao; deferimento gratuito exige cobertura. | Regra de data testada; API impede deferimento sem cobertura vigente na abertura. |
| RN18 | Informação externa só tem efeito após registro do responsável. | Registro externo exige origem configurada, ator e timestamp; não há integração com mensagens. | Testado em fluxo: origem customizada funciona e opção retirada da configuração é rejeitada. |

## Restrições — RE01 a RE06

| ID | Restrição | Tratamento local | Situação |
|---|---|---|---|
| RE01 | Minimização/finalidade de dados pessoais segundo LGPD. | Projeção pública RN10, acesso por perfil e propriedade; necessidade de política de retenção/solicitação. | Medidas técnicas implementadas; conformidade jurídica integral não certificada. |
| RE02 | Prazo de garantia deve observar CDC. | Mínimo técnico de 90 dias; somente ampliação configurável. | Testado em unidade; não constitui parecer jurídico. |
| RE03 | API REST e persistência relacional. | API REST Node.js em server/server.mjs; SQLite local e adaptador PostgreSQL/Supabase em server/postgres-store.mjs, com migração privada e relações SQL. | Implementado e testado em HTTP/persistência local. |
| RE04 | Validar entrada no cliente e servidor. | Validators Angular e validação do servidor em entities/common/domain; JSON/tipos/limites validados. | Implementado; casos de CPF, vínculo, placa, quantidade e regras testados em REST. |
| RE05 | Git e publicação em nuvem. | Repositório `Kaylu1/Pi_Unifio_2026` autorizado para versionamento do OScar; Vercel preparada, sem deploy. | **Parcial:** versionamento autorizado; publicação e homologação em nuvem pendentes. |
| RE06 | Testes automatizados de RN06, RN10, RN11 e RN13. | server/domain.test.mjs cobre as quatro regras; testes adicionais de fluxo, privacidade, REST e persistência. | 43 testes de domínio aprovados; 66 testes no conjunto completo registrado. |

## Pendências da ERS

| ID | Pendência original | Decisão inicial de implementação | Validação ainda necessária |
|---|---|---|---|
| PD01 | Definir itens da folha de verificação por serviço. | `inspectionItems` é uma lista por serviço, editável pelo gerente; a base demonstrativa contém exemplos. | Oficina aprova ou substitui os exemplos. A lista não é tratada como definição definitiva do PDF. |
| PD02 | Definir formas de manifestação de aprovação inicial. | settings.approvalMethods inicia com presencial, telefone e mensagem, editável pelo gerente; link é reservado à resposta pública. | Configuração/validação implementadas e origem substituída testada; oficina ainda deve aprovar as opções. |

## Evidências de teste executadas

`node --test server/*.test.mjs tests/api*.mjs`: **66 testes aprovados, 0 falhas** na execução registrada.

| Arquivo | Casos aprovados | Escopo |
|---|---:|---|
| `server/domain.test.mjs` | 43 | Regras puras RN06/RN10/RN11/RN13, agenda, transições e garantia. |
| `server/workflow.test.mjs` | 7 | Convite, hash, caixa restrita, orçamento e origem configurável. |
| `server/operations-privacy.test.mjs` | 6 | HTTP: sessão, CSRF, autorização, orçamento anônimo, anonimização e item inicial. |
| `tests/api.integration.mjs` | 7 | Agenda→O.S.→orçamento→estoque→garantia→relatórios, 30 sessões distintas, edição de rascunho legado e quantidades de 0,001 unidade. |
| `tests/api.persistence.mjs` | 3 | Reinício/backup/restauração, expurgo do titular em cópias e falha SMTP isolada. |

O conjunto inclui: aprovação e valores adulterados; mascaramento e ausência de dados extras; impedimento de fechamento; média líquida, estornos, fornecedor padrão, mínimo manual zero, histórico e limites de janela; garantia inclusiva; transições e recusa; conflito/adjacência de agenda e datas inválidas.

A medição de carga acima cobre 30 consultas simultâneas com usuários/sessões distintos na base fictícia local: **152 ms para o lote**, sem incluir preparação/login na janela de medição. Não comprova carga prolongada ou comportamento com dados reais.

Nenhum teste citado comprova entrega externa de e-mail, disponibilidade de 95%, conformidade jurídica integral ou compatibilidade com todas as versões de navegadores exigidas.

## Arquivos de implementação e verificação

- [Domínio e regras](../server/domain.mjs)
- [Testes de domínio](../server/domain.test.mjs)
- [Persistência e base demonstrativa](../server/store.mjs)
- [Cadastros, formulários e ações](../src/app/features/feature-pages.ts)
- [Autenticação e recuperação](../src/app/auth/auth-pages.ts)
- [Serviço da API](../src/app/core/api.service.ts)
- [Guarda de navegação](../src/app/core/auth.guard.ts)
- [Painel](../src/app/dashboard/dashboard.ts)
- [Estilos globais](../src/styles.scss)

- [API REST, sessão e manutenção](../server/server.mjs)
- [Rotas de O.S. e orçamento](../server/order-routes.mjs)
- [Cadastros, agenda, estoque e relatórios](../server/operations-routes.mjs)
- [Fluxo de orçamento](../server/workflow.mjs)
- [Anonimização e expurgo de snapshots](../server/privacy.mjs)
- [Fila de e-mail e SMTP opcional](../server/email-worker.mjs)
- [Testes HTTP de privacidade](../server/operations-privacy.test.mjs)
- [Testes de integração REST](../tests/api.integration.mjs)
- [Testes de persistência e recuperação](../tests/api.persistence.mjs)
- [Tela de O.S.](../src/app/orders/order-detail.html)
- [Orçamento público](../src/app/public/public-budget.html)

## Verificação de interface e ambiente local

O teste `tests/browser/features.smoke.mjs` concluiu **9 etapas** no navegador Chromium usando a API/SQLite reais do OScar e apenas dados fictícios. Foram exercitados cadastro/edição de cliente e veículo, CPF inválido, convite, disponibilidade e mudanças de agenda, entrada/aplicação/estorno de peças, parâmetros e anonimização. A verificação de 375 px passou sem rolagem horizontal do documento e sem erros JavaScript.

As evidências daquela rodada (resultado das 9 etapas, estoque em 375 px e agenda desktop) ficam em `tests/results/`, pasta local excluída do Git.

O ensaio do fluxo central [flow.smoke.mjs](../tests/browser/flow.smoke.mjs) foi **aprovado** com resultado local em `tests/results/flow-1792581099754/result.json`. Exercitou criação de O.S. pela interface, inspeção/achado, publicação de orçamento, resposta anônima, invalidação do link, apontamentos, bloqueio RN11, encerramento e persistência após recarregar. O resultado registra 320/1280/1920 px sem overflow e `pageErrors: []`. Isso comprova o cenário central, não a homologação de todas as rotas/formulários ou de outros navegadores.

`npm test` usa o executor nativo Node.js para testes de API, domínio e persistência. A entrega inicial desta seção tinha 66 testes; a execução de 03/11/2026 aprovou 127. A interface, guards e integração Angular são verificadas pelos testes de navegador. O scaffold permanece Angular 20 + Material 20 + NgModules + SCSS, sem SSR.

As dependências locais usam overrides de `@modelcontextprotocol/sdk` e `vite` para versões corrigidas, preservando Angular 20. A auditoria executada na finalização informou zero vulnerabilidades; isso registra a execução daquela instalação, não uma garantia permanente.
As execuções futuras de `npm run test:browser` usam [scripts/browser-tests.mjs](../scripts/browser-tests.mjs): frontend HTTPS 4212 e API 4312 por padrão, SQLite fictício separado em `data/test-runs/browser-*`. O runner atual executa seis suítes e grava seu próprio `summary.json`; somente o resumo aprovado comprova aprovação conjunta. A instância principal e sua base não são usadas por esse runner.

## Integração Supabase e preparação Vercel

O adaptador PostgreSQL reutiliza a API e regras de negócio. A migração [principal](../supabase/migrations/202610220001_oscar_private.sql) e o [complemento de solicitações](SQL_PARA_APLICAR_DEPOIS.txt) criam 21 tabelas privadas com RLS e restrição de acesso; não criam contas demonstrativas. O Supabase dedicado foi configurado em 28/10/2026 e o login do gerente foi validado. A entrada `api/index.mjs` exige as variáveis de servidor e não utiliza SQLite. Os testes `tests/postgres*.mjs` e `tests/cloud-flow.integration.mjs` usam PostgreSQL WASM local; a conexão remota foi verificada separadamente.

A RNF16 tem dois modos: cópias SQLite locais e snapshots privados PostgreSQL com manutenção diária preparada por Cron. A execução periódica real na Vercel e a retenção dos backups físicos do Supabase dependem de configuração e homologação. A RNF14 inclui expurgo dos snapshots da aplicação e preservação das exclusões na restauração; o armazenamento físico e backups do provedor têm retenção própria.

A RE05 ainda depende de publicação e homologação da aplicação na nuvem. O repositório GitHub do usuário foi autorizado para o código, enquanto o Supabase dedicado já foi configurado para uso pela API local. Os detalhes técnicos estão em [VERCEL.md](VERCEL.md) e [SUPABASE.md](SUPABASE.md).
## Gate final após a preparação Supabase/Vercel

Em 21/10/2026, `npm.cmd test` aprovou **104 testes, 0 falhas**; build e verificação local passaram. A execução conjunta de navegador daquela data passou com a base principal intacta: `data/test-runs/browser-67c74156/summary.json`. Os totais de 66 testes nas seções anteriores registram a entrega inicial. Em 03/11/2026, `npm.cmd test` aprovou **127 testes, 0 falhas**; o build passou com aviso de tamanho do bundle inicial e `npm.cmd run verify:local` passou já com Git inicializado. Limites de PostgreSQL WASM versus serviço remoto estão em [VALIDACAO.md](VALIDACAO.md) e [SUPABASE.md](SUPABASE.md).
