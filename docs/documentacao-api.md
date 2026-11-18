# Documentação da API do OScar

A API REST do OScar é implementada em Node.js e TypeScript. O Angular envia as requisições para `/api` na mesma origem da aplicação. As rotas são compartilhadas pelos adaptadores de execução local e da Vercel.

## Endereços e persistência

| Ambiente | URL-base | Persistência |
|---|---|---|
| Implantação configurada na Vercel | `https://pi-unifio-2026.vercel.app/api` | PostgreSQL do projeto Supabase exclusivo do OScar |
| Aplicação Angular local | `https://localhost:4201/api` | MySQL local, pelo proxy do Angular |
| API local direta | `https://127.0.0.1:4301/api` | MySQL local |
| Base isolada PostgreSQL da coleção | `http://127.0.0.1:4302/api` | PostgreSQL local PGlite, com as migrações do Supabase |
| Base alternativa MySQL da coleção | `http://127.0.0.1:4302/api` | `oscar_test`; iniciar apenas um executor por vez |

O endereço da Vercel identifica o ambiente de implantação; a disponibilidade e a versão efetivamente publicada devem ser verificadas na conferência do deploy. O navegador acessa a API, e o servidor mantém a conexão privada com o banco.

## Referências

- [Endpoints, corpos de requisição, CRUD e códigos HTTP](ACADEMICO-API.md).
- [Coleção Postman com variáveis e exemplos de respostas](../postman/projeto-integrador.postman_collection.json).
- [Execução e importação da coleção no Postman](../postman/README.md).
- [Matriz de atendimento aos requisitos](ACADEMICO-REQUISITOS.md).
- [Registros das verificações executadas](ACADEMICO-VALIDACAO.md).
- [Modelo físico PostgreSQL/Supabase](modelo-dados.svg) e [fonte Mermaid](modelo-dados.mmd).
- [Modelo físico MySQL local](modelo-dados-mysql.svg).

## Autenticação

A API aceita HTTP Basic e valida permissões conforme o perfil do usuário. A interface Angular utiliza sessão em cookie HttpOnly e proteção CSRF. Os casos de ausência de autenticação e falta de permissão retornam `401` e `403`, respectivamente.

As contas de demonstração e a senha incluídas na coleção pertencem à base de testes local. Cada ambiente utiliza seus próprios usuários; as credenciais do banco permanecem somente no servidor.

## Estrutura do repositório

Este arquivo mantém o nome `docs/documentacao-api.md` sugerido no enunciado e direciona para a referência detalhada dos endpoints. No projeto Node.js, `package.json` e `package-lock.json` definem dependências e comandos; `server/` contém o código do back-end, `tests/` reúne os testes e `src/` contém a aplicação Angular.
