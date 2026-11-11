# API local do OScar

Base na aplicação: **https://localhost:4201/api**. API direta: **https://127.0.0.1:4301/api**. O proxy Angular usa a mesma origem do navegador.

No Postman, configure **Authorization → Basic Auth** com uma conta fictícia. Gerente: gerente@oscar.local; mecânico: mecanico@oscar.local. Senha demonstrativa: Oscar@2026!. O Angular usa sessão em cookie HttpOnly e token CSRF; o Basic não depende de login prévio.

## Respostas HTTP

| Código | Significado no OScar |
|---|---|
| 200 | Consulta, atualização, inativação ou cancelamento concluído. |
| 201 | Registro criado. |
| 204 | Rascunho ou registro sem efeito operacional removido. |
| 400 | Campos inválidos, ausentes ou em formato incorreto. |
| 401 | Ausência de autenticação ou credencial incorreta. |
| 403 | Perfil autenticado sem permissão. |
| 404 | Recurso inexistente ou fora do escopo do usuário. |
| 409 | Conflito com integridade ou regra da oficina. |

Erros retornam uma mensagem compreensível. A API não devolve hash de senha nas respostas dos usuários.

## CRUD dos cadastros

Os recursos abaixo oferecem GET da coleção, GET por ID, POST, PUT por ID e DELETE por ID. O prefixo é sempre /api.

| Recurso | Escrita | Exclusão |
|---|---|---|
| /clients | Gerente/atendente | Gerente anonimiza os dados pessoais; exige corpo com confirmation igual a ANONIMIZAR. |
| /vehicles | Gerente/atendente | Inativa o veículo e preserva as ordens anteriores. |
| /users | Gerente | Inativa o acesso; impede inativar a própria conta e remover o último gerente. |
| /services | Gerente | Inativa no catálogo e mantém valores históricos nas ordens. |
| /suppliers | Gerente | Inativa o fornecedor. |
| /parts | Gerente | Inativa a peça, preservando saldo e movimentos históricos. |

Exemplo de serviço:

~~~json
{
  "name": "Inspeção de freios",
  "description": "Conferência de desgaste, fluido e funcionamento.",
  "purpose": "execucao",
  "price": 120,
  "durationMinutes": 30,
  "inspectionItems": ["Pastilhas e discos", "Fluido de freio"]
}
~~~

## Atendimento, estoque e pós-venda

| Recurso | Criar | Listar / consultar | Atualizar | Excluir |
|---|---|---|---|---|
| Agendamento | POST /appointments | GET /appointments e /appointments/:id | PUT /appointments/:id, com motivo | DELETE /appointments/:id cancela se ainda não atendido |
| O.S. | POST /orders | GET /orders e /orders/:id | PUT /orders/:id enquanto aberta, sem execução | DELETE /orders/:id cancela rascunho elegível |
| Orçamento | POST /budgets ou /orders/:id/budgets | GET /budgets e /budgets/:id | PUT /budgets/:id em rascunho | DELETE /budgets/:id em rascunho |
| Entrada de estoque | POST /stock/entries | GET /movements e /movements/:id | PUT /movements/:id corrige entrada elegível | DELETE /movements/:id desfaz entrada ainda não consumida |
| Solicitação | POST /service-requests ou /public/service-requests | GET /service-requests e /service-requests/:id | PUT /service-requests/:id | DELETE /service-requests/:id cancela |
| Chamado | POST /tickets | GET /tickets e /tickets/:id | PUT /tickets/:id | DELETE /tickets/:id, aberto e sem decisão/O.S. de garantia |

Operações que já produziram execução, aprovação, garantia ou consumo não são apagadas livremente. A resposta de conflito explica a condição que impede a alteração.

## Consultas personalizadas

| Endpoint | Uso |
|---|---|
| GET /queries/appointments?date=2026-11-18&mechanicId=3 | Agenda daquele mecânico na data informada. |
| GET /queries/parts/low-stock | Peças ativas com saldo no mínimo ou abaixo dele. |
| GET /availability?date=2026-11-18&serviceIds=1,2 | Horários que comportam todos os serviços e não conflitam com a agenda. |
| GET /reports?from=2026-11-01&to=2026-11-30 | Serviços executados, receita e consumo de peças no período; gerente. |

Datas acima são exemplos. A coleção gera uma data futura adequada para o ensaio.

## Operações do fluxo da oficina

| Endpoint | Comportamento |
|---|---|
| POST /service-requests/:id/confirm | Confirma um pedido do catálogo em uma vaga real e vincula cliente, veículo e agendamento. |
| POST /orders/:id/status | Avança a etapa, respeitando aprovação e execução dos itens. |
| POST /orders/:id/items | Inclui item autorizado enquanto a O.S. está aberta. |
| POST /orders/:id/inspection | Registra o resultado de um item da inspeção. |
| POST /orders/:id/findings | Registra necessidade encontrada durante inspeção/execução. |
| POST /budgets/:id/publish | Disponibiliza proposta com prazo e link próprio. |
| POST /budgets/:id/decisions | Registra decisão por item com autoria e origem. |
| POST /orders/:id/execute | Aponta execução; peça aprovada baixa estoque na mesma transação. |
| POST /orders/:id/reverse | Estorna aplicação durante execução e devolve saldo. |
| GET /budgets/:id/pdf | Gera o PDF do orçamento autorizado ao usuário. |

A coleção tem exemplos com corpos completos e respostas reais. Para compreender a sequência, consulte o [roteiro](ACADEMICO-APRESENTACAO.md).
