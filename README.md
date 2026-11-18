# OScar — Sistema de Gestão de Oficinas

Projeto Integrador do curso de Engenharia de Software, desenvolvido para apoiar o gerenciamento de oficinas automotivas. O sistema integra clientes, veículos, agendamentos, ordens de serviço, inspeções, orçamentos, estoque de peças e atendimento de pós-venda.

O objetivo do back-end é disponibilizar uma API REST que coordene o atendimento, aplique as regras da oficina e mantenha a integridade dos registros no MySQL. A interface Angular consome essa API para acompanhar o atendimento desde a solicitação até o encerramento da ordem de serviço.

## Adequação tecnológica ao enunciado

Conforme autorização concedida pelo professor ao grupo, a implementação originalmente prevista com **Spring Boot e Spring Data JPA foi adaptada para Node.js e TypeScript**. Os requisitos funcionais, a arquitetura em camadas, o banco MySQL, a autenticação HTTP Basic e as evidências de testes foram mantidos.

| Responsabilidade prevista no enunciado | Implementação adotada no OScar |
|---|---|
| API REST com Spring Boot | Node.js, com os módulos nativos `node:http` e `node:https`, executando o código TypeScript |
| Persistência e consultas com Spring Data JPA | Repositórios com SQL parametrizado e transações, utilizando o driver **`mysql2`**, pela interface assíncrona `mysql2/promise` |
| Bean Validation | Validação no servidor de campos obrigatórios, formatos, limites numéricos e relacionamentos, implementada em `entities.ts`, `common.ts` e nos serviços |
| Tratamento centralizado de exceções | Classe `DomainError` e tratamento central no `ApiController`, com mensagens e códigos HTTP apropriados |
| Spring Security com HTTP Basic | Autenticação HTTP Basic no `AuthService` e validações de permissão por perfil nos serviços, por meio de `allow()` em `common.ts` |

O processamento HTTP utiliza os recursos nativos do Node.js. A biblioteca `mysql2` é responsável pela comunicação com o MySQL; os mapeamentos e as consultas são definidos nos repositórios do projeto. O Angular permanece responsável pelo front-end.

## Tecnologias utilizadas

| Tecnologia | Utilização |
|---|---|
| Node.js 24 | Execução da API e módulos nativos de HTTP, HTTPS e criptografia |
| TypeScript 5.9 | Implementação do back-end, contratos e modelos; verificação estática em modo estrito |
| Angular 20 e Angular Material | Interface, formulários, navegação e componentes visuais |
| MySQL Community 8.4 e `mysql2/promise` | Persistência relacional, chaves estrangeiras, consultas parametrizadas e transações |
| Postman Collection v2.1 e Newman | Organização das requisições, exemplos de respostas e reprodução da coleção |
| Node.js Test Runner e Playwright | Testes de domínio, integração e interface |

## Integrantes

| Nome completo | RA |
|---|---|
| Caio Eduardo Sapata Bruno | 270667 |
| Gabriel Claudino Martins Silva | 272425 |
| João Lucas Terçariol | 270959 |
| Luis Felipi Ferreira | 273194 |
| Lucas Henrique Benitez de Moraes | 272807 |

## Configuração e execução local

O preparo automatizado foi desenvolvido para Windows com Node.js 24. O MySQL Community 8.4 é executado em `127.0.0.1:3307`, com diretório de dados exclusivo do OScar. No diretório raiz do projeto, execute:

~~~powershell
npm.cmd ci
node scripts/mysql-local.mjs setup
npm.cmd start
~~~

O preparo do MySQL é necessário apenas na primeira execução. O comando npm start inicia o MySQL local, a API e o Angular. Abra **https://localhost:4201**; a API atende em **https://127.0.0.1:4301/api**. O certificado de desenvolvimento é local e pode exigir confirmação no primeiro acesso.

Para conferir o banco:

~~~powershell
node scripts/mysql-local.mjs status
~~~

Os dados da oficina ficam no schema **oscar_local**. Testes e evidências usam **oscar_test**. A configuração e os arquivos do servidor MySQL ficam em data/mysql-local; as senhas do banco permanecem nessa pasta local e não entram na coleção Postman.

A execução é limitada ao computador. As instruções antigas de Supabase e Vercel em docs são histórico de outra etapa e não são necessárias para esta entrega.

## Autenticação e contas de demonstração

As contas da base demonstrativa inicial utilizam a senha **Oscar@2026!**. Essas credenciais são destinadas exclusivamente aos testes e à apresentação.

| Perfil | E-mail |
|---|---|
| Gerente | gerente@oscar.local |
| Atendente | atendente@oscar.local |
| Mecânico | mecanico@oscar.local |
| Consultor técnico | consultor@oscar.local |
| Cliente | cliente@oscar.local |

A interface usa sessão em cookie HttpOnly e proteção CSRF. A mesma API também aceita **HTTP Basic**, usado pela coleção Postman. O gerente administra cadastros e relatórios; o mecânico consulta seus atendimentos e aponta inspeção e execução. Um usuário sem autenticação recebe 401; um usuário autenticado sem a permissão necessária recebe 403.

## Organização do código

O Angular continua responsável pela interface. O backend em TypeScript separa as responsabilidades:

~~~text
server/
  controllers/api-controller.ts       entrada HTTP e respostas
  services/application-service.ts     encaminhamento dos casos de uso
  services/crud-service.ts            gerenciamento e integridade dos registros
  services/auth-service.ts            credenciais, HTTP Basic e sessões
  repositories/mysql-repository.ts    comandos e transações no MySQL
  repositories/mysql-schema.sql       tabelas, índices, checks e chaves estrangeiras
  repositories/security-repository.ts persistência de credenciais, sessões e recuperação
  contracts.ts                       contratos usados pelas camadas
  models.ts                          interfaces das entidades da oficina
  domain.ts                          regras de domínio e erros
  entities.ts                        validação dos cadastros
~~~

O controller chama os serviços; a autenticação é tratada pelo AuthService, e os serviços usam o contrato do repositório. Validação de entrada, conflitos e recursos inexistentes passam pelo tratamento central de erros. Os módulos mantidos para SQLite atendem à regressão local; a persistência da entrega acadêmica é MySQL.

## Modelagem e regras da oficina

O banco tem doze entidades de domínio: clientes, veículos, usuários, serviços, fornecedores, peças, solicitações, agendamentos, ordens, orçamentos, movimentações e chamados. Duas tabelas associativas registram os serviços de cada agendamento e os itens das ordens.

[Diagrama de dados](docs/modelo-dados.svg) · [Imagem PNG](docs/modelo-dados.png) · [Fonte Mermaid](docs/modelo-dados.mmd) · [Estrutura SQL](server/repositories/mysql-schema.sql)

As colunas usadas em relacionamentos e consultas são relacionais. Campos JSON preservam detalhes e retratos históricos, como itens aprovados, inspeções e evolução do atendimento. Alterar o preço no catálogo não reescreve o valor já aprovado em uma O.S.

Regras de negócio verificadas:

- Um mecânico não pode ter dois agendamentos que se sobreponham.
- Uma peça só sai do estoque durante a execução de um item aprovado, e o saldo não pode ficar negativo.
- A O.S. não pode ser concluída com itens aprovados ainda sem execução.
- Um orçamento publicado depende da decisão do cliente para liberar os itens pendentes.
- Cadastros e atendimentos com histórico são inativados ou cancelados; rascunhos sem efeito operacional podem ser removidos. A exclusão de dados pessoais do cliente usa anonimização.

As consultas personalizadas consultam a agenda por data e mecânico e as peças abaixo do estoque mínimo. O relatório cruza clientes, veículos e ordens e totaliza o consumo de peças.

## Atendimento aos requisitos e documentação da API

[Documentação dos endpoints](docs/ACADEMICO-API.md) · [Requisitos da atividade](docs/ACADEMICO-REQUISITOS.md) · [Roteiro para apresentar](docs/ACADEMICO-APRESENTACAO.md)

A [matriz de requisitos](docs/ACADEMICO-REQUISITOS.md) relaciona cada critério do enunciado à implementação e à evidência correspondente. Ela também distingue os requisitos técnicos verificados das etapas formais de apresentação e entrega.

A coleção fica em **postman/projeto-integrador.postman_collection.json**. Ela inclui autenticação, CRUD das entidades, consultas, regras, validação, erros 400/404/409/401/403 e o fluxo de aprovação e execução da oficina. As variáveis têm seus valores incluídos no JSON; as credenciais são somente de teste.

As respostas salvas são capturadas de uma fixture MySQL local, sem usar o banco principal. A forma de gerar e importar as evidências está em [postman/README.md](postman/README.md). Após importar no Postman, use **Examples** para examinar as respostas e **Save Response → Save as example** para renovar uma evidência manualmente.

~~~powershell
node scripts/postman-evidence.mjs
node scripts/academic-fixture.mjs
~~~

O primeiro comando captura as respostas e encerra a fixture. O segundo a reabre em **http://127.0.0.1:4302/api** para enviar as requisições pelo Postman. Eles usam apenas oscar_test e não devem rodar ao mesmo tempo.

## Verificação do projeto

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:mysql
npm.cmd run build
npm.cmd run test:browser:mysql
~~~

Os testes utilizam dados isolados. A suíte `test:browser:mysql` verifica o fluxo Angular → API TypeScript → MySQL. A suíte adicional `test:browser` utiliza SQLite para regressão. As evidências da coleção estão em `postman/evidencias.json`; os cenários de navegador abrangem catálogo, confirmação, agenda, inspeção, orçamento público, estoque, encerramento e permissões.

A captura de 11/11/2026 gravou **87 respostas reais**. A mesma coleção foi executada pelo Newman, com **87 requisições e 87 verificações aprovadas**, sem falha. Veja [o registro dessa execução](docs/ACADEMICO-VALIDACAO.md).

Na conferência de **18/11/2026**, a verificação estrita do TypeScript, os **148 testes gerais**, os **10 testes em MySQL real** e o build do Angular foram aprovados. As evidências históricas e os pontos formais de apresentação estão discriminados na [matriz de requisitos](docs/ACADEMICO-REQUISITOS.md).

Na execução local, as mensagens de e-mail ficam disponíveis na caixa do gerente. A demonstração utiliza o MySQL do próprio computador.

## Entrega acadêmica

Repositório do grupo: [Kaylu1/Pi_Unifio_2026](https://github.com/Kaylu1/Pi_Unifio_2026).

Os materiais de entrega compreendem este README, o código-fonte, o modelo de dados, a documentação da API e a coleção Postman com variáveis e exemplos de respostas. Conforme o enunciado, um integrante deverá submeter o link do repositório na atividade **Projeto Integrador**, no Ambiente Conhecer. Todos os integrantes deverão estar preparados para explicar a modelagem, as camadas, as regras e os testes apresentados.
