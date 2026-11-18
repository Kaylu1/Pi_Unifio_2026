# Documentação do OScar

Este índice reúne os documentos da API, do banco de dados e da entrega acadêmica. Para instalar e iniciar o projeto, consulte o [README principal](../README.md).

## Entrega acadêmica

| Documento | Conteúdo |
|---|---|
| [Matriz de requisitos](ACADEMICO-REQUISITOS.md) | Correspondência entre o enunciado, a implementação e as evidências |
| [Documentação da API](documentacao-api.md) | Endereços, autenticação e acesso à referência dos endpoints |
| [Referência dos endpoints](ACADEMICO-API.md) | Métodos HTTP, corpos de requisição, CRUD e códigos de resposta |
| [Modelo de dados em PNG](modelo-dados.png) | Diagrama PostgreSQL/Supabase no formato solicitado para a entrega |
| [Modelo de dados em SVG](modelo-dados.svg) · [Mermaid](modelo-dados.mmd) | Versão ampliável e fonte do diagrama |
| [Relatório de validação](ACADEMICO-VALIDACAO.md) | Ambientes, datas e resultados das verificações realizadas |
| [Roteiro de apresentação](ACADEMICO-APRESENTACAO.md) | Sequência de demonstração da API e das regras da oficina |
| [Coleção Postman](../postman/projeto-integrador.postman_collection.json) · [Instruções](../postman/README.md) | Requisições, variáveis e respostas salvas |

As substituições de Spring/JPA por Node.js/TypeScript e de MySQL por PostgreSQL/Supabase estão descritas no README principal. A matriz de requisitos também registra os pontos formais que ainda dependem do grupo e do professor.

## Configuração e arquitetura

| Documento | Conteúdo |
|---|---|
| [Supabase](SUPABASE.md) | Estrutura privada do PostgreSQL, conexão e preparo do ambiente |
| [Vercel](VERCEL.md) | Build, função da API, variáveis e conferência da implantação |
| [Decisões técnicas](DECISOES.md) | Justificativas de arquitetura e funcionamento |
| [Requisitos do sistema](REQUISITOS.md) | Funcionalidades e regras da oficina |
| [Consultas SQL](CONSULTAS-SQL.md) | Consultas do relatório, filtros e agregações |
| [Back-end](../server/README.md) | Organização das camadas e dos repositórios |
| [Testes](../tests/README.md) | Suítes disponíveis e isolamento dos ambientes |

As migrações PostgreSQL ficam em [supabase/migrations](../supabase/migrations/). O complemento de solicitações está em [SQL_PARA_APLICAR_DEPOIS.txt](SQL_PARA_APLICAR_DEPOIS.txt); o procedimento para um banco existente é explicado no guia do Supabase.

## Alternativa MySQL e registros anteriores

- [Modelo MySQL em SVG](modelo-dados-mysql.svg) · [PNG](modelo-dados-mysql.png) · [Mermaid](modelo-dados-mysql.mmd).
- [Estrutura SQL MySQL](../server/repositories/mysql-schema.sql).
- [Coleção e evidências MySQL de 11/11/2026](../postman/mysql-2026-11-11/README.md).
- [Registro anterior de validação](VALIDACAO.md).
- [Recursos de vídeo locais](VIDEO-LOCAL.md).

O modelo principal representa o PostgreSQL/Supabase. Os arquivos identificados como MySQL documentam a alternativa local, que possui sua própria organização física.
