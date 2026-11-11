# Requisitos da atividade de backend

O domínio é o da oficina OScar. O professor autorizou a substituição de Spring Boot e JPA por Node.js e TypeScript, conforme informado pelo grupo. Esta matriz mantém os objetivos da atividade e indica onde demonstrá-los.

| Critério | Implementação e evidência |
|---|---|
| Modelagem e relacionamentos — 0,8 | Doze entidades reais e duas tabelas associativas no MySQL. PK, FK, índices e checks em [mysql-schema.sql](../server/repositories/mysql-schema.sql). [Diagrama](modelo-dados.svg). |
| CRUD — 1,2 | Criação, listagem, consulta por ID, atualização e exclusão nas rotas documentadas em [API](ACADEMICO-API.md). Exclusão respeita o histórico operacional: inativação, cancelamento, anonimização ou remoção de rascunho. |
| Camadas — 1,3 | Controller → Services → Repository. O controller recebe a requisição e chama os serviços; o acesso ao MySQL fica no repositório. |
| Regras — 1,3 | Agenda sem sobreposição; aprovação antes de executar; saldo de estoque suficiente; bloqueio de conclusão com item aprovado não executado. Casos de conflito estão na coleção. |
| Validação e erros — 0,9 | Validação no servidor, erro de domínio próprio e tratamento central. Exemplos reais de 400, 404 e 409 na coleção. |
| Consultas personalizadas — 0,4 | Agenda filtrada por data/mecânico e peças abaixo do mínimo, além do relatório de serviços e consumo. |
| Autenticação/autorização — 1,4 | HTTP Basic para API/Postman, contas de teste de gerente e mecânico, regras por perfil e demonstrações de 401/403. A interface mantém sessão segura. |
| Testes e evidências — 0,8 | [Coleção Postman](../postman/projeto-integrador.postman_collection.json), variáveis incluídas e respostas capturadas da fixture MySQL. Registro de execução em postman/evidencias.json. |
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

appointment_services e order_items resolvem relações entre as entidades. Audit, emails, settings, sessions, reset_tokens, backups e tombstones são registros de suporte; não são entidades acrescentadas para atingir o mínimo da atividade.

## Como conferir

Execute a coleção na fixture oscar_test. Ela interrompe a captura se qualquer status divergir do esperado e só então grava os exemplos. Os testes de MySQL verificam a persistência e os relacionamentos. Os testes do navegador verificam o caminho Angular → API → banco.

Os resultados descrevem os cenários executados localmente. A aprovação da avaliação continua dependendo da demonstração e da compreensão do grupo.
