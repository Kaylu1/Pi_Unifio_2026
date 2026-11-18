# OScar — Visão do produto

Sistema acadêmico de gestão de oficinas automotivas, desenvolvido no Projeto Integrador da UNIFIO conforme a ERS OScar 1.4. Atende aos perfis de gerente, atendente, mecânico, consultor técnico e cliente.

O produto acompanha o atendimento desde a solicitação do cliente até o pós-venda: confirmação do agendamento, abertura da ordem de serviço, inspeção, orçamento, aprovação, execução, movimentação de peças, reposição de estoque, garantia e relatórios.

A interface utiliza Angular 20, Angular Material e SCSS. A API REST é implementada em Node.js e TypeScript, com os módulos nativos HTTP/HTTPS e separação entre controllers, serviços e repositórios.

| Ambiente | Execução e persistência |
|---|---|
| Publicado | Angular e API na Vercel, com PostgreSQL no Supabase exclusivo do OScar e driver `pg` |
| Desenvolvimento local padrão | Angular e API locais, com MySQL e driver `mysql2/promise` |
| Testes isolados | PostgreSQL local/PGlite e SQLite para cenários de integração e regressão |

O código é mantido em [Kaylu1/Pi_Unifio_2026](https://github.com/Kaylu1/Pi_Unifio_2026). A publicação e a autenticação foram verificadas em 18/11/2026; os resultados e seus limites estão no [relatório de validação](docs/ACADEMICO-VALIDACAO.md). Instruções de execução e materiais acadêmicos estão no [README](README.md).
