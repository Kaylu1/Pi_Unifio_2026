# Requisitos da atividade de backend

O domínio é o da oficina OScar. Conforme informado pelo grupo, o professor autorizou a substituição de Spring Boot/JPA por Node.js/TypeScript e também de MySQL por PostgreSQL/Supabase. Esta matriz mantém os objetivos funcionais da atividade e indica onde demonstrá-los.

O back-end utiliza os módulos nativos `node:http` e `node:https`. A implantação Vercel utiliza o driver `pg` e o PostgreSQL do Supabase. O adaptador MySQL local usa `mysql2/promise`. Ambos implementam o contrato de repositório e compartilham os serviços TypeScript.

| Critério | Implementação e evidência |
|---|---|
| Modelagem e relacionamentos — 0,8 | Doze entidades reais no PostgreSQL, com PKs, FKs, JSONB, índices e restrições nas [migrações](../supabase/migrations/202610220001_oscar_private.sql). [Diagrama PostgreSQL](modelo-dados.svg). A alternativa MySQL possui [modelo próprio](modelo-dados-mysql.svg). |
| CRUD — 1,2 | Criação, listagem, consulta por ID, atualização e exclusão nas rotas documentadas em [API](ACADEMICO-API.md). Exclusão respeita o histórico operacional: inativação, cancelamento, anonimização ou remoção de rascunho. |
| Camadas — 1,3 | Controller → Services → Repository. O controller recebe a requisição e chama os serviços; cada repositório implementa o acesso ao banco correspondente. A Vercel injeta o adaptador PostgreSQL. |
| Regras — 1,3 | Agenda sem sobreposição; aprovação antes de executar; saldo de estoque suficiente; bloqueio de conclusão com item aprovado não executado. Casos de conflito estão na coleção. |
| Validação e erros — 0,9 | Validação no servidor, erro de domínio próprio e tratamento central. Exemplos reais de 400, 404 e 409 na coleção. |
| Consultas personalizadas — 0,4 | Agenda filtrada por data/mecânico e peças abaixo do mínimo, além do relatório de serviços e consumo. |
| Autenticação/autorização — 1,4 | HTTP Basic para API/Postman, contas de teste de gerente e mecânico, regras por perfil e demonstrações de 401/403. A interface mantém sessão segura. |
| Testes e evidências — 0,8 | [Coleção Postman](../postman/projeto-integrador.postman_collection.json), variáveis incluídas e respostas capturadas de API isolada. O registro de cada execução identifica o adaptador e a data. |
| Funcionalidade do PI — 0,9 | Atendimento da oficina com orçamento, aprovação, execução e baixa de estoque transacional. |
| Documentação — 1,0 | README com integrantes/RAs, execução, tecnologias, modelo de dados, endpoints, coleção e roteiro de demonstração. |

## Entidades e responsabilidade

| Entidade | Por que existe |
|---|---|
| clients | Titular do atendimento e dos veículos. |
| vehicles | Veículo do cliente, identificado por placa/chassi. |
| users | Funcionários e clientes com credenciais e perfil. |
| services | Catálogo de serviços, duração, preço e itens de inspeção. |
| suppliers | Origem das peças e prazo de reposição. |
| parts | Peças, custo, preço, saldo e mínimo. |
| service_requests | Dados que o cliente enviou pelo catálogo, antes da confirmação da equipe. |
| appointments | Reserva de data, horário e mecânico para um atendimento. |
| orders | Registro central da execução do atendimento. |
| budgets | Proposta complementar e decisões do cliente. |
| movements | Entradas, saídas e estornos do estoque. |
| tickets | Reclamação ou pedido de análise após a entrega. |

No PostgreSQL, listas de serviços, itens e inspeções são componentes JSONB dos agregados. As tabelas associativas appointment_services e order_items pertencem apenas ao modelo MySQL. Audit, emails, settings, sessions, reset_tokens, backups e tombstones são registros de suporte; não são entidades acrescentadas para atingir o mínimo da atividade.

## Como conferir

Execute a coleção na fixture PostgreSQL local por `npm.cmd run postman:postgres`. O executor interrompe a captura se qualquer status divergir do esperado e só então grava os exemplos. A alternativa MySQL usa `oscar_test`. As fixtures não acessam o Supabase hospedado. Os testes do navegador verificam o caminho Angular → API → banco escolhido.

Os resultados descrevem os cenários executados localmente. A aprovação da avaliação continua dependendo da demonstração e da compreensão do grupo.

## Conferência de 18/11/2026

| Verificação executada novamente | Resultado |
|---|---|
| TypeScript em modo estrito | Sem erros |
| Suíte geral de testes após correção do adaptador PostgreSQL | 158 aprovados, nenhuma falha |
| Integração com MySQL Community 8.4.13 | 10 aprovados, nenhuma falha |
| Build do Angular e verificação de CSP | Aprovados; permanece o aviso de tamanho do pacote inicial |
| Coleção Postman PostgreSQL e reprodução Newman, após inclusão do exemplo manual | 87 requisições, 88 exemplos, 28 variáveis preenchidas e 87 verificações aprovadas |
| Save Response no aplicativo Postman | GET de serviços retornou 200; um exemplo manual foi salvo e incorporado ao JSON, totalizando 88 respostas |
| Navegador com PostgreSQL local | Cinco suítes aprovadas |
| Função JavaScript compilada e testes de entrada da Vercel | Nove testes aprovados, incluindo o novo teste que bloqueia dependência dos fontes originais |
| API publicada após a correção do pacote | Health, login do gerente, sessão e logout responderam 200 |
| HTTP Basic e consultas no ambiente publicado | Consulta de usuários e as duas consultas personalizadas responderam 200; 15 usuários ativos em três perfis |

A tabela apresenta as verificações de 18/11. O [relatório de validação](ACADEMICO-VALIDACAO.md) identifica o ambiente e a data de cada prova e distingue as fixtures locais da observação da API publicada.

## Situação formal da entrega

- **Projeto-base do professor — confirmação pendente:** o enunciado exige utilizar o e-commerce disponibilizado em aula como ponto de partida. Em 18/11, o grupo informou que ainda não confirmou a dispensa desse requisito. A autorização para trocar as tecnologias não comprova, por si, autorização para utilizar uma implementação própria. O código e o histórico examinados não comprovam derivação direta do repositório Java; esse ponto precisa ser esclarecido com o professor antes de declarar atendimento integral ao enunciado.
- **Uso do aplicativo Postman — demonstrado:** em 18/11, o grupo executou a consulta de serviços no Postman 12.37.2, recebeu 200 e utilizou **Save Response**. O novo exemplo apareceu na interface e foi gravado em arquivo. A [evidência manual](../postman/evidencias-manuais/Listar-servicos.example.yaml) foi incorporada à coleção JSON v2.1. Essa observação comprova uma operação manual; as demais 87 respostas permanecem identificadas como captura automatizada.
- **Entrega e apresentação:** a submissão do link no Ambiente Conhecer e a compreensão individual do código não podem ser comprovadas por testes automatizados. Essas etapas devem ser realizadas pelo grupo.

Esses pontos são distintos da presença das funcionalidades e dos arquivos exigidos. A matriz não afirma procedência do código ou ações manuais que não foram verificadas.

## Estrutura e disponibilidade da nuvem

A estrutura sugerida é adaptável: `package.json`/`package-lock.json` correspondem ao manifesto do projeto Node; `server/` contém o back-end, `tests/` seus testes, `src/` o Angular e `api/index.ts` a entrada serverless. Os caminhos `docs/modelo-dados.png`, `docs/documentacao-api.md` e `postman/projeto-integrador.postman_collection.json` existem. O README apresenta a árvore e a correspondência completa.

Em 18/11, o erro inicial 503 foi reproduzido no pacote da Vercel: os arquivos JavaScript mantinham referências a fontes TypeScript ausentes. O commit `32e1e61` corrigiu a entrada e a reescrita de extensões. Após a implantação, `/api/health` respondeu 200 com `mode: cloud` e `database: postgres`; login, consulta da sessão e logout do gerente também responderam 200. A consulta autenticada por HTTP Basic confirmou 15 usuários ativos e os perfis gerente, mecânico e cliente. As consultas personalizadas de agenda e reposição responderam 200.

## Parecer da revisão do enunciado

A revisão do código, da modelagem, da coleção e das evidências não identificou lacuna técnica comprovada nos dez critérios de pontuação, considerando as substituições tecnológicas autorizadas. A coleção possui 87 requisições, 88 respostas salvas e 28 variáveis preenchidas, incluindo um exemplo manual do aplicativo. A versão atual foi novamente reproduzida pelo Newman com 87 verificações aprovadas; o hash da coleção corresponde ao relatório atual.

O atendimento integral ainda depende do esclarecimento sobre o projeto-base e das etapas de demonstração e entrega descritas acima. Este parecer não atribui nota nem substitui a avaliação do professor.
