# Validação local do OScar

Este documento preserva resultados históricos de 21/10/2026. Depois dessa rodada, o Supabase dedicado do OScar foi conectado e verificado em 28/10/2026; em 03/11/2026, o usuário autorizou versionamento no repositório `Kaylu1/Pi_Unifio_2026`, sem publicação da aplicação. Para o estado mais recente, consulte [README.md](../README.md) e [SUPABASE.md](SUPABASE.md). Os números e afirmações abaixo descrevem as rodadas indicadas, não o estado atual completo. Logs, capturas e resultados individuais citados abaixo ficam nas pastas locais `data/` e `tests/results/`, excluídas do repositório; este documento resume as verificações.

Na rodada de 21/10/2026, arquivos Supabase/Vercel estavam apenas preparados; naquela data, nenhuma conta, banco remoto, repositório Git ou publicação havia sido criado ou conectado.

## Ambiente

- Angular Core 20.3.34; CLI 20.3.40; Angular Material/CDK 20.2.14.
- NgModules, routing, SCSS e SSR desativado.
- Node 24.19.0; SQLite no localhost e PostgreSQL WASM/PGlite nas suítes de integração.
- HTTPS no frontend e no proxy local da API; fontes e ícones locais.

## Resultados finais

| Verificação | Resultado |
|---|---|
| `npm.cmd test` | **104 testes aprovados**, 0 falhas, 0 ignorados; runner nativo Node |
| `npm.cmd run build` | Compilação Angular de produção aprovada; saída `dist/oscar/browser` |
| `npm.cmd run verify:local` | Angular/Material 20, módulos, SCSS, sem SSR/Git/publicação automática; exclusões de dados e única entrada de função conferidas |
| Auditoria de dependências | 0 vulnerabilidades na instalação final, incluindo `pg`, PGlite e `@vercel/functions` |
| `npm.cmd run test:browser` | Quatro suítes aprovadas, SQLite isolado, base principal preservada |
| Concorrência de consulta local | 30 usuários/sessões distintos abaixo de 3 segundos no cenário fictício |
| Concorrência PostgreSQL local | Duas requisições de execução: uma baixa aprovada, outra recusada, sem consumo duplicado |
| Layout observado | Painel em 320/1280/1920 px; funcionalidades e aprovação em 375 px; sem erros JavaScript nos cenários registrados |

O log local de regras/API/configuração dessa rodada registrou a cobertura dos 66 testes da primeira entrega. Foram adicionadas regressões de transação assíncrona, concorrência, login durante inativação, isolamento do SMTP, PostgreSQL e preparação serverless.

## PostgreSQL e preparação para a nuvem

A migração e o adaptador foram executados no PGlite, sem rede. Foram verificados reaplicação do SQL, 19 tabelas privadas, RLS, negação de acesso de clientes, relações, unicidade, rollback, savepoints, credenciais separadas do JSON, sessões, limites persistentes, snapshots e preservação de exclusões na restauração.

[cloud-flow.integration.mjs](../tests/cloud-flow.integration.mjs) passa pela entrada Vercel real, pelo handler compartilhado da API e pelo PostgreSQL local. Cobre login e cookie, orçamento público mascarado, aprovação e invalidação de link, bloqueio de encerramento, execução concorrente, estorno, garantia, permissões, backup/anonimização, cron autenticado e 404 em JSON. A fixture fornece um pool local: não existe conexão Supabase nesse teste.

Os testes de configuração verificam rota original/reescrita/query, corpo já processado, reutilização de pool, configuração ausente, origem/host, exclusão de arquivos privados e fallback SPA separado da API. O SQL do primeiro gerente foi executado em PostgreSQL local e testado quanto a hash, ID coerente, conteúdo SQL malicioso tratado como dado e preservação de conta existente. Nenhum SQL de administrador real foi gerado.

A regressão de SMTP usa transporte falso e comprova resposta sem aguardar envio, outra consulta durante transporte bloqueado e fila disponível para nova tentativa em caso de erro. Não comprova entrega externa.

## Navegador e evidências

O runner cria frontend HTTPS 4212/API 4312 e um SQLite fictício em `data/test-runs`. Ele encerra somente sua própria instância. A execução final durou 39,5 segundos:

- Resumo isolado: `passed:true`, `isolatedDatabase:true`, `mainDatabaseUntouched:true`.
- Fluxo principal: abertura/inspeção/achado, orçamento, aprovação pública, execução, proteção do encerramento e persistência após recarga.
- Funcionalidades: nove etapas de cadastros, convite, agenda, entrada/aplicação/estorno, parâmetros, anonimização e 375 px.
- [Acessos](../tests/browser/access.smoke.mjs): visitante protegido, cliente bloqueado nos relatórios gerenciais, escopo dos dados e logout.

A primeira execução após a adaptação encontrou uma corrida na automação: o autofoco do modal Material podia ocorrer durante o preenchimento numérico. A reprodução mínima confirmou 3/3 falhas antes da espera e 3/3 sucessos após aguardar o foco inicial. Foi corrigido somente o teste, mantendo os controles e validações. A nova execução completa passou.

As evidências e bancos de teste ficam locais e são excluídos do pacote Vercel e do repositório Git. A instância principal foi reiniciada com o mesmo banco existente em `data/oscar.sqlite`; continua em https://localhost:4201 e `/api/health` informa SQLite.

## Limites de homologação

Navegador→API foi testado com SQLite; entrada serverless→API→PostgreSQL foi testada com PGlite. Não foi testado navegador contra um Supabase real ou um domínio Vercel publicado.

Permanecem pendentes de uma publicação futura autorizada: credenciais e TLS reais, roteamento/limites do provedor, entrega SMTP, Cron remoto, política e restauração de backups do provedor, carga representativa, 95% de disponibilidade e as duas últimas versões de todos os navegadores exigidos na ERS. Snapshots lógicos no mesmo banco não substituem recuperação independente. Os arquivos preparados não significam homologação de produção.

A RE05 foi posteriormente autorizada quanto ao Git; a publicação da aplicação continua pendente. Roteiros técnicos: [Supabase](SUPABASE.md) e [Vercel](VERCEL.md).

## Referências técnicas

- [Compatibilidade Angular](https://angular.dev/reference/versions)
- [Angular CLI ng new](https://angular.dev/cli/new)
- [Angular Material 20](https://v20.material.angular.dev/guide/getting-started)
- [Conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [RLS PostgreSQL no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Runtime Node.js Vercel](https://vercel.com/docs/functions/runtimes/node-js)
- [Funções e waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)

Os requisitos de produto vieram da ERS local. As referências explicam os contratos técnicos; os resultados acima vieram das execuções locais.
## Histórico — temas e vídeo da identidade anterior (superado)

Este bloco documenta a entrega visual anterior, com paleta navy/verde petróleo e mídia procedural. As descrições de interface atual, CGI e detector vazio deste registro não se aplicam ao redesign vigente; consulte a seção grafite/branco/laranja ao final.

Em 21/10/2026, a compilação final da nova interface passou sem avisos. `npm.cmd run verify:local` passou. A execução final de navegador aprovou `flow`, `features`, `access` e a nova suíte `theme` em base própria, com `passed:true` e `mainDatabaseUntouched:true`.

Evidências históricas desta entrega:

- Fluxo de O.S.: criação, inspeção, orçamento público, execução, encerramento, persistência e 320/1280/1920 px.
- Cadastros/agenda/estoque: nove etapas aprovadas.
- Temas e vídeo: oito verificações aprovadas e 16 capturas desktop/mobile.

A nova suíte verifica reprodução local sem áudio, pausa, persistência após recarga e login, preferência inicial do sistema, prioridade da escolha manual, menus/diálogos, imagem de fallback e movimento reduzido sem download automático. Também mede contraste mínimo de 4,5:1 dos pares semânticos e das mensagens reais de erro/recuperação nos dois temas. Os cenários não registraram erros JavaScript nem pedidos a domínios externos.

A revisão visual independente encontrou contraste baixo causado por dois nomes de tokens em mensagens de autenticação; a correção foi aplicada e os estados foram testados nos dois temas. Cabeçalhos redundantes foram removidos, preservando rótulos e dados. O detector mecânico das oito folhas SCSS retornou `[]` em uma execução. As capturas usam animações finitas concluídas para evitar registrar a navegação durante uma transição de redimensionamento.

O vídeo e o pôster foram desenhados e codificados localmente, sem imagens de terceiros ou serviço de geração. São decorativos e não contêm áudio; o vídeo tem VP9/1280×800/24fps/10s e cerca de 158 KiB. [Origem e reprodução](VIDEO-LOCAL.md). A mídia e os dois temas foram verificados no Chromium desta máquina; a imagem estática permanece disponível quando o vídeo não pode iniciar.
A revisão de fechamento confirmou três ajustes: mensagens semânticas, hierarquia dos títulos e documentação do sistema visual. O último cabeçalho de O.S. foi confirmado após mover tipo/origem para a descrição, com novo fluxo aprovado e compilação sem avisos. Essa última conferência foi específica da O.S.; as quatro suítes completas são as do resumo `browser-b501583d` acima. [DESIGN.md](../DESIGN.md) foi alinhado à interface final.

## Redesign de identidade — histórico (21/10/2026)

Esta seção registra a identidade visual escolhida explicitamente pelo usuário e substitui as descrições do bloco histórico acima. A interface foi construída por código. Na rodada de 21/10/2026, somente o projeto local OScar foi alterado; ainda não havia Git, deploy ou conexão de banco remoto.

### Verificações desta entrega

- **Compilação final aprovada, sem avisos:** bundle inicial de 1,28MB e transferência estimada de 243,54kB.
- **Restrições locais aprovadas:** npm run verify:local passou após a retirada da mídia procedural da área pública.
- **Regressão completa inicial:** flow/features/access/theme aprovadas em 68,7s, banco isolado e base principal preservada.
- **Confirmação após os ajustes finais:** features/theme aprovadas em 52,0s. Esta rodada cobre os ajustes de aparência, alvos de interação e mensagens de validação; não é uma nova execução das quatro suítes.
- **Cadastros, agenda e estoque após o ajuste:** resultado local da suíte de funcionalidades.
- **Temas e vídeo após o ajuste:** oito verificações aprovadas e 16 capturas de desktop/móvel, com zero erros JavaScript e zero requisições externas.

O fluxo completo inicial cobre criação de O.S., inspeção, achado, orçamento público, resposta, execução, bloqueio de encerramento incompleto, fechamento e persistência. A rodada inicial de funcionalidades também foi registrada localmente; os resultados de aparência mais recentes são os identificados acima.

A suíte de temas verifica reprodução local sem áudio, pausa, preferência inicial do sistema, escolha manual persistente, aplicação do tema após login e em menus/diálogos, falha com poster e formulário disponível, movimento reduzido sem download automático e reprodução manual. Mede contraste mínimo de 4,5:1 nos pares semânticos e nas mensagens reais de login/recuperação dos dois temas. Isso comprova os cenários executados em Chromium; não representa auditoria completa de acessibilidade ou homologação de todos os navegadores.

### Mídia e sistema visual atuais

O fundo é **filmagem real genérica de reparo de motor**, Mixkit item 4716, servida pelo próprio projeto como MP4 H.264 de 11s, 1280 × 720, 24fps, sem áudio, 1.742.115 bytes, com poster WebP. A origem, licença, preparação, checksum e evidências de movimento/loop estão em [VIDEO-LOCAL.md](VIDEO-LOCAL.md). O conteúdo procedural anterior foi arquivado fora da área pública; não integra o acesso atual.

[DESIGN.md](../DESIGN.md) documenta os estilos finais: grafite/branco/laranja, Manrope/DM Sans locais, superfícies de conteúdo de 16px, navegação de 22px/19px, botões Material20 de 11px, dados planos com contornos e elevação nos módulos que a utilizam. Movimento finito inclui entrada do acesso, revelação de elementos novos e barras; movimento reduzido remove esses efeitos.

Os ajustes finais ampliaram para 44px os atalhos de métricas, a ação do painel de fluxo e o alternador interno, inclusive no móvel; unificaram os cantos de conteúdo em 16px; retiraram sombras de superfícies de dados; corrigiram o tracking do título e a sombra de hover do acesso; e tornaram as mensagens de validação específicas ao campo sem alterar os validadores.

### Limite do detector mecânico

O detector foi executado uma vez para este redesign e informou **DEGRADED**, por ausência de htmlparser2, css-select, css-tree e domutils. O fallback por regex não avalia matching, custom properties nem contraste computado. A saída visível tinha alertas design-system-* comparando a nova interface ao DESIGN.md anterior, então em substituição; o output integral foi truncado e não foi preservado como relatório completo.

Essa limitação do detector não equivale a uma auditoria mecânica plena. As verificações de navegador descritas acima são independentes dela. Os limites de homologação de produção continuam válidos.

A revisão final confirmou cinco ajustes após corrigir também uma regressão no tamanho dos ícones do catálogo. A conferência específica mediu seis ícones de 24 × 24px, centralizados em blocos de 46 × 46px, sem erros JavaScript ou requisições externas; a captura móvel de 375px foi renovada. A compilação citada acima foi repetida depois dessa correção e passou sem avisos. Não houve nova execução completa das suítes de navegador após o ajuste exclusivo dos ícones; a conclusão é restrita aos ajustes revisados.

## Entrega vigente — avaliação, agenda e interfaces por tarefa (21/10/2026)

Esta seção substitui as descrições históricas das telas, preservando os limites de homologação de nuvem e navegadores já registrados.

- **108 testes aprovados:** regras, API, avaliação, estoque, permissões e PostgreSQL local, sem falhas ou testes ignorados. Quatro regressões de avaliação verificam finalidade/preço configuráveis, histórico, fluxo HTTP, bloqueios e migração idempotente.
- **Cinco suítes de navegador aprovadas:** flow/features/access/theme/layouts em 85,8s, com SQLite isolado. A correção da corrida necessidade→orçamento já está nessa execução; o teste atrasa a recarga da O.S. em 180ms para exercitá-la.
- **Confirmação dos três ajustes visuais:** somente a suíte layouts foi repetida após o lote. O resultado local registrou 18 capturas, foco/visibilidade dos painéis no celular, catálogo, preço configurado de R$ 317,45, necessidade pendente sem baixar estoque, preenchimento confirmado pela API e agenda em 320/375px sem overflow. Zero erros JavaScript e zero requisições externas nos cenários registrados. Não foi uma nova execução das cinco suítes ou dos 108 testes após esse lote visual.
- **Compilação aprovada com aviso:** bundle inicial de 1,35MB e transferência estimada de 262,18kB. Excede o aviso de 1,30MB em 51,8kB e permanece abaixo do erro de 1,50MB. O limite não foi ampliado. A consolidação dos componentes de cadastro reduziu o bundle inicial de 1,48MB para 1,35MB.
- **Uso local confirmado:** `npm run verify:local` passou. O reinício confirmou o mesmo SQLite, contagens preservadas nas dez tabelas e conteúdo intacto nas nove sem migração. Somente os metadados do diagnóstico demonstrativo foram atualizados; seu preço de R$ 150 foi preservado. Agenda, catálogo, API e vídeo responderam 200 em localhost:4201. Naquela rodada, ainda não havia Git, deploy nem banco remoto.

A revisão independente confirmou três ajustes: seleção mobile revela/foca a ficha ou serviço, orientação de rolagem aparece antes da grade e tracking novo do catálogo respeita -.04em. Não houve regressão observada nesse lote; a conclusão é restrita aos ajustes pontuados. A confirmação intermediária exigia alinhamento do título nos primeiros 300px, impossível perto do fim do documento sem espaço artificial; o teste foi corrigido para exigir o título inteiro dentro da janela, com foco, sem novo ajuste de produto.

Os detectores usados nas subtarefas de agenda e avaliação informaram DEGRADED por falta de parsers locais; não equivalem a auditoria computada completa. Os testes de navegador e a revisão visual são evidências independentes. [DESIGN.md](../DESIGN.md) foi atualizado a partir dos estilos finais. A mídia continua sendo o arquivo local documentado em [VIDEO-LOCAL.md](VIDEO-LOCAL.md).
