# Desenvolvimento local

Alterações concluídas devem ser registradas em commits locais, com autoria Kaylu1.

Push, PR, deploy e alterações em bancos ou serviços externos dependem de uma nova solicitação explícita. A implementação contempla PostgreSQL/Supabase com Vercel e uma alternativa MySQL local. As revisões de código e os testes isolados são realizados no computador; uma verificação de disponibilidade remota não autoriza alterar dados de produção.

O Git registra código, testes e documentação. Dados, credenciais, dependências e executáveis locais permanecem excluídos pelo `.gitignore`.
